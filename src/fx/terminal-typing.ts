/**
 * E-02: Progressive terminal typing in the Hero Erlang shell + live simulation log sink.
 * - Uses head-applied `html.terminal-typing-init` CSS rule so lines are hidden
 *   before first paint with zero flash and zero CLS (L15).
 * - Exposes `appendTerminalLog(mount, text, kind)` so E-01 v2 BEAM mesh can stream
 *   live OTP SASL / net_kernel events (`=ERROR REPORT====`, `=PROGRESS REPORT==`,
 *   `nodedown`, `nodeup`) into `[data-terminal-live]` (max 6 visible lines).
 */
import { isMotionOn, isVisible, onMotionChange } from "../scripts/motion";

export type TerminalLogKind = "err" | "ok" | "warn" | "muted";

interface StepItem {
  promptRow: HTMLElement;
  inputSpan: HTMLElement;
  fullInput: string;
  outputRow: HTMLElement;
}

const MAX_LIVE_LOGS_DESKTOP = 4;
const MAX_LIVE_LOGS_MOBILE = 3;

/**
 * Append a live simulation event line to the Hero glass terminal.
 * Keeps at most 4 lines on desktop (3 on mobile), scrolling out the oldest
 * inside the fixed-height `[data-terminal-live]` region (zero CLS, `aria-hidden="true"`).
 */
export function appendTerminalLog(
  lineText: string,
  kind: TerminalLogKind = "muted",
): void {
  const liveBox = document.querySelector<HTMLElement>("[data-terminal-live]");
  if (!liveBox) return;

  const seed = liveBox.querySelector<HTMLElement>("[data-log-seed]");
  if (seed) seed.remove();

  const p = document.createElement("p");
  p.className = `terminal__log terminal__log--${kind}`;
  p.setAttribute("data-log-line", kind);
  p.textContent = lineText;
  liveBox.appendChild(p);

  const maxLines =
    window.innerWidth <= 900 ? MAX_LIVE_LOGS_MOBILE : MAX_LIVE_LOGS_DESKTOP;
  const lines = liveBox.querySelectorAll(":scope > .terminal__log");
  while (lines.length > maxLines) {
    liveBox.firstElementChild?.remove();
    break;
  }
}

export function mountTerminalTyping(mount: HTMLElement): void {
  if (mount.dataset["fxReady"] === "true") return;
  const body = mount.querySelector<HTMLElement>(".terminal__body");
  if (!body) return;

  // Preserve full static text for screen readers; hide animated visual copy from AT
  const srCopy = document.createElement("div");
  srCopy.className = "sr-only";
  srCopy.textContent = body.textContent ?? "";
  mount.appendChild(srCopy);
  body.setAttribute("aria-hidden", "true");

  const rows = Array.from(body.querySelectorAll<HTMLElement>(":scope > .ln"));
  const steps: StepItem[] = [];
  for (let i = 0; i + 1 < rows.length; i += 2) {
    const promptRow = rows[i]!;
    const outputRow = rows[i + 1]!;
    const inputSpan = promptRow.querySelector<HTMLElement>(".i");
    if (inputSpan && outputRow.classList.contains("o")) {
      steps.push({
        promptRow,
        inputSpan,
        fullInput: inputSpan.textContent ?? "",
        outputRow,
      });
    }
  }
  const finalPromptRow = rows[rows.length - 1] ?? null;
  const cursor = body.querySelector<HTMLElement>(".cursor");

  let timer: ReturnType<typeof setTimeout> | null = null;
  let stepIdx = 0;
  let charIdx = 0;
  let phase: "typing" | "output" | "done" = "typing";
  let visible = true;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function showAllInstantly(): void {
    clearTimer();
    phase = "done";
    document.documentElement.classList.remove("terminal-typing-init");
    for (const s of steps) {
      s.promptRow.style.visibility = "visible";
      s.inputSpan.style.visibility = "visible";
      s.inputSpan.textContent = s.fullInput;
      s.outputRow.style.visibility = "visible";
    }
    if (finalPromptRow) {
      finalPromptRow.style.visibility = "visible";
      if (cursor && cursor.parentElement !== finalPromptRow) {
        finalPromptRow.appendChild(cursor);
      }
    }
    mount.dataset["typingState"] = "done";
  }

  function resetAnimation(): void {
    clearTimer();
    stepIdx = 0;
    charIdx = 0;
    phase = "typing";
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]!;
      s.promptRow.style.visibility = i === 0 ? "visible" : "hidden";
      s.inputSpan.style.visibility = "visible";
      s.inputSpan.textContent = "";
      s.outputRow.style.visibility = "hidden";
    }
    if (finalPromptRow) {
      finalPromptRow.style.visibility = "hidden";
    }
    if (cursor && steps[0]) {
      steps[0].promptRow.appendChild(cursor);
    }
    document.documentElement.classList.remove("terminal-typing-init");
    mount.dataset["typingState"] = "typing";
  }

  function stepTick(): void {
    timer = null;
    if (!isMotionOn()) {
      showAllInstantly();
      return;
    }
    if (!visible || phase === "done") return;

    const current = steps[stepIdx];
    if (!current) {
      showAllInstantly();
      return;
    }

    if (phase === "typing") {
      current.promptRow.style.visibility = "visible";
      if (cursor && cursor.parentElement !== current.promptRow) {
        current.promptRow.appendChild(cursor);
      }
      if (charIdx < current.fullInput.length) {
        charIdx++;
        current.inputSpan.textContent = current.fullInput.slice(0, charIdx);
        timer = setTimeout(stepTick, 20);
      } else {
        phase = "output";
        timer = setTimeout(stepTick, 95);
      }
    } else if (phase === "output") {
      current.outputRow.style.visibility = "visible";
      stepIdx++;
      charIdx = 0;
      if (stepIdx < steps.length) {
        phase = "typing";
        timer = setTimeout(stepTick, 140);
      } else {
        showAllInstantly();
      }
    }
  }

  if (isMotionOn()) {
    resetAnimation();
    timer = setTimeout(stepTick, 90);
  } else {
    showAllInstantly();
  }

  isVisible(mount, (v) => {
    visible = v;
    if (!v) {
      clearTimer();
    } else if (isMotionOn() && phase !== "done" && timer === null) {
      timer = setTimeout(stepTick, 50);
    }
  });

  onMotionChange((on) => {
    if (!on) {
      showAllInstantly();
    }
  });

  mount.dataset["fxReady"] = "true";
}
