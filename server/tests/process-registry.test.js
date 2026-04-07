import { describe, it, expect } from 'vitest';
import { isValidPid } from '../services/ProcessRegistry.js';

describe('ProcessRegistry PID validation', () => {
  it('accepts valid positive integer PIDs beyond 65535', () => {
    expect(isValidPid(1)).toBe(true);
    expect(isValidPid(65535)).toBe(true);
    expect(isValidPid(68604)).toBe(true);
    expect(isValidPid(2147483647)).toBe(true);
  });

  it('rejects invalid PID values', () => {
    expect(isValidPid(0)).toBe(false);
    expect(isValidPid(-1)).toBe(false);
    expect(isValidPid(1.5)).toBe(false);
    expect(isValidPid(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidPid(2147483648)).toBe(false);
    expect(isValidPid('68604')).toBe(false);
    expect(isValidPid(null)).toBe(false);
  });
});
