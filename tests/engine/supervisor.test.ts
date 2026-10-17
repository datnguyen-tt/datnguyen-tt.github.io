import { describe, expect, it } from "vitest";
import { Supervisor } from "../../src/fx/engine/supervisor";

describe("Supervisor (strategies & intensity escalation)", () => {
  const children = ["w1", "w2", "w3", "w4"];

  it("one_for_one restarts only the crashed child", () => {
    const sup = new Supervisor({
      strategy: "one_for_one",
      children,
      restartDelayMs: 500,
    });
    const oldPids = sup.getChildren().map((c) => c.pid);
    const report = sup.crash("w2", 1000);

    expect(report.terminatedIds).toEqual(["w2"]);
    expect(report.restartSet).toEqual(["w2"]);
    expect(report.escalated).toBe(false);
    expect(sup.getChild("w1")?.state).toBe("running");
    expect(sup.getChild("w2")?.state).toBe("crashed");
    expect(sup.getChild("w3")?.state).toBe("running");

    // Advance past restartDelayMs
    const restarted = sup.tick(1500);
    expect(restarted).toEqual(["w2"]);
    expect(sup.getChild("w2")?.state).toBe("running");
    expect(sup.getChild("w2")?.restarts).toBe(1);
    expect(sup.getChild("w2")?.pid).toBeGreaterThan(oldPids[1]!);
    expect(sup.getChild("w1")?.pid).toBe(oldPids[0]);
  });

  it("one_for_all terminates in reverse start order and restarts in start order", () => {
    const sup = new Supervisor({
      strategy: "one_for_all",
      children,
      restartDelayMs: 400,
    });
    const report = sup.crash("w3", 100);
    expect(report.terminatedIds).toEqual(["w4", "w3", "w2", "w1"]);
    expect(report.restartSet).toEqual(["w1", "w2", "w3", "w4"]);
    for (const c of sup.getChildren()) {
      expect(c.state).toBe("crashed");
    }
    const restarted = sup.tick(500);
    expect(restarted).toEqual(["w1", "w2", "w3", "w4"]);
  });

  it("rest_for_one terminates subsequent children in reverse order and restarts in start order", () => {
    const sup = new Supervisor({
      strategy: "rest_for_one",
      children,
      restartDelayMs: 400,
    });
    const oldPids = sup.getChildren().map((c) => c.pid);
    const report = sup.crash("w2", 200);

    expect(report.terminatedIds).toEqual(["w4", "w3", "w2"]);
    expect(report.restartSet).toEqual(["w2", "w3", "w4"]);
    expect(sup.getChild("w1")?.state).toBe("running");
    expect(sup.getChild("w2")?.state).toBe("crashed");
    expect(sup.getChild("w3")?.state).toBe("crashed");
    expect(sup.getChild("w4")?.state).toBe("crashed");

    const restarted = sup.tick(600);
    expect(restarted).toEqual(["w2", "w3", "w4"]);
    expect(sup.getChild("w1")?.pid).toBe(oldPids[0]);
    expect(sup.getChild("w2")?.pid).toBeGreaterThan(oldPids[1]!);
    expect(sup.getChild("w3")?.pid).toBeGreaterThan(oldPids[2]!);
    expect(sup.getChild("w4")?.pid).toBeGreaterThan(oldPids[3]!);
  });

  it("treats crashing a non-running child as a no-op without counting toward intensity", () => {
    const sup = new Supervisor({
      strategy: "one_for_one",
      children,
      maxRestarts: 1,
      periodMs: 2000,
      restartDelayMs: 500,
    });

    // Crash w1 at t=100 (1st restart within period)
    const r1 = sup.crash("w1", 100);
    expect(r1.restartSet).toEqual(["w1"]);
    expect(r1.escalated).toBe(false);

    // w1 is now "crashed"; crashing w1 again before it restarts must be a no-op
    // and must NOT trigger escalation even though maxRestarts=1
    const r2 = sup.crash("w1", 200);
    expect(r2.restartSet).toEqual([]);
    expect(r2.terminatedIds).toEqual([]);
    expect(r2.escalated).toBe(false);
    expect(sup.isEscalated).toBe(false);

    // Transition w1 to "restarting" at half delay (t=350) and try crashing again -> still no-op
    sup.tick(350);
    expect(sup.getChild("w1")?.state).toBe("restarting");
    const r3 = sup.crash("w1", 360);
    expect(r3.restartSet).toEqual([]);
    expect(sup.isEscalated).toBe(false);
  });

  it("tick returns ready children in start order even when crashed at differing times", () => {
    const sup = new Supervisor({
      strategy: "one_for_one",
      children,
      maxRestarts: 5,
      periodMs: 5000,
      restartDelayMs: 400,
    });

    // Crash w3 first at t=100, then w1 at t=200
    sup.crash("w3", 100);
    sup.crash("w1", 200);

    // At t=650 both w3 (elapsed 550ms) and w1 (elapsed 450ms) have exceeded restartDelayMs=400ms.
    // tick(650) must return them in start order: ["w1", "w3"]
    const restarted = sup.tick(650);
    expect(restarted).toEqual(["w1", "w3"]);
  });

  it("escalates when restart intensity exceeds maxRestarts within periodMs", () => {
    const sup = new Supervisor({
      strategy: "one_for_one",
      children,
      maxRestarts: 2,
      periodMs: 1000,
      restartDelayMs: 100,
    });

    // 1st restart at t=100 (allowed)
    expect(sup.crash("w1", 100).escalated).toBe(false);
    sup.tick(200);

    // 2nd restart at t=400 (allowed, at limit = 2)
    expect(sup.crash("w1", 400).escalated).toBe(false);
    sup.tick(500);

    // 3rd restart at t=800 (within 1000ms of t=100 -> exceeds maxRestarts=2!)
    const escalatedReport = sup.crash("w1", 800);
    expect(escalatedReport.escalated).toBe(true);
    expect(escalatedReport.terminatedIds).toEqual(["w4", "w3", "w2", "w1"]);
    expect(sup.isEscalated).toBe(true);
    expect(sup.tick(1000)).toEqual([]);

    // After reset, supervisor recovers
    sup.reset(2000);
    expect(sup.isEscalated).toBe(false);
    expect(sup.crash("w1", 2100).escalated).toBe(false);
  });

  it("expires old restarts outside periodMs window", () => {
    const sup = new Supervisor({
      strategy: "one_for_one",
      children,
      maxRestarts: 2,
      periodMs: 1000,
      restartDelayMs: 100,
    });
    expect(sup.crash("w1", 100).escalated).toBe(false);
    sup.tick(250);
    expect(sup.crash("w1", 500).escalated).toBe(false);
    sup.tick(650);
    // At t=1200, the restart at t=100 is outside the 1000ms window
    expect(sup.crash("w1", 1200).escalated).toBe(false);
  });
});
