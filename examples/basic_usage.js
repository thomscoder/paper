const { ClipboardMonitor } = require("../build/Release/clipboard_monitor");
const fs = require("fs").promises;
const path = require("path");
const { useTranscription } = require("./plugins/useTranscription");
const { useImageExtractor } = require("./plugins/useImageExtractor");
const { useLogText } = require("./plugins/useLogText");
const { useHistory, historyManager } = require("./plugins/useHistory");
const { useReplaceText } = require("./plugins/useReplaceText");

const outputDir = path.join(__dirname, "clipboard_output");

async function writeToClipboard(content) {
  const monitor = new ClipboardMonitor();
  try {
    const success = monitor.writeToClipboard(content);
    if (!success) {
      console.error("Failed to write to clipboard");
    }
    return success;
  } catch (error) {
    console.error("Error writing to clipboard:", error);
    return false;
  }
}

async function processClipboardContent(content) {
  const { type, data } = content;
  await useHistory({ type, data });

  try {
    switch (type) {
      case "audio_file":
        const transcription = await useTranscription(data);
        // write transcription back to clipboard
        await writeToClipboard({ type: "text", data: transcription });
        break;

      case "text":
        if (process.argv.includes("--replace")) {
          const replaceIndex = process.argv.indexOf("--replace");
          if (replaceIndex < process.argv.length - 1) {
            const replacements = process.argv[replaceIndex + 1];
              const modifiedText = useReplaceText(data, replacements);
            await writeToClipboard({ type: "text", data: modifiedText.toString() });
          }
        } else {
          useLogText(data);
        }
        break;

      case "image":
        const processedImage = await useImageExtractor(data);
        // write processed image back to clipboard
        if (processedImage) {
          await writeToClipboard({ type: "image", data: processedImage });
        }
        break;

      case "files":
        console.log("📁 Files copied");
        break;

      default:
        console.log("❓ Unknown content copied");
    }
  } catch (error) {
    console.error("Error processing clipboard content:", error);
  }
}

async function initialize() {
  try {
    await fs.mkdir(outputDir, { recursive: true });
    const monitor = new ClipboardMonitor();

    if (process.argv.includes("--watch")) {
      // watch mode
      monitor.startMonitoring(async (content) => {
        await processClipboardContent(content);
      });

      process.on("SIGINT", () => {
        console.log("Stopping clipboard monitor...");
        console.log(historyManager.getHistory());
        monitor.stopMonitoring();
        process.exit();
      });

      console.log("Monitoring clipboard. Press Ctrl+C to exit.");
    } else {
      monitor.readClipboard(async (content) => {
        await processClipboardContent(content);
        process.exit(0);
      });
    }

    console.log(`Clipboard contents will be saved to: ${outputDir}`);
  } catch (error) {
    console.error("Initialization error:", error);
    process.exit(1);
  }
}

initialize();
