/**
 * E-03: Mailbox FIFO visualization in About section.
 * - Height is SSR-reserved under `html.js .fx--mailbox` (zero CLS).
 * - Measures pill text once per palette/font change via `ctx.measureText` and
 *   lays pills out in ONE non-overlapping row with fixed gap; caps max queued
 *   messages to fit the available box width; uses shorter atoms on <520px.
 * - Smoothly shifts pills on dequeue.
 */
import { isMotionOn, isVisible, onMotionChange } from "../scripts/motion";
import { Mailbox } from "./engine/mailbox";
import { scheduler } from "./engine/scheduler";
import { getPalette, onThemeChange, setupCanvas, type ThemePalette } from "./theme";

interface FactToken {
  idx: number;
  fullTag: string;
  shortTag: string;
  isHeartbeat: boolean;
}

interface ActivePill {
  token: FactToken;
  x: number;
  targetX: number;
  width: number;
}

const HEARTBEAT: FactToken = {
  idx: -1,
  fullTag: "{heartbeat, ok}",
  shortTag: "{hb}",
  isHeartbeat: true,
};

function factTokens(items: readonly HTMLElement[]): FactToken[] {
  const tokens = items.map((li, idx) => {
    const atom = li.dataset["atom"] ?? "stat";
    const value = li.dataset["value"] ?? "";
    return {
      idx,
      fullTag: `{${atom}, ${value}}`,
      shortTag: `{${value}}`,
      isHeartbeat: false,
    };
  });
  tokens.push(HEARTBEAT);
  return tokens;
}

const PILL_GAP = 8;
const PILL_PAD_X = 16;

export function mountMailboxFifo(mount: HTMLElement): void {
  if (mount.dataset["fxReady"] === "true") return;

  const captionPrimary = mount.dataset["caption"] ?? "4 facts, in order";
  const captionSub = mount.dataset["captionSub"] ?? "mailbox: FIFO";
  const section = mount.closest("section") ?? document.body;
  const factItems = Array.from(
    section.querySelectorAll<HTMLElement>(".stats > li"),
  );
  const FACT_TOKENS = factTokens(factItems);

  let palette: ThemePalette = getPalette();
  const mailbox = new Mailbox<FactToken>(8, 6);
  const activePills: ActivePill[] = [];
  let tokenCursor = 0;
  let enqueueAccumMs = 0;
  let dequeueAccumMs = 0;
  let activeFactIdx = 0;
  let receivingPill: {
    label: string;
    isHeartbeat: boolean;
    progress: number;
    width: number;
    startX: number;
  } | null = null;

  // Cached measured widths per token (recomputed only on resize/palette change)
  let useShortAtoms = false;
  const measuredWidths = new Map<string, number>();

  function highlightFact(idx: number): void {
    activeFactIdx = idx;
    factItems.forEach((li, i) => {
      li.classList.toggle("is-pulsing", i === idx);
    });
  }

  const managed = setupCanvas(
    mount,
    `${captionPrimary} (${captionSub})`,
    (w) => {
      updateMeasurements(w);
      recomputeTargets(w);
      while (activePills.length < 4) {
        const before = activePills.length;
        enqueueNext(true);
        if (activePills.length === before) break;
      }
      renderFrame();
    },
    false,
  );
  if (!managed) return;

  function updateMeasurements(width: number): void {
    useShortAtoms = window.innerWidth < 520 || width < 400;
    const { ctx } = managed!;
    ctx.font = palette.mono11;
    measuredWidths.clear();
    for (const t of FACT_TOKENS) {
      const label = useShortAtoms ? t.shortTag : t.fullTag;
      const w = Math.ceil(ctx.measureText(label).width) + PILL_PAD_X;
      measuredWidths.set(label, w);
    }
    for (const p of activePills) {
      const label = useShortAtoms ? p.token.shortTag : p.token.fullTag;
      p.width = measuredWidths.get(label) ?? 72;
    }
  }

  function getBoxGeometry(width: number): {
    boxX: number;
    boxW: number;
    innerLeft: number;
    innerRight: number;
    receiveX: number;
  } {
    const isNarrow = width < 520;
    const boxX = isNarrow ? 12 : 20;
    const rightReserve = isNarrow ? 96 : 165;
    const boxW = Math.max(150, width - boxX - rightReserve);
    const innerLeft = boxX + 10;
    const innerRight = boxX + boxW - 10;
    const receiveX = Math.min(width - 54, boxX + boxW + (isNarrow ? 48 : 84));
    return { boxX, boxW, innerLeft, innerRight, receiveX };
  }

  function canFitPill(newPillWidth: number, width: number): boolean {
    const { innerLeft, innerRight } = getBoxGeometry(width);
    const avail = innerRight - innerLeft;
    let used = 0;
    for (let i = 0; i < activePills.length; i++) {
      used += activePills[i]!.width + (i > 0 ? PILL_GAP : 0);
    }
    const nextTotal = used + (activePills.length > 0 ? PILL_GAP : 0) + newPillWidth;
    return nextTotal <= avail;
  }

  function recomputeTargets(width: number): void {
    const { innerLeft, innerRight } = getBoxGeometry(width);
    const avail = innerRight - innerLeft;

    // Trim tail pills if resize made the strip narrower than current queue
    while (activePills.length > 1) {
      let total = 0;
      for (let i = 0; i < activePills.length; i++) {
        total += activePills[i]!.width + (i > 0 ? PILL_GAP : 0);
      }
      if (total <= avail) break;
      activePills.pop();
    }

    let cursorX = innerLeft;
    for (let i = 0; i < activePills.length; i++) {
      const pill = activePills[i]!;
      pill.targetX = cursorX;
      cursorX += pill.width + PILL_GAP;
    }
  }

  function enqueueNext(snapImmediately = false): void {
    const width = managed!.width;
    const token = FACT_TOKENS[tokenCursor % FACT_TOKENS.length]!;
    const label = useShortAtoms ? token.shortTag : token.fullTag;
    const pillW = measuredWidths.get(label) ?? 72;

    if (!canFitPill(pillW, width)) return;
    if (!mailbox.send(token)) return;

    tokenCursor++;
    const { innerRight } = getBoxGeometry(width);
    const pill: ActivePill = {
      token,
      x: snapImmediately ? 0 : innerRight - pillW,
      targetX: 0,
      width: pillW,
    };
    activePills.push(pill);
    recomputeTargets(width);
    if (snapImmediately) {
      pill.x = pill.targetX;
    }
  }

  // Seed initial queue so static frame shows non-overlapping FIFO pills
  updateMeasurements(managed.width);
  for (let i = 0; i < 4; i++) {
    enqueueNext(true);
  }
  highlightFact(0);

  function tick(dtMs: number): void {
    const width = managed!.width;
    enqueueAccumMs += dtMs;
    dequeueAccumMs += dtMs;

    if (enqueueAccumMs >= 980) {
      enqueueAccumMs = 0;
      enqueueNext(false);
    }

    if (dequeueAccumMs >= 1150) {
      dequeueAccumMs = 0;
      const msg = mailbox.receive((m) => !m.isHeartbeat) ?? mailbox.receive();
      if (msg) {
        const pillIdx = activePills.findIndex((p) => p.token === msg);
        const removed =
          pillIdx !== -1 ? activePills.splice(pillIdx, 1)[0] : activePills.shift();
        const label = useShortAtoms ? msg.shortTag : msg.fullTag;
        receivingPill = {
          label,
          isHeartbeat: msg.isHeartbeat,
          progress: 0,
          width: removed?.width ?? (measuredWidths.get(label) ?? 72),
          startX: removed?.x ?? getBoxGeometry(width).innerLeft,
        };
        if (msg.idx >= 0) {
          highlightFact(msg.idx);
        }
        recomputeTargets(width);
      }
    }

    // Smoothly slide queued pills toward their non-overlapping target slot
    const lerp = Math.min(1, dtMs * 0.014);
    for (let i = 0; i < activePills.length; i++) {
      const p = activePills[i]!;
      p.x += (p.targetX - p.x) * lerp;
    }

    if (receivingPill) {
      receivingPill.progress = Math.min(1, receivingPill.progress + dtMs * 0.0028);
      if (receivingPill.progress >= 1) {
        receivingPill = null;
      }
    }

    renderFrame();
  }

  function renderFrame(): void {
    const { ctx, width, height } = managed!;
    ctx.clearRect(0, 0, width, height);

    const { boxX, boxW, receiveX } = getBoxGeometry(width);
    const boxY = 30;
    const boxH = 44;
    const pillH = 26;
    const pillY = boxY + (boxH - pillH) / 2;

    // 1. Caption header row: Primary plain text + muted mono secondary
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = palette.sans11;
    ctx.fillStyle = palette.text;
    ctx.fillText(captionPrimary, boxX, 14);
    const primaryW = ctx.measureText(captionPrimary).width;

    ctx.font = palette.mono11;
    ctx.fillStyle = palette.textMuted;
    ctx.fillText(`· ${captionSub} (${activePills.length})`, boxX + primaryW + 8, 14);

    // 2. Mailbox container
    ctx.fillStyle = palette.surface;
    ctx.strokeStyle = palette.borderStrong;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 6);
    ctx.fill();
    ctx.stroke();

    // 3. Queued message pills (clipped strictly to mailbox interior, single non-overlapping row)
    ctx.save();
    ctx.beginPath();
    ctx.rect(boxX + 4, boxY + 2, boxW - 8, boxH - 4);
    ctx.clip();

    ctx.font = palette.mono11;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < activePills.length; i++) {
      const p = activePills[i]!;
      const label = useShortAtoms ? p.token.shortTag : p.token.fullTag;
      const isHead = i === 0;
      ctx.fillStyle = palette.bg;
      ctx.strokeStyle = p.token.isHeartbeat
        ? palette.textMuted
        : isHead
          ? palette.msg
          : palette.borderStrong;
      ctx.lineWidth = isHead ? 1.5 : 1.1;
      ctx.beginPath();
      ctx.roundRect(p.x, pillY, p.width, pillH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = p.token.isHeartbeat ? palette.textMuted : palette.text;
      ctx.fillText(label, p.x + p.width * 0.5, pillY + pillH * 0.5);
    }
    ctx.restore();

    // 4. Arrow from mailbox head to consumer node
    const arrowStartX = boxX + boxW + 6;
    const arrowEndX = receiveX - 18;
    const midY = boxY + boxH * 0.5;
    if (arrowEndX > arrowStartX + 8) {
      ctx.strokeStyle = palette.borderStrong;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(arrowStartX, midY);
      ctx.lineTo(arrowEndX, midY);
      ctx.stroke();
    }

    // 5. Dequeuing pill animation
    if (receivingPill) {
      const t = receivingPill.progress;
      const drop = Math.min(1, t / 0.2, (1 - t) / 0.2);
      const slide = Math.min(1, Math.max(0, (t - 0.2) / 0.6));
      const px =
        receivingPill.startX +
        (receiveX - receivingPill.width * 0.5 - receivingPill.startX) * slide;
      const py = pillY + (boxH - 4) * drop;
      ctx.globalAlpha = 1 - t * 0.55;
      ctx.fillStyle = palette.surface;
      ctx.strokeStyle = receivingPill.isHeartbeat ? palette.textMuted : palette.ok;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(px, py, receivingPill.width, pillH, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = palette.text;
      ctx.font = palette.mono11;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        receivingPill.label,
        px + receivingPill.width * 0.5,
        py + pillH * 0.5,
      );
      ctx.globalAlpha = 1;
    }

    // 6. Consumer node badge on the right
    ctx.fillStyle = palette.surface;
    ctx.strokeStyle = palette.ok;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(receiveX, midY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = palette.ok;
    ctx.font = palette.mono11Bold;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`#${activeFactIdx + 1}`, receiveX, midY);

    if (width >= 520) {
      ctx.fillStyle = palette.textMuted;
      ctx.font = palette.mono11;
      ctx.textAlign = "left";
      ctx.fillText("receive", receiveX + 18, midY);
    }
  }

  const ticker = scheduler.register("mailbox-fifo", tick, false);
  let visible = false;

  function syncRunState(): void {
    scheduler.setGlobalEnabled(isMotionOn());
    if (visible && isMotionOn()) {
      ticker.start();
    } else {
      ticker.pause();
      renderFrame();
    }
  }

  isVisible(mount, (v) => {
    visible = v;
    syncRunState();
  });

  onMotionChange(() => syncRunState());
  onThemeChange((nextPalette) => {
    palette = nextPalette;
    updateMeasurements(managed.width);
    recomputeTargets(managed.width);
    renderFrame();
  });

  // Expose pill geometry helper for QA verification (asserting zero pill overlap)
  (
    mount as HTMLElement & {
      __getMailboxPills?: () => { x: number; width: number; label: string }[];
    }
  ).__getMailboxPills = () =>
    activePills.map((p) => ({
      x: p.x,
      width: p.width,
      label: useShortAtoms ? p.token.shortTag : p.token.fullTag,
    }));

  mount.dataset["fxReady"] = "true";
}
