// server/middleware/pathValidation.js
// Path traversal prevention (SEC-03, SEC-04).

import path from 'path';

// ---------------------------------------------------------------------------
// ApiError — used by the global error handler in index.js
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// validateProjectPath
// Resolves and validates an arbitrary user-supplied path.
// Returns the resolved absolute path, or throws ApiError(400) if invalid.
// ---------------------------------------------------------------------------
export function validateProjectPath(inputPath) {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    throw new ApiError(400, 'Invalid path');
  }

  const resolved = path.resolve(inputPath);

  // Belt-and-suspenders: reject if the resolved path contains '..'
  // (path.resolve should never return '..' segments, but guard anyway)
  if (resolved.includes('..')) {
    throw new ApiError(400, 'Invalid path');
  }

  // Must be absolute after resolution
  if (!path.isAbsolute(resolved)) {
    throw new ApiError(400, 'Invalid path');
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// validateClaudePath
// Like validateProjectPath but also enforces that the resolved path is
// contained within one of the provided allowedBaseDirs.
// ---------------------------------------------------------------------------
export function validateClaudePath(inputPath, allowedBaseDirs) {
  const resolved = validateProjectPath(inputPath);

  const isAllowed = allowedBaseDirs.some((baseDir) => {
    const normalizedBase = path.resolve(baseDir);
    // Ensure the resolved path starts with the base dir followed by a separator
    // (prevents "/allowed/dir-evil" matching base "/allowed/dir")
    return (
      resolved === normalizedBase ||
      resolved.startsWith(normalizedBase + path.sep)
    );
  });

  if (!isAllowed) {
    throw new ApiError(400, 'Path outside allowed directory');
  }

  return resolved;
}
