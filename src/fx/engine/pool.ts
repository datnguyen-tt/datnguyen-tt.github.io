/**
 * Fixed-capacity object pool with swap-and-pop active list.
 * Zero heap allocations per frame during steady-state acquire/release/sweep.
 */
export class ObjectPool<T> {
  private readonly active: T[] = [];
  private readonly free: T[] = [];
  private readonly factory: () => T;
  private readonly reset: ((item: T) => void) | undefined;
  readonly maxSize: number;

  constructor(
    maxSize: number,
    factory: () => T,
    reset?: (item: T) => void,
    preallocate = true,
  ) {
    this.maxSize = Math.max(0, maxSize);
    this.factory = factory;
    this.reset = reset;
    if (preallocate) {
      for (let i = 0; i < this.maxSize; i++) {
        this.free.push(this.factory());
      }
    }
  }

  /** Number of currently active items. */
  get activeCount(): number {
    return this.active.length;
  }

  /** Number of pooled items available for reuse. */
  get freeCount(): number {
    return this.free.length;
  }

  /** Borrow an item from the pool, or return null if at `maxSize`. */
  acquire(): T | null {
    if (this.active.length >= this.maxSize) return null;
    const item = this.free.length > 0 ? this.free.pop()! : this.factory();
    this.reset?.(item);
    this.active.push(item);
    return item;
  }

  /** Return an active item at `index` back to the pool in O(1) via swap-and-pop. */
  releaseAt(index: number): void {
    const len = this.active.length;
    if (index < 0 || index >= len) return;
    const item = this.active[index]!;
    const last = this.active.pop()!;
    if (index < len - 1) {
      this.active[index] = last;
    }
    this.free.push(item);
  }

  /** Return a specific active item reference back to the pool. */
  release(item: T): boolean {
    const idx = this.active.indexOf(item);
    if (idx === -1) return false;
    this.releaseAt(idx);
    return true;
  }

  /** Release all active items back to the free list. */
  releaseAll(): void {
    while (this.active.length > 0) {
      this.free.push(this.active.pop()!);
    }
  }

  /** Read-only access to active items slice for rendering. */
  get items(): readonly T[] {
    return this.active;
  }

  /**
   * Visit every active item in-place. If `keepFn(item)` returns false,
   * the item is immediately returned to the free pool in O(1).
   */
  sweep(keepFn: (item: T) => boolean): void {
    let i = 0;
    while (i < this.active.length) {
      const item = this.active[i]!;
      if (keepFn(item)) {
        i++;
      } else {
        this.releaseAt(i);
      }
    }
  }
}
