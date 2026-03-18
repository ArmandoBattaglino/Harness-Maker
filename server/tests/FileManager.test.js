// tests/FileManager.test.js
// Unit tests for FileManager: path traversal rejection, read, write

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileManager } from '../services/FileManager.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('FileManager', () => {
  let fm;
  let tmpDir;

  beforeEach(async () => {
    fm = new FileManager();
    // Create a fresh temp dir for each test
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fm-test-'));
  });

  afterEach(async () => {
    // Clean up temp dir
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // validatePath — path traversal rejection (SEC-03, SEC-04)
  // ---------------------------------------------------------------------------
  describe('validatePath — path traversal rejection', () => {
    it('should accept a path directly inside allowedBase', () => {
      const filePath = path.join(tmpDir, 'file.txt');
      expect(() => fm.validatePath(filePath, tmpDir)).not.toThrow();
    });

    it('should accept a deeply nested path inside allowedBase', () => {
      const filePath = path.join(tmpDir, 'sub', 'dir', 'file.txt');
      expect(() => fm.validatePath(filePath, tmpDir)).not.toThrow();
    });

    it('should accept allowedBase itself as the path', () => {
      // Edge: path === base should be allowed (directory read)
      expect(() => fm.validatePath(tmpDir, tmpDir)).not.toThrow();
    });

    it('should reject a path using ../../../etc/passwd traversal', () => {
      // Simulate a classic path traversal attempt
      const maliciousPath = path.join(tmpDir, '..', '..', 'etc', 'passwd');
      expect(() => fm.validatePath(maliciousPath, tmpDir)).toThrow(/Path traversal detected/);
    });

    it('should reject a path that shares a prefix but escapes the base directory', () => {
      // /tmp/fm-test-XYZ-sibling should NOT be allowed when base is /tmp/fm-test-XYZ
      const siblingDir = tmpDir + '-evil';
      const escapePath = path.join(siblingDir, 'file.txt');
      expect(() => fm.validatePath(escapePath, tmpDir)).toThrow(/Path traversal detected/);
    });

    it('should reject an absolute path outside allowedBase', () => {
      const outsidePath = path.join(os.homedir(), 'secret.txt');
      expect(() => fm.validatePath(outsidePath, tmpDir)).toThrow(/Path traversal detected/);
    });

    it('should return the resolved absolute path on success', () => {
      const filePath = path.join(tmpDir, 'file.txt');
      const result = fm.validatePath(filePath, tmpDir);
      expect(path.isAbsolute(result)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // readFile
  // ---------------------------------------------------------------------------
  describe('readFile', () => {
    it('should read an existing file', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      await fs.promises.writeFile(filePath, 'hello world', 'utf8');
      const content = await fm.readFile(filePath, tmpDir);
      expect(content).toBe('hello world');
    });

    it('should throw ENOENT for a non-existent file', async () => {
      const filePath = path.join(tmpDir, 'missing.txt');
      await expect(fm.readFile(filePath, tmpDir)).rejects.toThrow(/ENOENT/);
    });

    it('should reject path traversal on read', async () => {
      const escapePath = path.join(tmpDir, '..', 'outside.txt');
      await expect(fm.readFile(escapePath, tmpDir)).rejects.toThrow(/Path traversal detected/);
    });
  });

  // ---------------------------------------------------------------------------
  // writeFile
  // ---------------------------------------------------------------------------
  describe('writeFile', () => {
    it('should write content to a new file atomically', async () => {
      const filePath = path.join(tmpDir, 'output.txt');
      await fm.writeFile(filePath, 'test content', tmpDir);
      const written = await fs.promises.readFile(filePath, 'utf8');
      expect(written).toBe('test content');
    });

    it('should create parent directories if they do not exist', async () => {
      const filePath = path.join(tmpDir, 'subdir', 'nested', 'file.txt');
      await fm.writeFile(filePath, 'nested content', tmpDir);
      const written = await fs.promises.readFile(filePath, 'utf8');
      expect(written).toBe('nested content');
    });

    it('should overwrite an existing file', async () => {
      const filePath = path.join(tmpDir, 'overwrite.txt');
      await fm.writeFile(filePath, 'original', tmpDir);
      await fm.writeFile(filePath, 'updated', tmpDir);
      const written = await fs.promises.readFile(filePath, 'utf8');
      expect(written).toBe('updated');
    });

    it('should reject path traversal on write', async () => {
      const escapePath = path.join(tmpDir, '..', 'evil.txt');
      await expect(fm.writeFile(escapePath, 'evil', tmpDir)).rejects.toThrow(/Path traversal detected/);
    });
  });

  // ---------------------------------------------------------------------------
  // listDirectory
  // ---------------------------------------------------------------------------
  describe('listDirectory', () => {
    it('should list files in a directory', async () => {
      await fs.promises.writeFile(path.join(tmpDir, 'a.md'), '', 'utf8');
      await fs.promises.writeFile(path.join(tmpDir, 'b.md'), '', 'utf8');
      const entries = await fm.listDirectory(tmpDir, tmpDir);
      expect(entries).toContain('a.md');
      expect(entries).toContain('b.md');
    });

    it('should return empty array for non-existent directory', async () => {
      const nonExistent = path.join(tmpDir, 'does-not-exist');
      const entries = await fm.listDirectory(nonExistent, tmpDir);
      expect(entries).toEqual([]);
    });
  });
});
