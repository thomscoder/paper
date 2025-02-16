const fs = require("fs").promises;
const path = require("path");
const { execSync } = require("child_process");
const { nodewhisper } = require("nodejs-whisper");

const outputDir = path.join(__dirname, "..", "clipboard_output");

const useTranscription = async (data) => {
  try {
    const sourceFiles = Array.isArray(data) ? data : [data];
    for (const sourcePath of sourceFiles) {
      const extension = path.extname(sourcePath).slice(1);
      const destPath = await copyFile(sourcePath, extension);
      console.log("🔊 Audio file saved:", destPath);

      // get file stats
      const stats = await fs.stat(sourcePath);
      console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

      console.log("🎯 Starting local transcription...");
      try {
        const transcription = await transcribeAudio(
          destPath
        );
        console.clear()
        const transcriptionText = extractText(transcription);
        console.log("🎉 Transcription completed:\n", transcriptionText);
        return transcriptionText
      } catch (transcriptionError) {
        console.error("Failed to transcribe audio:", transcriptionError);
      }
    }
  } catch (err) {
    console.error("Error processing audio file:", err);
  }
};

async function transcribeAudio(filepath) {
  try {
    console.log("Starting transcription...");

    // convert audio to WAV format for whisper
    const wavPath = filepath.replace(/\.[^/.]+$/, ".wav");
    if (path.extname(filepath).toLowerCase() !== ".wav") {
      console.log("Converting audio to WAV format...");
      execSync(
        `ffmpeg -i "${filepath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}"`
      );
    }

    const fileToTranscribe =
      path.extname(filepath).toLowerCase() === ".wav" ? filepath : wavPath;

    const transcription = await nodewhisper(fileToTranscribe, {
      modelName: "large-v3-turbo",
      autoDownloadModelName: "large-v3-turbo",
      removeWavFileAfterTranscription: true,
      logger: console,
      whisperOptions: {
        outputInJson: false,
        outputInText: false,
        translateToEnglish: false,
        wordTimestamps: false,
        timestamps_length: 20,
        splitOnWord: true,
      },
    });
    
    return transcription;

  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}


const extractText = (subtitleText) => {

  const lines = subtitleText.split('\n');
  return lines
    .filter(line => line.trim())
    .map(line => {
      // remove the timestamp part [00:00:00.000 --> 00:00:00.000]
      const textPart = line.replace(/\[\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}\]/, '')
      return textPart.trim();
    })
    .join(' ');
};

const copyFile = async (srcPath, extension) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `clipboard_${timestamp}.${extension}`;
  const destPath = path.join(outputDir, filename);
  await fs.copyFile(srcPath, destPath);
  return destPath;
};

module.exports = { useTranscription };
