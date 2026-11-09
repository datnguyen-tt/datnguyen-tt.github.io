import { isMotionOn, isVisible, onMotionChange } from "../scripts/motion";

/** Commands the idle prompt types and erases, in a loop. */
const DEMO = ["dat:domains().", "dat:principles().", "dat:help()."];

/**
 * Interactive Erlang shell in the Hero terminal. Mounted by terminal-typing
 * once the scripted session has finished: the last `N>` prompt becomes a real
 * input, and `dat:*` calls answer from the CV snapshot that Hero.astro embeds
 * as `<script type="application/json" data-shell-data>`.
 *
 * Output is built with text nodes only (never innerHTML), links included.
 */

interface ShellData {
  prompt: number;
  name: string;
  fullName: string;
  role: string;
  location: string;
  availability: string;
  email: string;
  links: { github: string; linkedin: string; site: string };
  pdf: string;
  canned: { input: string; output: string }[];
  jobs: { company: string; role: string; start: string; end: string | null; location: string }[];
  skills: { id: string; name: string; children: string[] }[];
  projects: { name: string; repo: string; description: string }[];
  education: { degree: string; school: string; start: string; end: string }[];
  languages: { name: string; level: string }[];
  sections: string[];
  text: {
    inputLabel: string;
    placeholder: string;
    hint: string;
    help: Record<string, string>;
    undefinedHint: string;
    syntaxHint: string;
    halt: string;
    gotoUsage: string;
    hire: string;
  };
}

/** One output segment: plain text, or a link / styled span. */
type Seg = string | { t: string; href?: string; download?: boolean; cls?: string };
type Line = Seg[];
type Result = { lines: Line[]; kind?: "err" } | "clear";

const NODE = "dat@cv";
const MAX_LINES = 400;

const q = (s: string): string => JSON.stringify(s); // Erlang string literal
const atom = (s: string): string => s.replace(/[^a-z0-9_]+/gi, "_").toLowerCase();
const comment = (s: string): Seg => ({ t: `% ${s}`, cls: "shell__comment" });
const link = (t: string, href: string, download = false): Seg => ({ t, href, download });

/** Render a list of rows as an Erlang list literal over several lines. */
function listLines(rows: Line[], open = "[", close = "]"): Line[] {
  if (rows.length === 0) return [[`${open}${close}`]];
  return rows.map((row, i) => [
    i === 0 ? open : " ",
    ...row,
    i === rows.length - 1 ? close : ",",
  ]);
}

export function mountErlShell(mount: HTMLElement): void {
  if (mount.dataset["shellReady"] === "true") return;
  const body = mount.querySelector<HTMLElement>(".terminal__body");
  const dataEl = mount.querySelector<HTMLScriptElement>("[data-shell-data]");
  const promptRow = body?.querySelector<HTMLElement>(":scope > .ln:last-of-type");
  if (!body || !dataEl || !promptRow) return;

  let data: ShellData;
  try {
    data = JSON.parse(dataEl.textContent ?? "") as ShellData;
  } catch {
    return;
  }
  mount.dataset["shellReady"] = "true";
  const tx = data.text;

  // The body is now the real, readable transcript: drop the screen-reader
  // copy and expose the body itself, announcing new output politely.
  mount.querySelector(":scope > .sr-only")?.remove();
  body.removeAttribute("aria-hidden");
  body.setAttribute("role", "log");
  body.setAttribute("aria-live", "polite");

  // --- Prompt row → real input -------------------------------------------
  let n = data.prompt;
  const promptLabel = promptRow.querySelector<HTMLElement>(".p");
  promptRow.classList.add("ln--input");
  const input = document.createElement("input");
  input.className = "shell__input";
  input.type = "text";
  input.spellcheck = false;
  input.autocomplete = "off";
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("enterkeyhint", "send");
  input.setAttribute("aria-label", tx.inputLabel);
  input.placeholder = tx.placeholder; // shown on focus; the ghost covers idle
  // Idle prompt: a ghost line types and erases demo commands behind the
  // input (typewriter), with the blinking block cursor after it. It hides as
  // soon as the visitor focuses the prompt or types.
  const field = document.createElement("span");
  field.className = "shell__field";
  const ghost = document.createElement("span");
  ghost.className = "shell__ghost";
  ghost.setAttribute("aria-hidden", "true");
  const ghostText = document.createElement("span");
  ghost.appendChild(ghostText);
  const cursor = promptRow.querySelector<HTMLElement>(".cursor");
  field.append(input, ghost);
  promptRow.appendChild(field);

  const bar = mount.querySelector<HTMLElement>(".terminal__bar");
  if (bar && !bar.querySelector(".terminal__hint")) {
    const hint = document.createElement("code");
    hint.className = "terminal__hint";
    hint.setAttribute("aria-hidden", "true");
    hint.textContent = tx.hint;
    bar.appendChild(hint);
  }

  let demoTimer = 0;
  let demoIdx = 0;
  let demoChars = 0;
  let deleting = false;
  let onScreen = true;
  const idle = (): boolean => !input.value && document.activeElement !== input;

  const demoTick = (): void => {
    demoTimer = 0;
    if (cursor && cursor.parentElement !== ghost) ghost.appendChild(cursor);
    const showGhost = idle();
    field.classList.toggle("is-idle", showGhost);
    if (!showGhost || !onScreen) return;
    if (!isMotionOn()) {
      ghostText.textContent = tx.placeholder;
      return;
    }
    const word = DEMO[demoIdx] ?? "";
    let wait: number;
    if (!deleting) {
      demoChars += 1;
      wait = 55 + Math.random() * 50;
      if (demoChars >= word.length) {
        demoChars = word.length;
        deleting = true;
        wait = 1600;
      }
    } else {
      demoChars -= 1;
      wait = 28;
      if (demoChars <= 0) {
        demoChars = 0;
        deleting = false;
        demoIdx = (demoIdx + 1) % DEMO.length;
        wait = 450;
      }
    }
    ghostText.textContent = word.slice(0, demoChars);
    demoTimer = window.setTimeout(demoTick, wait);
  };
  const demoKick = (): void => {
    if (!demoTimer) demoTick();
  };
  const demoStop = (): void => {
    clearTimeout(demoTimer);
    demoTimer = 0;
    field.classList.remove("is-idle");
  };
  input.addEventListener("focus", demoStop);
  input.addEventListener("input", demoStop);
  input.addEventListener("blur", () => {
    if (!input.value) {
      demoChars = 0;
      deleting = false;
      demoKick();
    }
  });
  isVisible(field, (v) => {
    onScreen = v;
    if (v) demoKick();
    else {
      clearTimeout(demoTimer);
      demoTimer = 0;
    }
  });
  onMotionChange(() => {
    clearTimeout(demoTimer);
    demoTimer = 0;
    demoKick();
  });
  demoKick();

  // --- Rendering -----------------------------------------------------------
  // Output scrolls inside the box instead of pushing the page around. The
  // box keeps the height of the scripted transcript (static rows + prompt),
  // re-measured on resize because that height depends on line wrapping.
  // Shell lines carry .shell__added; clear() only hides static rows
  // (.shell__cleared) so they can still be measured.
  let locked = false;
  const measure = (): number => {
    body.classList.add("is-measuring");
    body.style.height = "";
    const h = body.offsetHeight;
    body.classList.remove("is-measuring");
    return h;
  };
  const applyHeight = (): void => {
    const top = body.scrollTop;
    const atEnd = !locked || top + body.clientHeight >= body.scrollHeight - 2;
    body.style.height = `${measure()}px`;
    // Keep the prompt in view if it was; otherwise keep the reading position.
    body.scrollTop = atEnd ? body.scrollHeight : top;
  };
  const lockHeight = (): void => {
    if (locked) return;
    applyHeight();
    locked = true;
    body.classList.add("is-interactive");
    let raf = 0;
    new ResizeObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        applyHeight();
      });
    }).observe(mount);
  };

  const renderLine = (line: Line, cls = "o"): HTMLElement => {
    const p = document.createElement("p");
    p.className = `ln ${cls}`;
    for (const seg of line) {
      if (typeof seg === "string") {
        p.append(seg);
        continue;
      }
      let el: HTMLElement;
      if (seg.href) {
        const a = document.createElement("a");
        a.href = seg.href;
        if (seg.download) a.setAttribute("download", "");
        else if (/^https?:/.test(seg.href)) {
          a.target = "_blank";
          a.rel = "noopener";
        }
        el = a;
      } else {
        el = document.createElement("span");
      }
      if (seg.cls) el.className = seg.cls;
      el.textContent = seg.t;
      p.appendChild(el);
    }
    return p;
  };

  const echo = (text: string): void => {
    const p = document.createElement("p");
    p.className = "ln";
    const ps = document.createElement("span");
    ps.className = "p";
    ps.textContent = `${n}>`;
    const is = document.createElement("span");
    is.className = "i";
    is.textContent = text;
    p.append(ps, " ", is);
    p.classList.add("shell__added");
    body.insertBefore(p, promptRow);
  };

  const print = (res: Result): void => {
    if (res === "clear") {
      for (const el of [...body.children]) {
        if (el === promptRow) break;
        if (el.classList.contains("shell__added")) el.remove();
        else el.classList.add("shell__cleared");
      }
      return;
    }
    const frag = document.createDocumentFragment();
    res.lines.forEach((l, i) => {
      const el = renderLine(l, res.kind === "err" ? "o shell__err" : "o");
      el.classList.add("shell__added");
      if (i < res.lines.length - 1) el.classList.add("shell__cont");
      frag.appendChild(el);
    });
    body.insertBefore(frag, promptRow);
    const added = body.getElementsByClassName("shell__added");
    while (added.length > MAX_LINES) added[0]?.remove();
  };

  const scrollDown = (): void => {
    body.scrollTop = body.scrollHeight;
  };

  // --- Commands ------------------------------------------------------------
  const canned = (call: string): Result | null => {
    const hit = data.canned.find((c) => c.input.replace(/\.$/, "") === call);
    return hit ? { lines: [[hit.output]] } : null;
  };

  const help = (): Result => {
    const rows: [string, string][] = [
      ["dat:whoami().", tx.help["whoami"] ?? ""],
      ["dat:role().", tx.help["role"] ?? ""],
      ["dat:domains().", tx.help["domains"] ?? ""],
      ["dat:principles().", tx.help["principles"] ?? ""],
      ["dat:experience().", tx.help["experience"] ?? ""],
      ["dat:skills().", tx.help["skills"] ?? ""],
      ["dat:projects().", tx.help["projects"] ?? ""],
      ["dat:education().", tx.help["education"] ?? ""],
      ["dat:languages().", tx.help["languages"] ?? ""],
      ["dat:contact().", tx.help["contact"] ?? ""],
      ["dat:cv().", tx.help["cv"] ?? ""],
      ["dat:goto(Section).", tx.help["goto"] ?? ""],
      ["dat:hire().", tx.help["hire"] ?? ""],
      [`net_adm:ping('${NODE}').`, tx.help["ping"] ?? ""],
      ["clear().", tx.help["clear"] ?? ""],
    ];
    const w = Math.max(...rows.map(([c]) => c.length)) + 2;
    return {
      lines: [
        [comment(tx.help["intro"] ?? "")],
        ...rows.map(([c, d]): Line => [{ t: c.padEnd(w), cls: "shell__cmd" }, comment(d)]),
        [comment(tx.help["keys"] ?? "")],
      ],
    };
  };

  const DAT: Record<string, (args: string[]) => Result> = {
    help,
    whoami: () => canned("dat:whoami()") ?? { lines: [[`{${atom(data.role)}}`]] },
    domains: () => canned("dat:domains()") ?? { lines: [["[]"]] },
    principles: () => canned("dat:principles()") ?? { lines: [["[]"]] },
    role: () => ({
      lines: listLines(
        [
          [`role => ${q(data.role)}`],
          [`location => ${q(data.location)}`],
          [`status => ${q(data.availability)}`],
        ],
        "#{",
        "}",
      ),
    }),
    experience: () => ({
      lines: listLines(
        data.jobs.map((j) => [
          `{${q(j.company)}, ${q(j.role)}, ${q(j.start)}, ${j.end ? q(j.end) : "present"}}`,
        ]),
      ),
    }),
    skills: () => ({
      lines: listLines(
        data.skills.map((g) => [`${atom(g.id)} => [${g.children.map(q).join(", ")}]`]),
        "#{",
        "}",
      ),
    }),
    projects: () => ({
      lines: listLines(
        data.projects.map((p) => [`{${q(p.name)}, ${q(p.description)}, `, link(q(p.repo), p.repo), "}"]),
      ),
    }),
    education: () => ({
      lines: listLines(
        data.education.map((e) => [`{${q(e.degree)}, ${q(e.school)}, ${q(`${e.start}..${e.end}`)}}`]),
      ),
    }),
    languages: () => ({
      lines: listLines(data.languages.map((l) => [`{${q(l.name)}, ${q(l.level)}}`])),
    }),
    contact: () => ({
      lines: listLines(
        [
          ["email => ", link(q(data.email), `mailto:${data.email}`)],
          ["github => ", link(q(data.links.github), data.links.github)],
          ["linkedin => ", link(q(data.links.linkedin), data.links.linkedin)],
          ["site => ", link(q(data.links.site), data.links.site)],
        ],
        "#{",
        "}",
      ),
    }),
    cv: () => ({ lines: [["{ok, ", link(q(data.pdf), data.pdf, true), "}"]] }),
    goto: (args) => {
      const target = atom(args[0] ?? "").replace(/^_+|_+$/g, "");
      if (!data.sections.includes(target)) {
        return {
          kind: "err",
          lines: [[comment(`${tx.gotoUsage} [${data.sections.join(", ")}]`)]],
        };
      }
      // Defer so the echo lands before the page moves.
      requestAnimationFrame(() => {
        document.getElementById(target)?.scrollIntoView({ block: "start" });
      });
      return { lines: [["ok"]] };
    },
    hire: () => {
      window.setTimeout(() => {
        location.href = `mailto:${data.email}`;
      }, 400);
      return { lines: [[tx.hire]] };
    },
  };

  const arity: Record<string, number> = { goto: 1 };

  const undef = (mod: string, fun: string, n: number): Result => ({
    kind: "err",
    lines: [
      [`** exception error: undefined function ${mod}:${fun}/${n}`],
      [comment(tx.undefinedHint)],
    ],
  });

  const evaluate = (raw: string): Result | null => {
    const src = raw.trim().replace(/\.\s*$/, "").trim();
    if (!src) return null;

    const call = /^([a-z][\w@]*)\s*(?::\s*([a-z]\w*))?\s*\((.*)\)$/s.exec(src);
    if (!call) {
      return {
        kind: "err",
        lines: [[`* 1:1: syntax error before: ${q(src.slice(0, 24))}`], [comment(tx.syntaxHint)]],
      };
    }
    const [, first = "", second, argSrc = ""] = call;
    const args = argSrc.trim() ? argSrc.split(",").map((a) => a.trim()) : [];
    const mod = second ? first : "shell";
    const fun = second ?? first;

    if (mod === "dat") {
      const f = DAT[fun];
      if (!f || args.length !== (arity[fun] ?? 0)) return undef("dat", fun, args.length);
      return f(args);
    }
    if (mod === "net_adm" && fun === "ping" && args.length === 1) {
      const target = (args[0] ?? "").replace(/^'|'$/g, "");
      return { lines: [[target === NODE ? "pong" : "pang"]] };
    }
    if (mod === "shell" || mod === "c") {
      if (fun === "help" && args.length === 0) return help();
      if ((fun === "clear" || fun === "cls") && args.length === 0) return "clear";
      if (fun === "node" && args.length === 0) return { lines: [[`'${NODE}'`]] };
      if (fun === "f" && args.length === 0) return { lines: [["ok"]] };
      if ((fun === "q" || fun === "halt") && args.length === 0) {
        return { lines: [["ok"], [comment(tx.halt)]] };
      }
    }
    if (mod === "init" && fun === "stop") return { lines: [["ok"], [comment(tx.halt)]] };
    if (mod === "shell") {
      return {
        kind: "err",
        lines: [[`** exception error: undefined shell command ${fun}/${args.length}`], [comment(tx.undefinedHint)]],
      };
    }
    return undef(mod, fun, args.length);
  };

  // --- Input handling ------------------------------------------------------
  const history: string[] = [];
  let hIdx = 0;
  let draft = "";

  const COMPLETIONS = [
    ...Object.keys(DAT).map((f) => (arity[f] ? `dat:${f}(` : `dat:${f}().`)),
    `net_adm:ping('${NODE}').`,
    "clear().",
  ];

  const complete = (): boolean => {
    const v = input.value;
    if (!v) return false;
    const hits = COMPLETIONS.filter((c) => c.startsWith(v));
    // Nothing to complete: let Tab move focus on (no keyboard trap).
    if (hits.length === 0) return false;
    if (hits.length === 1) {
      input.value = hits[0] ?? v;
      return true;
    }
    let pre = hits[0] ?? "";
    for (const h of hits) while (!h.startsWith(pre)) pre = pre.slice(0, -1);
    if (pre.length > v.length) input.value = pre;
    else {
      lockHeight();
      print({ lines: [[{ t: hits.join("  "), cls: "shell__comment" }]] });
      scrollDown();
    }
    return true;
  };

  const submit = (): void => {
    const value = input.value;
    input.value = "";
    lockHeight();
    echo(value);
    const res = evaluate(value);
    if (value.trim()) {
      if (history[history.length - 1] !== value) history.push(value);
      n += 1;
    }
    hIdx = history.length;
    draft = "";
    if (res) print(res);
    if (promptLabel) promptLabel.textContent = `${n}>`;
    scrollDown();
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "ArrowUp") {
      if (!history.length) return;
      e.preventDefault();
      if (hIdx === history.length) draft = input.value;
      hIdx = Math.max(0, hIdx - 1);
      input.value = history[hIdx] ?? "";
    } else if (e.key === "ArrowDown") {
      if (hIdx >= history.length) return;
      e.preventDefault();
      hIdx += 1;
      input.value = hIdx === history.length ? draft : (history[hIdx] ?? "");
    } else if (e.key === "Tab" && !e.shiftKey) {
      // Only take Tab while there is something to complete, so keyboard users
      // can still tab out of an empty prompt.
      if (complete()) e.preventDefault();
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      print("clear");
    } else if (e.key === "Escape") {
      input.blur();
    }
  });

  // Clicking the transcript focuses the prompt, unless the visitor is
  // selecting text or following a link.
  body.addEventListener("click", (e) => {
    if ((e.target as Element).closest("a, input")) return;
    if (String(window.getSelection() ?? "")) return;
    input.focus({ preventScroll: true });
  });
}
