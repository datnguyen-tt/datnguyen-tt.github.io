import { describe, expect, it, vi } from "vitest";
import { ObjectPool } from "../../src/fx/engine/pool";
import { Scheduler } from "../../src/fx/engine/scheduler";

describe("ObjectPool", () => {
  it("reuses pooled instances without allocating new ones and respects maxSize", () => {
    let created = 0;
    const pool = new ObjectPool(
      3,
      () => ({ id: ++created, x: 0 }),
      (p) => {
        p.x = 0;
      },
      true,
    );

    expect(created).toBe(3);
    expect(pool.activeCount).toBe(0);
    expect(pool.freeCount).toBe(3);

    const a = pool.acquire()!;
    const b = pool.acquire()!;
    const c = pool.acquire()!;
    expect(pool.acquire()).toBeNull(); // cap reached
    expect(pool.activeCount).toBe(3);

    a.x = 42;
    pool.release(a);
    expect(pool.activeCount).toBe(2);
    expect(pool.freeCount).toBe(1);

    const reused = pool.acquire()!;
    expect(reused).toBe(a);
    expect(reused.x).toBe(0); // reset called
    expect(created).toBe(3); // zero new allocations

    // Sweep removes items where predicate is false
    b.x = -1;
    c.x = 10;
    reused.x = -1;
    pool.sweep((item) => item.x > 0);
    expect(pool.activeCount).toBe(1);
    expect(pool.items[0]).toBe(c);
  });
});

describe("Scheduler", () => {
  it("runs rAF only when active tickers exist, clamps dt, and stops when paused", () => {
    let nextId = 1;
    const callbacks = new Map<number, (now: number) => void>();
    const sched = new Scheduler({
      requestAnimationFrame: (cb) => {
        const id = nextId++;
        callbacks.set(id, cb);
        return id;
      },
      cancelAnimationFrame: (id) => {
        callbacks.delete(id);
      },
      maxDtMs: 50,
    });

    expect(sched.isRunning).toBe(false);

    const dts: number[] = [];
    const handle = sched.register("fx1", (dt) => dts.push(dt), false);
    expect(sched.isRunning).toBe(false);

    handle.start();
    expect(sched.isRunning).toBe(true);
    expect(callbacks.size).toBe(1);

    // Step frame 1 at t=1000
    const step = (t: number) => {
      const first = [...callbacks.entries()][0];
      if (!first) return;
      callbacks.delete(first[0]);
      first[1](t);
    };

    step(1000);
    expect(dts).toEqual([16.67]);

    // Step frame 2 with a huge 500ms gap -> clamped to 50ms
    step(1500);
    expect(dts).toEqual([16.67, 50]);
    expect(sched.isRunning).toBe(true);

    // Pause -> cancels rAF immediately
    handle.pause();
    expect(sched.isRunning).toBe(false);
    expect(callbacks.size).toBe(0);

    // Global motion off prevents running even if handle is started
    handle.start();
    expect(sched.isRunning).toBe(true);
    sched.setGlobalEnabled(false);
    expect(sched.isRunning).toBe(false);
    expect(callbacks.size).toBe(0);

    sched.setGlobalEnabled(true);
    expect(sched.isRunning).toBe(true);
    handle.dispose();
    expect(sched.isRunning).toBe(false);
  });

  it("isolates a throwing ticker by logging once and disposing it while keeping others alive", () => {
    let nextId = 1;
    const callbacks = new Map<number, (now: number) => void>();
    const sched = new Scheduler({
      requestAnimationFrame: (cb) => {
        const id = nextId++;
        callbacks.set(id, cb);
        return id;
      },
      cancelAnimationFrame: (id) => {
        callbacks.delete(id);
      },
    });

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let goodCalls = 0;

    sched.register(
      "bad",
      () => {
        throw new Error("boom");
      },
      true,
    );
    const good = sched.register(
      "good",
      () => {
        goodCalls++;
      },
      true,
    );

    expect(sched.activeCount).toBe(2);

    const step = (t: number) => {
      const first = [...callbacks.entries()][0];
      if (!first) return;
      callbacks.delete(first[0]);
      first[1](t);
    };

    step(100);
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(goodCalls).toBe(1);
    expect(sched.activeCount).toBe(1);

    step(116);
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(goodCalls).toBe(2);

    good.dispose();
    expect(sched.activeCount).toBe(0);
    expect(sched.isRunning).toBe(false);
    errSpy.mockRestore();
  });
});
