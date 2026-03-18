// server/services/FileManager.js
// Centralised atomic file I/O with path-traversal protection (SEC-03, SEC-04).
// All public methods validate filePath stays inside allowedBase before acting.

import fs from 'fs';
import path from 'path';
import writeFileAtomic from 'write-file-atomic';

export class FileManager {
  /**
   * Resolve filePath and assert it is contained within allowedBase.
   * Throws Error if the resolved path escapes the base directory.
   * Returns the resolved absolute path.
   *
   * @param {string} filePath  - Path to validate (may be relative or absolute)
   * @param {string} allowedBase - The root directory the path must stay inside
   * @returns {string} resolved absolute path
   */
  validatePath(filePath, allowedBase) {
    const resolved = path.resolve(filePath);
    const base = path.resolve(allowedBase);

    if (resolved !== base && !resolved.startsWith(base + path.sep)) {
      throw new Error(`Path traversal detected: ${filePath} is outside ${allowedBase}`);
    }

    return resolved;
  }

  /**
   * Read a file as UTF-8 text.
   * @param {string} filePath
   * @param {string} allowedBase
   * @returns {Promise<string>}
   */
  async readFile(filePath, allowedBase) {
    const resolved = this.validatePath(filePath, allowedBase);
    return fs.promises.readFile(resolved, 'utf8');
  }

  /**
   * Write content to a file atomically (write-file-atomic).
   * Creates parent directories if needed.
   * @param {string} filePath
   * @param {string} content
   * @param {string} allowedBase
   * @returns {Promise<void>}
   */
  async writeFile(filePath, content, allowedBase) {
    const resolved = this.validatePath(filePath, allowedBase);
    // Ensure parent directories exist before writing
    await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
    return writeFileAtomic(resolved, content, { encoding: 'utf8' });
  }

  /**
   * Delete a single file.
   * @param {string} filePath
   * @param {string} allowedBase
   * @returns {Promise<void>}
   */
  async deleteFile(filePath, allowedBase) {
    const resolved = this.validatePath(filePath, allowedBase);
    return fs.promises.unlink(resolved);
  }

  /**
   * List entries in a directory.
   * Returns an empty array if the directory does not exist (instead of throwing).
   * @param {string} dirPath
   * @param {string} allowedBase
   * @returns {Promise<string[]>}
   */
  async listDirectory(dirPath, allowedBase) {
    const resolved = this.validatePath(dirPath, allowedBase);
    try {
      return await fs.promises.readdir(resolved);
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  /**
   * Create directory (and any missing parents).
   * @param {string} dirPath
   * @param {string} allowedBase
   * @returns {Promise<void>}
   */
  async ensureDirectory(dirPath, allowedBase) {
    const resolved = this.validatePath(dirPath, allowedBase);
    return fs.promises.mkdir(resolved, { recursive: true });
  }
}

export const fileManager = new FileManager();
