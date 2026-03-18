// tests/pathValidation.test.js
// Unit tests for validateProjectPath and validateClaudePath middleware helpers

import { describe, it, expect } from 'vitest';
import path from 'path';
import os from 'os';
import { validateProjectPath, validateClaudePath, ApiError } from '../middleware/pathValidation.js';

const TMP = os.tmpdir();

describe('validateProjectPath', () => {
  describe('happy path', () => {
    it('should return the resolved absolute path for a valid path', () => {
      const result = validateProjectPath(TMP);
      expect(path.isAbsolute(result)).toBe(true);
    });

    it('should resolve a relative path to an absolute path', () => {
      const result = validateProjectPath('.');
      expect(path.isAbsolute(result)).toBe(true);
    });
  });

  describe('error cases', () => {
    it('should throw ApiError(400) for empty string', () => {
      expect(() => validateProjectPath('')).toThrow(ApiError);
      try { validateProjectPath(''); } catch (e) {
        expect(e.statusCode).toBe(400);
      }
    });

    it('should throw ApiError(400) for whitespace-only string', () => {
      expect(() => validateProjectPath('   ')).toThrow(ApiError);
    });

    it('should throw ApiError(400) for non-string input', () => {
      expect(() => validateProjectPath(null)).toThrow(ApiError);
      expect(() => validateProjectPath(undefined)).toThrow(ApiError);
      expect(() => validateProjectPath(123)).toThrow(ApiError);
    });
  });
});

describe('validateClaudePath', () => {
  describe('happy path', () => {
    it('should accept a path inside one of the allowed base directories', () => {
      const allowed = [TMP];
      const filePath = path.join(TMP, 'test.txt');
      const result = validateClaudePath(filePath, allowed);
      expect(result).toBe(path.resolve(filePath));
    });

    it('should accept a deeply nested path inside an allowed base', () => {
      const allowed = [TMP];
      const filePath = path.join(TMP, 'a', 'b', 'c', 'file.md');
      const result = validateClaudePath(filePath, allowed);
      expect(path.isAbsolute(result)).toBe(true);
    });

    it('should accept the base directory path itself', () => {
      const allowed = [TMP];
      const result = validateClaudePath(TMP, allowed);
      expect(result).toBe(path.resolve(TMP));
    });

    it('should match against multiple allowed bases', () => {
      const base1 = path.join(TMP, 'dir1');
      const base2 = path.join(TMP, 'dir2');
      const filePath = path.join(base2, 'file.txt');
      const result = validateClaudePath(filePath, [base1, base2]);
      expect(result).toBe(path.resolve(filePath));
    });
  });

  describe('path traversal rejection', () => {
    it('should reject ../../../etc/passwd style traversal', () => {
      const allowed = [path.join(TMP, 'project')];
      const malicious = path.join(TMP, 'project', '..', '..', 'etc', 'passwd');
      expect(() => validateClaudePath(malicious, allowed)).toThrow(ApiError);
    });

    it('should reject a path that shares a name prefix with the base (suffix attack)', () => {
      // /tmp/project-evil should NOT be allowed when base is /tmp/project
      const baseDir = path.join(TMP, 'project');
      const evilPath = path.join(TMP, 'project-evil', 'file.txt');
      expect(() => validateClaudePath(evilPath, [baseDir])).toThrow(ApiError);
    });

    it('should reject a path outside all allowed directories', () => {
      const allowed = [path.join(TMP, 'project')];
      const outside = path.join(os.homedir(), '.ssh', 'id_rsa');
      expect(() => validateClaudePath(outside, allowed)).toThrow(ApiError);
      try { validateClaudePath(outside, allowed); } catch (e) {
        expect(e.statusCode).toBe(400);
      }
    });

    it('should reject when allowedBaseDirs is empty', () => {
      const filePath = path.join(TMP, 'file.txt');
      expect(() => validateClaudePath(filePath, [])).toThrow(ApiError);
    });
  });
});

describe('ApiError', () => {
  it('should carry the correct statusCode', () => {
    const err = new ApiError(404, 'Not found');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err.name).toBe('ApiError');
  });

  it('should be an instance of Error', () => {
    const err = new ApiError(400, 'Bad request');
    expect(err).toBeInstanceOf(Error);
  });
});
