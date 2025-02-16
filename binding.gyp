{
  "targets": [{
    "target_name": "clipboard_monitor",
    "sources": [ "src/clipboard_monitor.mm" ],
    "include_dirs": [
      "<!@(node -p \"require('node-addon-api').include\")"
    ],
    "dependencies": [
      "<!(node -p \"require('node-addon-api').gyp\")"
    ],
    "cflags!": [ "-fno-exceptions" ],
    "cflags_cc!": [ "-fno-exceptions" ],
    "xcode_settings": {
      "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
      "CLANG_ENABLE_OBJC_ARC": "YES",
      "OTHER_CFLAGS": [ "-ObjC++" ],
      "MACOSX_DEPLOYMENT_TARGET": "10.13"
    },
    "link_settings": {
      "libraries": [
        "-framework AppKit"
      ]
    }
  }]
}