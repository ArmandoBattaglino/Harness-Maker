// server/services/RingBuffer.js
// Fixed-capacity circular buffer for PTY output.
// All data is stored as raw bytes in a pre-allocated Buffer.

export class RingBuffer {
  #buf;
  #capacity;
  #head; // next write position
  #tail; // oldest byte position (only meaningful when full)
  #length; // current bytes stored

  constructor(capacity = 100 * 1024) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new TypeError('RingBuffer capacity must be a positive integer');
    }
    this.#capacity = capacity;
    this.#buf = Buffer.allocUnsafe(capacity);
    this.#head = 0;
    this.#tail = 0;
    this.#length = 0;
  }

  // -------------------------------------------------------------------------
  // push(data)
  // Write data (Buffer or string) into the ring buffer.
  // If data is larger than capacity, only the last `capacity` bytes are kept.
  // Overwrites oldest bytes when full (tail advances accordingly).
  // -------------------------------------------------------------------------
  push(data) {
    // Normalise to Buffer
    const src = Buffer.isBuffer(data) ? data : Buffer.from(data);
    let srcLen = src.length;

    if (srcLen === 0) return;

    // If incoming data is larger than capacity, keep only the tail portion
    let srcOffset = 0;
    if (srcLen > this.#capacity) {
      srcOffset = srcLen - this.#capacity;
      srcLen = this.#capacity;
    }

    // How many bytes remain before wrapping from head to end of buffer?
    const spaceToEnd = this.#capacity - this.#head;

    if (srcLen <= spaceToEnd) {
      // Single contiguous write
      src.copy(this.#buf, this.#head, srcOffset, srcOffset + srcLen);
      this.#head = (this.#head + srcLen) % this.#capacity;
    } else {
      // Split write: write up to end, then wrap
      const firstChunk = spaceToEnd;
      src.copy(this.#buf, this.#head, srcOffset, srcOffset + firstChunk);
      const secondChunk = srcLen - firstChunk;
      src.copy(this.#buf, 0, srcOffset + firstChunk, srcOffset + firstChunk + secondChunk);
      this.#head = secondChunk;
    }

    // Update length and tail
    const newLength = this.#length + srcLen;
    if (newLength > this.#capacity) {
      // Buffer overflowed — advance tail past the overwritten bytes
      const overwritten = newLength - this.#capacity;
      this.#tail = (this.#tail + overwritten) % this.#capacity;
      this.#length = this.#capacity;
    } else {
      this.#length = newLength;
    }
  }

  // -------------------------------------------------------------------------
  // toBuffer()
  // Returns a new contiguous Buffer with all current contents in order.
  // -------------------------------------------------------------------------
  toBuffer() {
    if (this.#length === 0) {
      return Buffer.alloc(0);
    }

    const out = Buffer.allocUnsafe(this.#length);

    if (this.#tail + this.#length <= this.#capacity) {
      // Contents are contiguous — single copy
      this.#buf.copy(out, 0, this.#tail, this.#tail + this.#length);
    } else {
      // Contents wrap around — two copies
      const firstChunk = this.#capacity - this.#tail;
      this.#buf.copy(out, 0, this.#tail, this.#capacity);
      this.#buf.copy(out, firstChunk, 0, this.#length - firstChunk);
    }

    return out;
  }

  get size() {
    return this.#length;
  }

  get capacity() {
    return this.#capacity;
  }

  clear() {
    this.#head = 0;
    this.#tail = 0;
    this.#length = 0;
  }
}
