/**
 * First-visit intro: an Erlang shell boots the CV, kills the `hero` process,
 * its supervisor restarts it, then `nodes().` lists the cluster and each node
 * atom flies into its card in the BEAM mesh (E-01 v2).
 *
 * Gated by the head script (`html.intro-pending`): motion on, not ?print, once per
 * session, never under automation; `?intro` forces it. The page is fully
 * rendered underneath (fixed overlay: no CLS, no layout work). Any key,
 * click, wheel or touch skips straight to the page.
 */
import { onMotionChange } from "./motion";

type Kind = "in" | "out" | "ok" | "err" | "muted" | "warn";
interface Step {
  prompt: string;
  cmd: string;
  out: (() => HTMLElement)[];
  pause?: number;
}

const TYPE_MS = 11;
const LINE_MS = 32;
const STEP_PAUSE_MS = 80;
const HOLD_MS = 200;
const FLIGHT_MS = 720;
const FLIGHT_STAGGER_MS = 70;
const FADE_MS = 380;

const NODES = [
  "sbg1@sig-01",
  "nso1@netauto",
  "edge1@lora-gw",
  "mnesia1@store",
  "iot1@telemetry",
  "ivr1@msg-gw",
];

const root = document.documentElement;

function line(text: string, kind: Kind = "out"): () => HTMLElement {
  return () => {
    const p = document.createElement("p");
    p.className = `intro__ln intro__ln--${kind}`;
    p.textContent = text;
    return p;
  };
}

function reportStamp(d: Date): string {
  const mon = d.toLocaleString("en", { month: "short" });
  const pad = (n: number, w = 2): string => String(n).padStart(w, "0");
  return `${pad(d.getDate())}-${mon}-${d.getFullYear()}::${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function nodesLine(): HTMLElement {
  const p = document.createElement("p");
  p.className = "intro__ln intro__ln--out";
  p.append("[");
  NODES.forEach((n, i) => {
    if (i > 0) p.append(",");
    const atom = document.createElement("span");
    atom.className = "intro__atom";
    atom.dataset["node"] = n;
    atom.textContent = `'${n}'`;
    p.append(atom);
  });
  p.append("]");
  return p;
}

const STEPS: Step[] = [
  {
    prompt: "dat@beam:~$",
    cmd: "rebar3 shell",
    out: [
      line("===> Verifying dependencies...", "muted"),
      line("===> Compiling datfolio", "muted"),
      line(
        "Erlang/OTP 28 [erts-16.0] [64-bit] [smp:8:8] [ds:8:8:10] [async-threads:1] [jit]",
      ),
      line("Eshell V16.0 (press Ctrl+G to abort, type help(). for help)", "muted"),
    ],
  },
  {
    prompt: "1>",
    cmd: "application:ensure_all_started(datfolio).",
    out: [line("{ok,[crypto,ssl,cowboy,datfolio]}", "ok")],
  },
  {
    prompt: "2>",
    cmd: "exit(whereis(hero), kill).",
    out: [
      line("true"),
      line(`=SUPERVISOR REPORT==== ${reportStamp(new Date())} ===`, "err"),
      line("    supervisor: {local,datfolio_sup}", "err"),
      line("    errorContext: child_terminated", "err"),
      line("    reason: killed", "err"),
      line("    offender: [{pid,<0.214.0>},{id,hero}]", "err"),
    ],
  },
  {
    prompt: "3>",
    cmd: "whereis(hero).",
    out: [line("<0.231.0>   % restarted by datfolio_sup — let it crash", "ok")],
  },
  {
    prompt: "4>",
    cmd: "nodes().",
    out: [nodesLine],
    pause: HOLD_MS,
  },
];

const wait = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** Card centres published by the BEAM mesh, in viewport coordinates. */
function meshAnchors(): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const mount = document.querySelector<HTMLElement>('[data-effect="beam-cluster"]');
  const raw = mount?.dataset["nodeAnchors"];
  if (!mount || !raw) return out;
  const r = mount.getBoundingClientRect();
  try {
    for (const a of JSON.parse(raw) as { id: string; x: number; y: number }[]) {
      out.set(a.id, { x: r.left + a.x, y: r.top + a.y });
    }
  } catch {
    /* malformed: no flight, plain fade */
  }
  return out;
}

function run(): void {
  const overlay = document.createElement("div");
  overlay.className = "intro";
  overlay.setAttribute("translate", "no");

  const screen = document.createElement("div");
  screen.className = "intro__screen";
  screen.setAttribute("aria-hidden", "true");
  overlay.append(screen);

  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "intro__skip";
  skip.textContent = document.body.dataset["introSkip"] ?? "Skip intro";
  overlay.append(skip);

  document.body.append(overlay);
  root.classList.remove("intro-pending");
  root.classList.add("intro-run");

  let done = false;
  const ctl = new AbortController();

  const cursor = document.createElement("span");
  cursor.className = "intro__cursor";

  function finish(): void {
    if (done) return;
    done = true;
    ctl.abort();
    overlay.remove();
    document.querySelectorAll(".intro-chip").forEach((c) => c.remove());
    root.classList.remove("intro-run");
    window.dispatchEvent(new CustomEvent("intro:done"));
  }

  const skipNow = (): void => finish();
  for (const ev of ["keydown", "pointerdown", "wheel", "touchstart"] as const) {
    window.addEventListener(ev, skipNow, { signal: ctl.signal, passive: true });
  }
  const offMotion = onMotionChange((on) => {
    if (!on) finish();
  });
  ctl.signal.addEventListener("abort", offMotion);

  async function play(): Promise<void> {
    for (const step of STEPS) {
      if (done) return;
      const row = document.createElement("p");
      row.className = "intro__ln intro__ln--in";
      const prompt = document.createElement("span");
      prompt.className = "intro__prompt";
      prompt.textContent = `${step.prompt} `;
      const input = document.createElement("span");
      row.append(prompt, input, cursor);
      screen.append(row);

      for (let i = 1; i <= step.cmd.length; i++) {
        if (done) return;
        input.textContent = step.cmd.slice(0, i);
        await wait(TYPE_MS + (i % 9 === 0 ? 20 : 0));
      }
      await wait(STEP_PAUSE_MS);
      for (const make of step.out) {
        if (done) return;
        screen.append(make());
        await wait(LINE_MS);
      }
      await wait(step.pause ?? STEP_PAUSE_MS);
    }
    if (!done) await handOff();
  }

  async function handOff(): Promise<void> {
    cursor.remove();
    // The mesh chunk loads lazily; give it a moment to publish its cards.
    let anchors = meshAnchors();
    for (let t = 0; anchors.size === 0 && t < 8 && !done; t++) {
      await wait(75);
      anchors = meshAnchors();
    }
    if (done) return;
    const flights: Promise<unknown>[] = [];
    let i = 0;
    for (const atom of screen.querySelectorAll<HTMLElement>(".intro__atom")) {
      const id = atom.dataset["node"] ?? "";
      const to = anchors.get(id);
      // Only fly to cards on screen (on phones the mesh band sits below the fold).
      if (!to || to.y < 0 || to.y > window.innerHeight - 16) continue;
      const from = atom.getBoundingClientRect();
      const chip = document.createElement("span");
      chip.className = "intro-chip";
      chip.setAttribute("aria-hidden", "true");
      chip.textContent = id;
      chip.style.left = `${from.left}px`;
      chip.style.top = `${from.top}px`;
      document.body.append(chip);
      atom.style.visibility = "hidden";

      const dx = to.x - from.left - chip.offsetWidth / 2;
      const dy = to.y - from.top - chip.offsetHeight / 2;
      const delay = i++ * FLIGHT_STAGGER_MS;
      const anim = chip.animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.9)`, opacity: 1, offset: 0.85 },
          { transform: `translate(${dx}px, ${dy}px) scale(1.15)`, opacity: 0 },
        ],
        { duration: FLIGHT_MS, delay, easing: "cubic-bezier(.6,.05,.25,1)", fill: "forwards" },
      );
      flights.push(
        settle(anim, FLIGHT_MS + delay).then(() => {
          window.dispatchEvent(new CustomEvent("beam:nodeup", { detail: id }));
          chip.remove();
        }),
      );
    }

    // Reveal the page while the atoms are still in flight; the shell text goes
    // first so it never sits on top of the hero.
    screen.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: FADE_MS / 2,
      easing: "ease-in",
      fill: "forwards",
    });
    const fade = overlay.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: FADE_MS,
      easing: "ease-out",
      fill: "forwards",
    });
    await settle(fade, FADE_MS);
    overlay.style.pointerEvents = "none";
    await Promise.allSettled(flights);
    finish();
  }

  /** Resolves when `anim` finishes, or after `ms` if the timeline is frozen. */
  function settle(anim: Animation, ms: number): Promise<unknown> {
    return Promise.race([anim.finished, wait(ms + 250)]);
  }

  skip.addEventListener("click", finish, { signal: ctl.signal });

  // Opened in a background tab: hold the first frame until someone looks.
  if (document.hidden) {
    document.addEventListener("visibilitychange", () => void play(), {
      once: true,
      signal: ctl.signal,
    });
  } else {
    void play();
  }
}

if (document.body) run();
else document.addEventListener("DOMContentLoaded", run, { once: true });
