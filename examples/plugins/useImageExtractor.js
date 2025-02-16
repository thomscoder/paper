const path = require("path");
const fs = require("fs").promises;
const getPixels = require("get-pixels");
const { extractColors } = require("extract-colors");

const outputDir = path.join(__dirname, "..", "clipboard_output");

const useImageExtractor = async (data) => {
  try {
    // we will recieve buffer
    if (Buffer.isBuffer(data)) {
      // we save the buffer as a png file
      // reconstructing the image
      const timestamp = new Date().getTime();
      const imagePath = path.join(
        outputDir,
        `clipboard_image_${timestamp}.png`
      );
      await fs.writeFile(imagePath, data);

      // Process the image to extract colors
      return new Promise((resolve, reject) => {
        getPixels(imagePath, (err, pixels) => {
          if (err) {
            console.error("Error reading pixels:", err);
            reject(err);
            return;
          }

          const pixelData = [...pixels.data];
          const [width, height] = pixels.shape;

          extractColors({
            data: pixelData,
            width,
            height,
          })
            .then((colors) => {
              console.log("📸 Image saved and analyzed:", imagePath);
              console.log("🎨 Extracted colors:", colors);
              resolve(colors);
            })
            .catch((err) => {
              console.error("Error extracting colors:", err);
              reject(err);
            });
        });
      });
    }
    // if we copy a image path we reconstruct the image
    // by copying that to dest folder
    else if (Array.isArray(data)) {
      const imageFiles = data.filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return [".png", ".jpg", ".jpeg", ".gif", ".bmp"].includes(ext);
      });

      if (imageFiles.length === 0) {
        console.log("No image files found in clipboard data");
        return;
      }

      for (const imagePath of imageFiles) {
        const filename = path.basename(imagePath);
        const destPath = path.join(outputDir, filename);

        await fs.copyFile(imagePath, destPath);
        console.log(`📸 Image saved: ${destPath}`);
      }
    }
  } catch (err) {
    console.error("Error processing image:", err);
  }
};

module.exports = { useImageExtractor };
