/**
 * Single shared requestAnimationFrame scheduler for all effects.
 * - Maintains an O(1) active ticker counter.
 * - Isolates ticker callbacks with try/catch: if a ticker throws, logs once via
 *   `console.error` and disposes the offending ticker so other effects keep running.
 * - Clamps frame delta `dt` to `maxDtMs` (default 50ms).
 * - Completely stops the rAF loop when there are no active tickers.
 */
export type TickerFn = (dtMs: number, nowMs: number) => void;

export interface TickerHandle {
  readonly id: string;
  start(): void;
  pause(): void;
  isActive(): boolean;
  dispose(): void;
}

export interface SchedulerEnv {
  requestAnimationFrame: (cb: (now: number) => void) => number;
  cancelAnimationFrame: (handle: number) => void;
  maxDtMs?: number;
}

interface Entry {
  id: string;
  fn: TickerFn;
  active: boolean;
}

export class Scheduler {
  private readonly entries = new Map<string, Entry>();
  private readonly env: Required<SchedulerEnv>;
  private rafId: number | null = null;
  private lastTime: number | null = null;
  private globalEnabled = true;
  private activeCounter = 0;

  constructor(env?: Partial<SchedulerEnv>) {
    this.env = {
      requestAnimationFrame:
        env?.requestAnimationFrame ??
        ((cb) => globalThis.requestAnimationFrame(cb)),
      cancelAnimationFrame:
        env?.cancelAnimationFrame ??
        ((id) => globalThis.cancelAnimationFrame(id)),
      maxDtMs: env?.maxDtMs ?? 50,
    };
  }

  /** Register a ticker callback and return a control handle. */
  register(id: string, fn: TickerFn, startActive = false): TickerHandle {
    const existing = this.entries.get(id);
    if (existing && existing.active) {
      this.activeCounter = Math.max(0, this.activeCounter - 1);
    }

    const entry: Entry = { id, fn, active: startActive };
    if (startActive) this.activeCounter++;
    this.entries.set(id, entry);
    this.syncLoop();

    return {
      id,
      start: () => {
        if (entry.active || !this.entries.has(id)) return;
        entry.active = true;
        this.activeCounter++;
        this.syncLoop();
      },
      pause: () => {
        if (!entry.active) return;
        entry.active = false;
        this.activeCounter = Math.max(0, this.activeCounter - 1);
        this.syncLoop();
      },
      isActive: () => entry.active && this.globalEnabled,
      dispose: () => {
        if (entry.active) {
          entry.active = false;
          this.activeCounter = Math.max(0, this.activeCounter - 1);
        }
        this.entries.delete(id);
        this.syncLoop();
      },
    };
  }

  /** Enable or pause all tickers globally (e.g., when motion is turned off). */
  setGlobalEnabled(enabled: boolean): void {
    if (this.globalEnabled === enabled) return;
    this.globalEnabled = enabled;
    this.syncLoop();
  }

  /** Number of tickers currently marked active (0 when globally disabled). */
  get activeCount(): number {
    return this.globalEnabled ? this.activeCounter : 0;
  }

  /** True when a `requestAnimationFrame` callback is currently scheduled. */
  get isRunning(): boolean {
    return this.rafId !== null;
  }

  private readonly onFrame = (now: number): void => {
    this.rafId = null;
    if (this.activeCount === 0) {
      this.lastTime = null;
      return;
    }
    const rawDt =
      this.lastTime === null ? 16.67 : Math.max(0, now - this.lastTime);
    const dt = Math.min(rawDt, this.env.maxDtMs);
    this.lastTime = now;

    for (const entry of this.entries.values()) {
      if (entry.active && this.globalEnabled) {
        try {
          entry.fn(dt, now);
        } catch (err) {
          console.error(`[scheduler] ticker "${entry.id}" threw; disposing:`, err);
          entry.active = false;
          this.activeCounter = Math.max(0, this.activeCounter - 1);
          this.entries.delete(entry.id);
        }
      }
    }

    if (this.activeCount > 0) {
      this.rafId = this.env.requestAnimationFrame(this.onFrame);
    } else {
      this.lastTime = null;
    }
  };

  private syncLoop(): void {
    const shouldRun = this.activeCount > 0;
    if (shouldRun && this.rafId === null) {
      this.lastTime = null;
      this.rafId = this.env.requestAnimationFrame(this.onFrame);
    } else if (!shouldRun && this.rafId !== null) {
      this.env.cancelAnimationFrame(this.rafId);
      this.rafId = null;
      this.lastTime = null;
    }
  }
}

export const scheduler = new Scheduler();
