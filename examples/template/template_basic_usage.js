const { ClipboardMonitor } = require("../build/Release/clipboard_monitor");
const fs = require("fs").promises;
const path = require("path");
const { useHistory, historyManager } = require("./plugins/useHistory");

// create output directory for saved files
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
        // Your audio file processing logic
        break;

      case "text":
        // Your text processing logic
        break;

      case "image":
        // Your image processing logic
        break;

      case "files":
        // Your file processing logic
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

// start the application
initialize();
