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
