#include <napi.h>
#include <AppKit/AppKit.h>
#include <dispatch/dispatch.h>
#include <vector>

class ClipboardMonitor : public Napi::ObjectWrap<ClipboardMonitor> {
private:
    static Napi::FunctionReference constructor;
    Napi::ThreadSafeFunction tsfn;
    NSPasteboard* pasteboard;
    NSInteger lastChangeCount;
    dispatch_source_t timer;
    bool isMonitoring;

    /**
     * Converts an NSData object to a C++ vector for easier handling in Node.js
     * @param data The NSData object to convert
     * @return A vector containing the bytes from the NSData object
     */
    std::vector<uint8_t> NSDataToVector(NSData* data) {
        const uint8_t* bytes = static_cast<const uint8_t*>([data bytes]);
        return std::vector<uint8_t>(bytes, bytes + [data length]);
    }

    /**
     * Checks if a file path represents an audio file based on its extension
     * @param path The file path to check
     * @return true if the file has an audio extension, false otherwise
     */
    bool isAudioFile(NSString* path) {
        NSString* extension = [[path pathExtension] lowercaseString];
        NSArray* audioExtensions = @[@"m4a", @"mp3", @"wav", @"aac", @"aiff", @"caf"];
        return [audioExtensions containsObject:extension];
    }

    /**
     * Retrieves and formats the current clipboard content
     * @param pboard The pasteboard to read from
     * @return A Node.js object containing the clipboard content and type information
     * 
     * Supported content types:
     * - text: Plain text content
     * - image: Image data (converted to PNG format)
     * - files: File paths
     * - audio_file: Audio file paths (special case of files)
     * - unknown: Unrecognized content type
     */
    Napi::Object GetClipboardContent(NSPasteboard* pboard) {
        Napi::Env env = Env();
        Napi::Object content = Napi::Object::New(env);
        
        // check if it is text
        if (NSString* text = [pboard stringForType:NSPasteboardTypeString]) {
            content.Set("type", "text");
            content.Set("data", std::string([text UTF8String]));
            return content;
        }
        
        // check if it has image content
        if (NSImage* image = [[NSImage alloc] initWithPasteboard:pboard]) {
            content.Set("type", "image");
            NSSize size = [image size];
            content.Set("width", size.width);
            content.Set("height", size.height);
            
            // convert image to png
            NSBitmapImageRep* bitmap = [NSBitmapImageRep imageRepWithData:[image TIFFRepresentation]];
            NSData* pngData = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
            
            if (pngData) {
                std::vector<uint8_t> imageBytes = NSDataToVector(pngData);
                Napi::Buffer<uint8_t> buffer = Napi::Buffer<uint8_t>::Copy(env, imageBytes.data(), imageBytes.size());
                content.Set("data", buffer);
                content.Set("format", "png");
            }
            return content;
        }
        
        // check if it has files
        if (NSArray* urls = [pboard readObjectsForClasses:@[[NSURL class]] options:nil]) {
            if ([urls count] > 0) {
                bool hasAudioFiles = false;
                for (NSURL* url in urls) {
                    if (isAudioFile([url path])) {
                        hasAudioFiles = true;
                        break;
                    }
                }

                if (hasAudioFiles) {
                    content.Set("type", "audio_file");
                } else {
                    content.Set("type", "files");
                }

                Napi::Array fileArray = Napi::Array::New(env);
                for (NSUInteger i = 0; i < [urls count]; i++) {
                    NSURL* url = urls[i];
                    fileArray.Set(i, std::string([[url path] UTF8String]));
                }
                content.Set("data", fileArray);
                return content;
            }
        }


        content.Set("type", "unknown");
        content.Set("data", "unknown-content");
        return content;
    }

    /**
     * Internal method to clean up monitoring resources
     * Cancels the timer and releases the thread-safe function
     */
    void StopMonitoringInternal() {
        if (timer) {
            dispatch_source_cancel(timer);
            timer = nullptr;
        }
        if (tsfn) {
            tsfn.Release();
        }
        isMonitoring = false;
    }

public:
    /**
     * Initializes the module and defines the ClipboardMonitor class
     * @param env The N-API environment
     * @param exports The exports object to attach the class to
     * @return The modified exports object
     */
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::HandleScope scope(env);

        Napi::Function func = DefineClass(env, "ClipboardMonitor", {
            InstanceMethod("startMonitoring", &ClipboardMonitor::StartMonitoring),
            InstanceMethod("stopMonitoring", &ClipboardMonitor::StopMonitoring),
            InstanceMethod("readClipboard", &ClipboardMonitor::ReadClipboard),
            InstanceMethod("writeToClipboard", &ClipboardMonitor::WriteToClipboard),
        });

        constructor = Napi::Persistent(func);
        constructor.SuppressDestruct();

        exports.Set("ClipboardMonitor", func);
        return exports;
    }


    /**
     * Constructor for the ClipboardMonitor class
     * Initializes the pasteboard connection and internal state
     */
    ClipboardMonitor(const Napi::CallbackInfo& info) 
        : Napi::ObjectWrap<ClipboardMonitor>(info) {
        pasteboard = [NSPasteboard generalPasteboard];
        lastChangeCount = [pasteboard changeCount];
        timer = nullptr;
        isMonitoring = false;
    }

    /**
     * Destructor ensures monitoring is stopped when the object is destroyed
     */
    ~ClipboardMonitor() {
        if (isMonitoring) {
            StopMonitoringInternal();
        }
    }

    /**
     * Writes content to the clipboard
     * 
     * Supporting:
     * - text
     * - images
     * - files
     */
    Napi::Value WriteToClipboard(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::Error::New(env, "Content object expected");
        }

        Napi::Object content = info[0].As<Napi::Object>();
        
        if (!content.Has("type") || !content.Has("data")) {
            throw Napi::Error::New(env, "Content must have 'type' and 'data' properties");
        }

        std::string type = content.Get("type").As<Napi::String>().Utf8Value();
        bool success = false;

        [pasteboard clearContents];

        if (type == "text") {
            std::string text = content.Get("data").As<Napi::String>().Utf8Value();
            NSString* nsText = [NSString stringWithUTF8String:text.c_str()];
            success = [pasteboard setString:nsText forType:NSPasteboardTypeString];
        }
        else if (type == "image") {
            Napi::Buffer<uint8_t> buffer = content.Get("data").As<Napi::Buffer<uint8_t>>();
            NSData* imageData = [NSData dataWithBytes:buffer.Data() length:buffer.Length()];
            NSImage* image = [[NSImage alloc] initWithData:imageData];
            
            if (image) {
                success = [pasteboard writeObjects:@[image]];
            }
        }
        else if (type == "files") {
            Napi::Array paths = content.Get("data").As<Napi::Array>();
            NSMutableArray* urls = [NSMutableArray arrayWithCapacity:paths.Length()];
            
            for (uint32_t i = 0; i < paths.Length(); i++) {
                std::string path = paths.Get(i).As<Napi::String>().Utf8Value();
                NSURL* url = [NSURL fileURLWithPath:@(path.c_str())];
                [urls addObject:url];
            }
            
            success = [pasteboard writeObjects:urls];
        }

        return Napi::Boolean::New(env, success);
    }

    /**
     * Reads the current clipboard content
     * @param info Contains the callback function to be called with the clipboard content
     * @return undefined
     */
    Napi::Value ReadClipboard(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (info.Length() < 1 || !info[0].IsFunction()) {
            throw Napi::Error::New(env, "Callback function expected");
        }

        Napi::Function callback = info[0].As<Napi::Function>();
        Napi::Object content = GetClipboardContent(pasteboard);
        callback.Call({content});

        return env.Undefined();
    }

    /**
     * Starts monitoring the clipboard for changes
     * @param info Contains the callback function to be called when changes are detected
     * @return undefined
     * 
     * The monitoring is done using a high-frequency timer (0.1 second intervals)
     * that checks the pasteboard's change count. When a change is detected,
     * the callback is invoked with the new clipboard content.
     */
    Napi::Value StartMonitoring(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (info.Length() < 1 || !info[0].IsFunction()) {
            throw Napi::Error::New(env, "Callback function expected");
        }

        if (isMonitoring) {
            return env.Undefined();
        }

        tsfn = Napi::ThreadSafeFunction::New(
            env,
            info[0].As<Napi::Function>(),
            "Clipboard Callback",
            0,
            1
        );

        dispatch_queue_t queue = dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0);
        timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, queue);
        
        dispatch_source_set_timer(timer, 
            dispatch_time(DISPATCH_TIME_NOW, 0), 
            0.1 * NSEC_PER_SEC, 
            0.05 * NSEC_PER_SEC);
        
        dispatch_source_set_event_handler(timer, ^{
            NSInteger newChangeCount = [pasteboard changeCount];
            
            if (newChangeCount != lastChangeCount) {
                lastChangeCount = newChangeCount;
                
                auto callback = [this](Napi::Env env, Napi::Function jsCallback) {
                    Napi::Object content = GetClipboardContent(pasteboard);
                    jsCallback.Call({content});
                };
                
                tsfn.NonBlockingCall(callback);
            }
        });
        
        dispatch_resume(timer);
        isMonitoring = true;

        return env.Undefined();
    }

    /**
     * Stops monitoring the clipboard
     * @param info N-API callback info (unused)
     * @return undefined
     */
    Napi::Value StopMonitoring(const Napi::CallbackInfo& info) {
        StopMonitoringInternal();
        return info.Env().Undefined();
    }
};

Napi::FunctionReference ClipboardMonitor::constructor;

/**
 * Module initialization function
 * Required by NODE_API_MODULE
 */
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    return ClipboardMonitor::Init(env, exports);
}

NODE_API_MODULE(clipboard_monitor, Init)