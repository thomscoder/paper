const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");

const historyDir = path.join(__dirname, "..", "clipboard_history");
const historyIndexPath = path.join(historyDir, "history_index.json");

class ClipboardHistory {
  constructor() {
    this.historyIndex = [];
    this.maxEntries = 1000;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      await fs.mkdir(historyDir, { recursive: true });
      try {
        const indexData = await fs.readFile(historyIndexPath, "utf-8");
        this.historyIndex = JSON.parse(indexData);
      } catch (err) {
        this.historyIndex = [];
        await this.saveIndex();
      }
      this.initialized = true;
    } catch (err) {
      console.error("Failed to initialize clipboard history:", err);
      throw err;
    }
  }

  async saveIndex() {
    await fs.writeFile(
      historyIndexPath,
      JSON.stringify(this.historyIndex, null, 2)
    );
  }

  generateId(content) {
    const timestamp = new Date().toISOString();
    const hash = crypto
      .createHash("md5")
      .update(JSON.stringify(content))
      .digest("hex")
      .slice(0, 8);
    return `${timestamp}-${hash}`;
  }

  async saveBinaryData(id, data, extension) {
    const filename = `${id}${extension}`;
    const filepath = path.join(historyDir, filename);
    await fs.writeFile(filepath, data);
    return filename;
  }

  async addEntry({ type, data }) {
    await this.initialize();

    try {
      const id = this.generateId({ type, data });
      let storedData = data;
      let metadata = {};

      switch (type) {
        case "image":
          const imageFile = await this.saveBinaryData(id, data, ".png");
          storedData = imageFile;
          metadata.size = data.length;
          break;

        case "audio_file":
        case "files":
          metadata.count = Array.isArray(data) ? data.length : 1;
          metadata.paths = Array.isArray(data) ? data : [data];
          storedData = metadata.paths;
          break;

        case "text":
          metadata.length = data.length;
          if (data.length > 500) {
            metadata.preview = data.slice(0, 500) + "...";
          }
          break;
      }

      const entry = {
        id,
        type,
        timestamp: new Date().toISOString(),
        data: storedData,
        metadata,
      };

      this.historyIndex.unshift(entry);
      if (this.historyIndex.length > this.maxEntries) {
        const removed = this.historyIndex.pop();
        if (removed.type === "image") {
          const filepath = path.join(historyDir, removed.data);
          await fs.unlink(filepath).catch(() => {});
        }
      }

      await this.saveIndex();
      return entry;
    } catch (err) {
      console.error("Failed to add history entry:", err);
      throw err;
    }
  }

  // get full history
  async getHistory() {
    await this.initialize();
    return this.historyIndex;
  }

  // get entries by type
  async getEntriesByType(type) {
    await this.initialize();
    return this.historyIndex.filter((entry) => entry.type === type);
  }

  // search entries
  async searchEntries(query) {
    await this.initialize();
    query = query.toLowerCase();

    return this.historyIndex.filter((entry) => {
      if (entry.type === "text") {
        return entry.data.toLowerCase().includes(query);
      }
      if (entry.metadata.paths) {
        return entry.metadata.paths.some((path) =>
          path.toLowerCase().includes(query)
        );
      }
      return false;
    });
  }

  // get entry by ID
  async getEntry(id) {
    await this.initialize();
    return this.historyIndex.find((entry) => entry.id === id);
  }

  // clear history
  async clearHistory() {
    await this.initialize();

    for (const entry of this.historyIndex) {
      if (entry.type === "image") {
        const filepath = path.join(historyDir, entry.data);
        await fs.unlink(filepath).catch(() => {});
      }
    }

    this.historyIndex = [];
    await this.saveIndex();
  }
}

const historyManager = new ClipboardHistory();

const useHistory = async (content) => {
  try {
    return await historyManager.addEntry(content);
  } catch (err) {
    console.error("Error adding to clipboard history:", err);
  }
};

module.exports = { useHistory, historyManager };
