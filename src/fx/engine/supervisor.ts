/**
 * Pure TypeScript OTP Supervisor simulation.
 * Implements `one_for_one`, `one_for_all`, and `rest_for_one` restart
 * strategies plus `maxRestarts` within `periodMs` intensity escalation.
 *
 * OTP Supervisor semantics:
 * - Affected children are terminated in REVERSE start order (`terminatedIds`).
 * - Affected children are restarted in START order (`restartSet`).
 * - Crashing a child that is not currently `"running"` is a no-op and does not
 *   count toward restart intensity.
 */
export const STRATEGIES = [
  "one_for_one",
  "one_for_all",
  "rest_for_one",
] as const;
export type Strategy = (typeof STRATEGIES)[number];
export type ChildState = "running" | "crashed" | "restarting";

export interface ChildSpec {
  id: string;
}

export interface ChildProcess {
  id: string;
  pid: number;
  state: ChildState;
  restarts: number;
  changedAtMs: number;
}

export interface SupervisorOptions {
  id?: string;
  strategy: Strategy;
  children: readonly (string | ChildSpec)[];
  /** Max allowed restarts within `periodMs` before supervisor escalates. */
  maxRestarts?: number;
  /** Time window in ms for restart intensity check. */
  periodMs?: number;
  /** Delay in ms between crash and restart completion. */
  restartDelayMs?: number;
}

export interface CrashReport {
  supervisorId: string;
  crashedId: string;
  strategy: Strategy;
  /** Children terminated, in REVERSE start order (OTP shutdown order). */
  terminatedIds: string[];
  /** Children scheduled for restart, in START order (OTP start order). */
  restartSet: string[];
  /** True if restart intensity exceeded `maxRestarts` within `periodMs`. */
  escalated: boolean;
}

export class Supervisor {
  readonly id: string;
  private strategyVal: Strategy;
  private readonly children: ChildProcess[];
  private readonly maxRestarts: number;
  private readonly periodMs: number;
  private readonly restartDelayMs: number;
  private restartHistory: number[] = [];
  private nextPid = 100;
  private escalatedState = false;

  constructor(opts: SupervisorOptions) {
    this.id = opts.id ?? "sup";
    this.strategyVal = opts.strategy;
    this.maxRestarts = opts.maxRestarts ?? 3;
    this.periodMs = opts.periodMs ?? 5000;
    this.restartDelayMs = opts.restartDelayMs ?? 600;
    this.children = opts.children.map((c) => ({
      id: typeof c === "string" ? c : c.id,
      pid: ++this.nextPid,
      state: "running",
      restarts: 0,
      changedAtMs: 0,
    }));
  }

  get strategy(): Strategy {
    return this.strategyVal;
  }

  setStrategy(strategy: Strategy): void {
    this.strategyVal = strategy;
  }

  get isEscalated(): boolean {
    return this.escalatedState;
  }

  getChildren(): readonly ChildProcess[] {
    return this.children;
  }

  getChild(id: string): ChildProcess | undefined {
    return this.children.find((c) => c.id === id);
  }

  /**
   * Compute the ordered list of child IDs that must restart (in start order)
   * when `crashedId` exits abnormally:
   * - `one_for_one`: only the crashed child
   * - `one_for_all`: all children in start order
   * - `rest_for_one`: the crashed child and any child started AFTER it
   */
  computeRestartSet(crashedId: string): string[] {
    const idx = this.children.findIndex((c) => c.id === crashedId);
    if (idx === -1) return [];
    switch (this.strategyVal) {
      case "one_for_one":
        return [this.children[idx]!.id];
      case "one_for_all":
        return this.children.map((c) => c.id);
      case "rest_for_one":
        return this.children.slice(idx).map((c) => c.id);
    }
  }

  /**
   * Crash a running child process at `nowMs`.
   * If the target child does not exist, is not `"running"`, or the supervisor
   * is already escalated, returns a no-op report without recording intensity.
   */
  crash(crashedId: string, nowMs = 0): CrashReport {
    const target = this.getChild(crashedId);
    if (!target || target.state !== "running" || this.escalatedState) {
      return {
        supervisorId: this.id,
        crashedId,
        strategy: this.strategyVal,
        terminatedIds: [],
        restartSet: [],
        escalated: this.escalatedState,
      };
    }

    const restartSet = this.computeRestartSet(crashedId);
    const terminatedIds = restartSet.slice().reverse();

    const cutoff = nowMs - this.periodMs;
    this.restartHistory = this.restartHistory.filter((t) => t >= cutoff);
    this.restartHistory.push(nowMs);

    if (this.restartHistory.length > this.maxRestarts) {
      this.escalatedState = true;
      const allTerminated = this.children.map((c) => c.id).reverse();
      for (const child of this.children) {
        child.state = "crashed";
        child.changedAtMs = nowMs;
      }
      return {
        supervisorId: this.id,
        crashedId,
        strategy: this.strategyVal,
        terminatedIds: allTerminated,
        restartSet,
        escalated: true,
      };
    }

    for (const child of this.children) {
      if (restartSet.includes(child.id)) {
        child.state = "crashed";
        child.changedAtMs = nowMs;
      }
    }

    return {
      supervisorId: this.id,
      crashedId,
      strategy: this.strategyVal,
      terminatedIds,
      restartSet,
      escalated: false,
    };
  }

  /**
   * Advance supervisor timers to `nowMs`. Transitions crashed children
   * through `restarting` → `running` with fresh PIDs once `restartDelayMs` elapses.
   * Iterates `this.children` in start order so returned IDs are always in start order.
   */
  tick(nowMs: number): string[] {
    if (this.escalatedState) return [];
    const restarted: string[] = [];
    const halfDelay = this.restartDelayMs * 0.5;
    for (const child of this.children) {
      if (child.state === "crashed" && nowMs - child.changedAtMs >= halfDelay) {
        child.state = "restarting";
      }
      if (
        (child.state === "crashed" || child.state === "restarting") &&
        nowMs - child.changedAtMs >= this.restartDelayMs
      ) {
        child.state = "running";
        child.pid = ++this.nextPid;
        child.restarts++;
        child.changedAtMs = nowMs;
        restarted.push(child.id);
      }
    }
    return restarted;
  }

  /** Reset supervisor and all children to a clean running state. */
  reset(nowMs = 0): void {
    this.escalatedState = false;
    this.restartHistory = [];
    for (const child of this.children) {
      child.state = "running";
      child.pid = ++this.nextPid;
      child.changedAtMs = nowMs;
    }
  }
}
