// tests/RingBuffer.test.js
// Unit tests for the RingBuffer circular buffer (DEC-004: 100KB cap, wrap-around)

import { describe, it, expect, beforeEach } from 'vitest';
import { RingBuffer } from '../services/RingBuffer.js';

describe('RingBuffer', () => {
  describe('constructor', () => {
    it('should create a buffer with the specified capacity', () => {
      const rb = new RingBuffer(256);
      expect(rb.capacity).toBe(256);
      expect(rb.size).toBe(0);
    });

    it('should default to 100 KB capacity', () => {
      const rb = new RingBuffer();
      expect(rb.capacity).toBe(100 * 1024);
    });

    it('should throw on non-integer capacity', () => {
      expect(() => new RingBuffer(1.5)).toThrow(TypeError);
    });

    it('should throw on zero capacity', () => {
      expect(() => new RingBuffer(0)).toThrow(TypeError);
    });

    it('should throw on negative capacity', () => {
      expect(() => new RingBuffer(-10)).toThrow(TypeError);
    });
  });

  describe('happy path — basic push and retrieve', () => {
    it('should push a string and retrieve it', () => {
      const rb = new RingBuffer(64);
      rb.push('hello');
      const out = rb.toBuffer().toString();
      expect(out).toBe('hello');
      expect(rb.size).toBe(5);
    });

    it('should push a Buffer and retrieve it', () => {
      const rb = new RingBuffer(64);
      rb.push(Buffer.from('world'));
      expect(rb.toBuffer().toString()).toBe('world');
    });

    it('should push multiple times and retrieve all data in order', () => {
      const rb = new RingBuffer(64);
      rb.push('foo');
      rb.push('bar');
      rb.push('baz');
      expect(rb.toBuffer().toString()).toBe('foobarbaz');
      expect(rb.size).toBe(9);
    });

    it('should return empty buffer when nothing pushed', () => {
      const rb = new RingBuffer(64);
      const out = rb.toBuffer();
      expect(out.length).toBe(0);
    });

    it('should ignore empty push', () => {
      const rb = new RingBuffer(64);
      rb.push('');
      expect(rb.size).toBe(0);
    });
  });

  describe('wrap-around (overflow behaviour)', () => {
    it('should not exceed capacity when data overflows', () => {
      const rb = new RingBuffer(10);
      rb.push('hello');   // 5 bytes
      rb.push('world');   // 5 bytes — now exactly full
      expect(rb.size).toBe(10);
    });

    it('should discard oldest bytes when capacity is exceeded', () => {
      const rb = new RingBuffer(8);
      rb.push('12345678'); // fill exactly
      rb.push('ABCD');    // 4 more — oldest 4 bytes ('1234') should be lost
      const out = rb.toBuffer().toString();
      expect(out).toBe('5678ABCD');
      expect(rb.size).toBe(8);
    });

    it('should handle data larger than capacity — keeps only last N bytes', () => {
      const rb = new RingBuffer(5);
      rb.push('0123456789'); // 10 bytes into 5-byte buffer
      const out = rb.toBuffer().toString();
      expect(out).toBe('56789');
      expect(rb.size).toBe(5);
    });

    it('should produce correct content after wrap-around with multiple pushes', () => {
      // Capacity 6. Push 'ABCDEF' (fills), then push 'XY' (wraps, overwrites A,B)
      const rb = new RingBuffer(6);
      rb.push('ABCDEF');
      rb.push('XY');
      const out = rb.toBuffer().toString();
      expect(out).toBe('CDEFXY');
    });

    it('should produce correct content after multiple wrap-arounds', () => {
      const rb = new RingBuffer(4);
      rb.push('AAAA'); // full
      rb.push('BB');   // overwrites AA → AABB
      rb.push('CC');   // overwrites AA → BBCC
      const out = rb.toBuffer().toString();
      expect(out).toBe('BBCC');
    });
  });

  describe('clear()', () => {
    it('should reset size to 0 after clear', () => {
      const rb = new RingBuffer(32);
      rb.push('data');
      rb.clear();
      expect(rb.size).toBe(0);
      expect(rb.toBuffer().length).toBe(0);
    });

    it('should allow fresh data after clear', () => {
      const rb = new RingBuffer(10);
      rb.push('hello');
      rb.clear();
      rb.push('new');
      expect(rb.toBuffer().toString()).toBe('new');
    });
  });

  describe('getAll / toBuffer consistency', () => {
    it('should return identical result on two consecutive toBuffer() calls', () => {
      const rb = new RingBuffer(16);
      rb.push('test data');
      const first = rb.toBuffer().toString();
      const second = rb.toBuffer().toString();
      expect(first).toBe(second);
    });

    it('should not modify internal state when toBuffer is called', () => {
      const rb = new RingBuffer(10);
      rb.push('hello');
      rb.toBuffer();
      rb.push('world');
      expect(rb.toBuffer().toString()).toBe('helloworld');
    });
  });
});
