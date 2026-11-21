export interface Timers {
  after(fn: () => void, ms: number): void;
  clear(): void;
}

export function createTimers(): Timers {
  const pending = new Set<ReturnType<typeof setTimeout>>();
  return {
    after(fn, ms) {
      const id = setTimeout(() => {
        pending.delete(id);
        fn();
      }, ms);
      pending.add(id);
    },
    clear() {
      for (const id of pending) clearTimeout(id);
      pending.clear();
    },
  };
}

export interface Timer {
  readonly pending: boolean;
  set(fn: () => void, ms: number): void;
  clear(): void;
}

/** A single re-armable timer: `set` replaces any pending callback. */
export function createTimer(): Timer {
  let id: ReturnType<typeof setTimeout> | null = null;
  return {
    get pending() {
      return id !== null;
    },
    set(fn, ms) {
      if (id !== null) clearTimeout(id);
      id = setTimeout(() => {
        id = null;
        fn();
      }, ms);
    },
    clear() {
      if (id !== null) clearTimeout(id);
      id = null;
    },
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
