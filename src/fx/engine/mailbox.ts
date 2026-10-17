/**
 * Pure TypeScript Erlang-style process mailbox.
 * Backed by a power-of-two ring buffer for O(1) FIFO push/shift and
 * order-preserving selective receive (`receive(matchFn)`).
 */
export class Mailbox<T> {
  private buf: (T | undefined)[];
  private mask: number;
  private head = 0;
  private count = 0;
  private readonly maxCapacity: number;

  constructor(initialCapacity = 16, maxCapacity = Infinity) {
    let cap = 1;
    const target = Math.max(2, initialCapacity);
    while (cap < target) cap <<= 1;
    this.buf = new Array<T | undefined>(cap);
    this.mask = cap - 1;
    this.maxCapacity = maxCapacity;
  }

  /** Number of messages currently in the mailbox. */
  get length(): number {
    return this.count;
  }

  /** True when the mailbox has no messages. */
  get isEmpty(): boolean {
    return this.count === 0;
  }

  /** Enqueue a message at the tail (Erlang `Pid ! Msg`). Returns false if full. */
  send(msg: T): boolean {
    if (this.count >= this.maxCapacity) return false;
    if (this.count === this.buf.length) this.grow();
    const tail = (this.head + this.count) & this.mask;
    this.buf[tail] = msg;
    this.count++;
    return true;
  }

  /** Alias for `send`. */
  push(msg: T): boolean {
    return this.send(msg);
  }

  /** O(1) dequeue of the oldest message. */
  shift(): T | undefined {
    if (this.count === 0) return undefined;
    const msg = this.buf[this.head];
    this.buf[this.head] = undefined;
    this.head = (this.head + 1) & this.mask;
    this.count--;
    return msg;
  }

  /** Inspect the oldest message without removing it. */
  peek(): T | undefined {
    return this.count === 0 ? undefined : this.buf[this.head];
  }

  /** Read message at logical FIFO index (0 = oldest) without allocation. */
  at(index: number): T | undefined {
    if (index < 0 || index >= this.count) return undefined;
    return this.buf[(this.head + index) & this.mask];
  }

  /**
   * Erlang selective receive: scans mailbox from oldest to newest,
   * removes and returns the first message where `matchFn(msg)` is true,
   * preserving the exact relative FIFO order of all remaining messages.
   */
  receive(matchFn?: (msg: T, index: number) => boolean): T | undefined {
    if (this.count === 0) return undefined;
    if (!matchFn) return this.shift();

    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) & this.mask;
      const candidate = this.buf[idx]!;
      if (matchFn(candidate, i)) {
        if (i === 0) return this.shift();
        // Shift subsequent messages one slot toward head to preserve FIFO order.
        for (let j = i; j < this.count - 1; j++) {
          const to = (this.head + j) & this.mask;
          const from = (this.head + j + 1) & this.mask;
          this.buf[to] = this.buf[from];
        }
        const last = (this.head + this.count - 1) & this.mask;
        this.buf[last] = undefined;
        this.count--;
        return candidate;
      }
    }
    return undefined;
  }

  /** Remove all messages. */
  clear(): void {
    for (let i = 0; i < this.count; i++) {
      this.buf[(this.head + i) & this.mask] = undefined;
    }
    this.head = 0;
    this.count = 0;
  }

  /** Snapshot messages in FIFO order (for debugging/tests). */
  toArray(): T[] {
    const out = new Array<T>(this.count);
    for (let i = 0; i < this.count; i++) {
      out[i] = this.buf[(this.head + i) & this.mask]!;
    }
    return out;
  }

  private grow(): void {
    const oldCap = this.buf.length;
    const newCap = oldCap << 1;
    const next = new Array<T | undefined>(newCap);
    for (let i = 0; i < this.count; i++) {
      next[i] = this.buf[(this.head + i) & this.mask];
    }
    this.buf = next;
    this.mask = newCap - 1;
    this.head = 0;
  }
}
