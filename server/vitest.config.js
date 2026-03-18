// server/vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Run tests sequentially to avoid cross-test PTY interference
    pool: 'forks',
    testTimeout: 10000,
    include: ['tests/**/*.test.js'],
    reporters: ['verbose'],
  },
});
