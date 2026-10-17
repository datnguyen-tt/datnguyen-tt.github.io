import { describe, expect, it } from "vitest";
import { Mailbox } from "../../src/fx/engine/mailbox";

describe("Mailbox (FIFO + selective receive)", () => {
  it("dequeues messages in strict FIFO order", () => {
    const mb = new Mailbox<string>(4);
    expect(mb.isEmpty).toBe(true);
    mb.send("a");
    mb.send("b");
    mb.send("c");
    expect(mb.length).toBe(3);
    expect(mb.peek()).toBe("a");
    expect(mb.shift()).toBe("a");
    expect(mb.shift()).toBe("b");
    expect(mb.shift()).toBe("c");
    expect(mb.shift()).toBeUndefined();
    expect(mb.isEmpty).toBe(true);
  });

  it("grows ring buffer seamlessly when wrapping around", () => {
    const mb = new Mailbox<number>(2);
    mb.send(1);
    mb.send(2);
    expect(mb.shift()).toBe(1);
    // Now head is at index 1; push enough items to wrap and trigger growth
    for (let i = 3; i <= 20; i++) {
      expect(mb.send(i)).toBe(true);
    }
    expect(mb.length).toBe(19);
    const out: number[] = [];
    while (!mb.isEmpty) out.push(mb.shift()!);
    expect(out).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
  });

  it("implements Erlang selective receive while preserving remaining order", () => {
    type Msg = { tag: string; seq: number };
    const mb = new Mailbox<Msg>(4);
    mb.send({ tag: "noise", seq: 1 });
    mb.send({ tag: "stat", seq: 2 });
    mb.send({ tag: "noise", seq: 3 });
    mb.send({ tag: "stat", seq: 4 });
    mb.send({ tag: "ack", seq: 5 });

    // Match the first 'stat' message (seq 2), leaving noise(1), noise(3), stat(4), ack(5)
    const firstStat = mb.receive((m) => m.tag === "stat");
    expect(firstStat).toEqual({ tag: "stat", seq: 2 });
    expect(mb.toArray()).toEqual([
      { tag: "noise", seq: 1 },
      { tag: "noise", seq: 3 },
      { tag: "stat", seq: 4 },
      { tag: "ack", seq: 5 },
    ]);

    // Unmatched pattern leaves mailbox unchanged
    const missing = mb.receive((m) => m.tag === "unknown");
    expect(missing).toBeUndefined();
    expect(mb.length).toBe(4);

    // Match tail element
    const ack = mb.receive((m) => m.tag === "ack");
    expect(ack).toEqual({ tag: "ack", seq: 5 });
    expect(mb.toArray()).toEqual([
      { tag: "noise", seq: 1 },
      { tag: "noise", seq: 3 },
      { tag: "stat", seq: 4 },
    ]);

    // Match head element
    const head = mb.receive((m) => m.tag === "noise");
    expect(head).toEqual({ tag: "noise", seq: 1 });
    expect(mb.toArray()).toEqual([
      { tag: "noise", seq: 3 },
      { tag: "stat", seq: 4 },
    ]);
  });

  it("enforces maxCapacity when configured", () => {
    const mb = new Mailbox<number>(2, 3);
    expect(mb.send(1)).toBe(true);
    expect(mb.send(2)).toBe(true);
    expect(mb.send(3)).toBe(true);
    expect(mb.send(4)).toBe(false);
    expect(mb.length).toBe(3);
  });
});
