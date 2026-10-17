/**
 * E-06: Contact `{send, Message}` packet dispatch + `{ok, ack}` response.
 * - Uses SSR-reserved `.send__stage`, `[data-send-trigger]`, and `[data-send-status]`
 *   elements so zero layout shift occurs at mount (H1).
 * - Hot-path clean: cached font strings, constant DASH array, no per-element save/restore (M7).
 */
import { isMotionOn, onMotionChange } from "../scripts/motion";
import { scheduler } from "./engine/scheduler";
import { getPalette, onThemeChange, setupCanvas, type ThemePalette } from "./theme";

const DASH: number[] = [4, 4];
const EMPTY_DASH: number[] = [];

export function mountSendMessage(mount: HTMLElement): void {
  if (mount.dataset["fxReady"] === "true") return;

  const sentLabel = mount.dataset["ackPrimary"] ?? "Message sent";
  const ackSub = mount.dataset["ackSub"] ?? "{ok, ack}";
  const stage = mount.querySelector<HTMLElement>("[data-send-stage]");
  const triggerBtn = mount.querySelector<HTMLButtonElement>("[data-send-trigger]");
  const statusOut = mount.querySelector<HTMLElement>("[data-send-status]");
  const statusPrimary = statusOut?.querySelector<HTMLElement>("[data-send-primary]");
  const statusSub = statusOut?.querySelector<HTMLElement>("[data-send-sub]");

  if (!stage) return;

  let palette: ThemePalette = getPalette();
  let phase: "idle" | "outbound" | "inbound" | "ack" = "idle";
  let progress = 0;

  const managed = setupCanvas(
    stage,
    "Erlang message dispatch simulation: client sends {send, Message} to dat@beam and receives {ok, ack}.",
    () => renderFrame(),
    false,
  );
  if (!managed) return;

  const ticker = scheduler.register(
    "send-message",
    (dtMs) => {
      if (phase === "outbound") {
        progress += dtMs * 0.0024;
        if (progress >= 1) {
          phase = "inbound";
          progress = 0;
        }
      } else if (phase === "inbound") {
        progress += dtMs * 0.0026;
        if (progress >= 1) {
          phase = "ack";
          progress = 1;
          showAckBadge();
          ticker.pause();
        }
      }
      renderFrame();
    },
    false,
  );

  function showAckBadge(): void {
    if (statusPrimary) statusPrimary.textContent = sentLabel;
    if (statusSub) statusSub.textContent = ackSub;
    statusOut?.classList.add("is-visible");
    mount.dataset["lastAck"] = ackSub;
  }

  function triggerDispatch(): void {
    if (!isMotionOn()) {
      phase = "ack";
      progress = 1;
      showAckBadge();
      renderFrame();
      return;
    }
    phase = "outbound";
    progress = 0;
    scheduler.setGlobalEnabled(true);
    ticker.start();
  }

  triggerBtn?.addEventListener("click", () => {
    triggerDispatch();
  });

  const mailtoLinks = Array.from(
    mount.querySelectorAll<HTMLAnchorElement>(".send__tuples a"),
  );
  mailtoLinks.forEach((link) => {
    link.addEventListener("click", () => {
      triggerDispatch();
    });
  });

  function renderFrame(): void {
    const { ctx, width, height } = managed!;
    ctx.clearRect(0, 0, width, height);

    const leftX = Math.max(58, width * 0.14);
    const rightX = Math.min(width - 58, width * 0.86);
    const midY = height * 0.52;

    // Channel line
    ctx.strokeStyle = phase === "ack" ? palette.ok : palette.borderStrong;
    ctx.lineWidth = 1.4;
    ctx.setLineDash(DASH);
    ctx.beginPath();
    ctx.moveTo(leftX + 38, midY);
    ctx.lineTo(rightX - 42, midY);
    ctx.stroke();
    ctx.setLineDash(EMPTY_DASH);

    // Client endpoint
    ctx.fillStyle = palette.surface;
    ctx.strokeStyle = palette.msg;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(leftX - 38, midY - 15, 76, 30, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = palette.text;
    ctx.font = palette.mono11;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("caller", leftX, midY);

    // Receiver endpoint (dat@beam)
    ctx.fillStyle = palette.surface;
    ctx.strokeStyle = phase === "ack" ? palette.ok : palette.accentText;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(rightX - 44, midY - 15, 88, 30, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = palette.text;
    ctx.fillText("dat@beam", rightX, midY);

    // Moving packet
    if (phase === "outbound" || phase === "inbound") {
      const startX = phase === "outbound" ? leftX + 42 : rightX - 46;
      const endX = phase === "outbound" ? rightX - 46 : leftX + 42;
      const px = startX + (endX - startX) * progress;
      const label = phase === "outbound" ? "{send, msg}" : ackSub;
      const color = phase === "outbound" ? palette.msg : palette.ok;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, midY, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = palette.mono11Bold;
      ctx.fillText(label, px, midY - 16);
    } else if (phase === "ack") {
      ctx.fillStyle = palette.ok;
      ctx.font = palette.mono11Bold;
      ctx.fillText(`${sentLabel} · ${ackSub}`, (leftX + rightX) * 0.5, midY - 15);
    } else {
      ctx.fillStyle = palette.textMuted;
      ctx.font = palette.mono11;
      ctx.fillText("dat@beam ! {send, Message}", (leftX + rightX) * 0.5, midY - 15);
    }
  }

  onMotionChange((on) => {
    if (!on && (phase === "outbound" || phase === "inbound")) {
      ticker.pause();
      phase = "ack";
      showAckBadge();
      renderFrame();
    }
  });

  onThemeChange((nextPalette) => {
    palette = nextPalette;
    renderFrame();
  });

  renderFrame();
  mount.dataset["fxReady"] = "true";
}
