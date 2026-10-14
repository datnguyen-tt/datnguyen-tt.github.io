import { dump } from "js-yaml";
import { describe, expect, it } from "vitest";
import { LANGS, cv, parseCv, t, type CV } from "../src/data/cv";

/** Collect every {en, vi} pair found anywhere in the document. */
function bilingual(node: unknown, out: Record<string, unknown>[] = []) {
  if (Array.isArray(node)) node.forEach((n) => bilingual(n, out));
  else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if ("en" in o || "vi" in o) out.push(o);
    else Object.values(o).forEach((v) => bilingual(v, out));
  }
  return out;
}

describe("cv data loader", () => {
  it("loads the YAML with the expected shape", () => {
    expect(cv.meta.name).toBe("Dat Nguyen");
    expect(cv.experience.length).toBeGreaterThan(0);
    expect(cv.hero.terminal.length).toBeGreaterThan(0);
    expect(cv.stats).toHaveLength(4);
  });

  it("t() picks the language and falls back to en", () => {
    expect(t({ en: "a", vi: "b" }, "vi")).toBe("b");
    expect(t({ en: "a" } as never, "vi")).toBe("a");
  });

  it("every localized field has both languages", () => {
    const pairs = bilingual(cv);
    expect(pairs.length).toBeGreaterThan(20);
    for (const p of pairs) {
      for (const l of LANGS) expect(p[l], JSON.stringify(p)).toBeTruthy();
    }
  });

  it("rejects documents with missing sections", () => {
    expect(() => parseCv("meta: {}")).toThrow(/missing/);
  });

  describe("validation", () => {
    const mutate = (fn: (d: CV) => void): string => {
      const d = structuredClone(cv);
      fn(d);
      return dump(d);
    };

    it("rejects an unknown domain", () => {
      const src = mutate((d) => void (d.experience[0]!.domain = "x" as never));
      expect(() => parseCv(src)).toThrow(/domain must be one of/);
    });

    it("rejects an unknown supervision strategy", () => {
      const src = mutate((d) => void (d.skills[0]!.strategy = "x" as never));
      expect(() => parseCv(src)).toThrow(/strategy must be one of/);
    });

    it("rejects malformed dates", () => {
      const bad = mutate((d) => void (d.experience[0]!.start = "2023-6"));
      expect(() => parseCv(bad)).toThrow(/start must match YYYY-MM/);
      const bad2 = mutate((d) => void (d.education[0]!.end = "2022-13"));
      expect(() => parseCv(bad2)).toThrow(/end must match YYYY-MM/);
    });

    it("accepts a null end (current job)", () => {
      expect(cv.experience.some((j) => j.end === null)).toBe(true);
    });
  });

  it("has no placeholder copy", () => {
    const hit = JSON.stringify(cv).match(/.{0,40}(owner confirmation|TODO).{0,20}/i);
    expect(hit?.[0], "placeholder text found in cv.yaml").toBeUndefined();
  });
});
