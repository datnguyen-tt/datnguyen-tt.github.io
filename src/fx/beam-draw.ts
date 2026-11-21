import type {
  BeamNodeSpec,
  BoxRect,
  MeshEdge,
  NodeLifecycle,
  ProtocolId,
} from "./engine/mesh-router";
import type { Supervisor } from "./engine/supervisor";
import type { ThemePalette } from "./theme";

export interface WorkerSlot {
  id: string;
  relX: number;
  relY: number;
  state: "running" | "crashed";
  pulseUntilMs: number;
  statusUntilMs: number;
  flash: "red" | "green" | null;
  pid: number;
}

export interface MeshNodeCard {
  idx: number;
  spec: BeamNodeSpec;
  cx: number;
  cy: number;
  w: number;
  h: number;
  rect: BoxRect;
  supRelX: number;
  supRelY: number;
  workers: WorkerSlot[];
  sup: Supervisor;
  lifecycle: NodeLifecycle;
  downUntilMs: number;
  healUntilMs: number;
  statusText: string;
  statusUntilMs: number;
}

export interface MeshPacket {
  fromIdx: number;
  toIdx: number;
  viaIdx: number | null;
  leg: 0 | 1;
  progress: number;
  speed: number;
  protocol: ProtocolId;
  label: string;
  showLabel: boolean;
  rerouted: boolean;
  dropping: boolean;
  dropAlpha: number;
}

export type HitTarget =
  | { kind: "worker"; nodeIdx: number; workerIdx: number }
  | { kind: "node"; nodeIdx: number }
  | null;

export const DASH_DOWN: number[] = [5, 5];
export const DASH_REROUTE: number[] = [3, 3];
export const NO_DASH: number[] = [];

export const PTR_MAX_LINK = 340;

export interface PointerState {
  x: number;
  y: number;
  sx: number;
  sy: number;
  state: "up" | "down";
  changedMs: number;
  lastMoveMs: number;
  nextPktMs: number;
  links: number[];
  packets: { idx: number; t: number; out: boolean }[];
}

/** Everything the canvas painters read; the mesh updates it once per frame. */
export interface Scene {
  palette: ThemePalette;
  nodes: readonly MeshNodeCard[];
  edges: readonly MeshEdge[];
  packets: readonly MeshPacket[];
  hoveredHit: HitTarget;
  isBandMode: boolean;
  ptr: PointerState;
}

export function protocolColor(palette: ThemePalette, proto: ProtocolId): string {
  switch (proto) {
    case "SIP":
      return palette.protoSip;
    case "Diameter":
      return palette.protoDiameter;
    case "NETCONF":
      return palette.protoNetconf;
    case "MQTT":
      return palette.protoMqtt;
    case "Erlang":
      return palette.protoErlang;
  }
}

export function drawScene(
  s: Scene,
  ctx: CanvasRenderingContext2D,
  nowMs: number,
  copyRect: BoxRect | null,
): void {
  drawMeshLinks(s, ctx, nowMs, false);

  // Links behind `.hero__copy` are re-cleared and re-drawn dimmed so the copy stays readable.
  if (copyRect) {
    const pad = 8;
    const x = copyRect.left - pad;
    const y = copyRect.top - pad;
    const w = copyRect.right - copyRect.left + pad * 2;
    const h = copyRect.bottom - copyRect.top + pad * 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.clearRect(x, y, w, h);
    drawMeshLinks(s, ctx, nowMs, true);
    ctx.restore();
  }

  drawPackets(s, ctx, copyRect);
  drawNodeCards(s, ctx, nowMs);
  drawPointerNode(s, ctx, nowMs);
  ctx.globalAlpha = 1;
}

function drawPointerNode(
  s: Scene,
  ctx: CanvasRenderingContext2D,
  nowMs: number,
): void {
  const since = nowMs - s.ptr.changedMs;
  const fading = s.ptr.state === "down" && since < 900;
  if (s.ptr.state === "down" && !fading) return;

  ctx.save();
  if (s.ptr.state === "up") {
    for (const idx of s.ptr.links) {
      const n = s.nodes[idx]!;
      const d = Math.hypot(n.cx - s.ptr.sx, n.cy - s.ptr.sy);
      ctx.globalAlpha = Math.max(0.12, 1 - d / PTR_MAX_LINK) * 0.7;
      ctx.strokeStyle = s.palette.msg;
      ctx.lineWidth = 1;
      ctx.setLineDash(DASH_REROUTE);
      ctx.beginPath();
      ctx.moveTo(s.ptr.sx, s.ptr.sy);
      ctx.lineTo(n.cx, n.cy);
      ctx.stroke();
    }
    ctx.setLineDash(NO_DASH);
    for (const p of s.ptr.packets) {
      const n = s.nodes[p.idx]!;
      const f = p.out ? p.t : 1 - p.t;
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = s.palette.protoErlang;
      ctx.beginPath();
      ctx.arc(
        s.ptr.sx + (n.cx - s.ptr.sx) * f,
        s.ptr.sy + (n.cy - s.ptr.sy) * f,
        2.6,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }

  const fade = fading ? 1 - since / 900 : 1;
  const joining = s.ptr.state === "up" && since < 600;
  ctx.globalAlpha = 0.9 * fade;
  ctx.fillStyle = fading ? s.palette.accentText : s.palette.msg;
  ctx.beginPath();
  ctx.arc(s.ptr.sx, s.ptr.sy, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = (joining ? 0.9 - since / 700 : 0.5) * fade;
  ctx.strokeStyle = fading ? s.palette.accentText : joining ? s.palette.ok : s.palette.msg;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(s.ptr.sx, s.ptr.sy, joining ? 8 + since / 40 : fading ? 8 + since / 60 : 8, 0, Math.PI * 2);
  ctx.stroke();

  // Label: hover hint > nodeup/nodedown > id
  let label = "client@you";
  if (fading) label = "nodedown";
  else if (joining) label = "nodeup";
  else if (s.hoveredHit?.kind === "worker") label = "click → exit(Pid, kill)";
  else if (s.hoveredHit?.kind === "node") label = "click → nodedown";
  ctx.font = s.palette.mono9;
  ctx.globalAlpha = (s.hoveredHit && !fading ? 0.95 : 0.7) * fade;
  ctx.fillStyle = fading ? s.palette.accentText : joining ? s.palette.ok : s.palette.textMuted;
  ctx.fillText(label, s.ptr.sx + 12, s.ptr.sy - 10);
  ctx.restore();
}

function drawMeshLinks(
  s: Scene,
  ctx: CanvasRenderingContext2D,
  nowMs: number,
  behindCopy: boolean,
): void {
  const baseAlpha = behindCopy
    ? 0.12
    : s.palette.isLight
      ? 0.28
      : 0.44;

  for (let i = 0; i < s.edges.length; i++) {
    const e = s.edges[i]!;
    const na = s.nodes[e.a];
    const nb = s.nodes[e.b];
    if (!na || !nb) continue;

    const isDownEdge =
      na.lifecycle === "down" || nb.lifecycle === "down";
    const isHealing = e.pulseUntilMs > nowMs;
    const isReroute = !isDownEdge && e.rerouteUntilMs > nowMs;

    if (isDownEdge) {
      ctx.strokeStyle = s.palette.accentText;
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = behindCopy ? 0.12 : 0.78;
      ctx.setLineDash(DASH_DOWN);
    } else if (isHealing) {
      ctx.strokeStyle = s.palette.ok;
      ctx.lineWidth = 1.75;
      ctx.globalAlpha = behindCopy ? 0.12 : 0.88;
      ctx.setLineDash(NO_DASH);
    } else if (isReroute) {
      ctx.strokeStyle = s.palette.warn;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = behindCopy ? 0.12 : 0.82;
      ctx.setLineDash(DASH_REROUTE);
    } else {
      ctx.strokeStyle = s.palette.borderStrong;
      ctx.lineWidth = 1.05;
      ctx.globalAlpha = baseAlpha;
      ctx.setLineDash(NO_DASH);
    }

    ctx.beginPath();
    ctx.moveTo(na.cx, na.cy);
    ctx.lineTo(nb.cx, nb.cy);
    ctx.stroke();
  }
  ctx.setLineDash(NO_DASH);
}

function drawPackets(
  s: Scene,
  ctx: CanvasRenderingContext2D,
  copyRect: BoxRect | null,
): void {
  const active = s.packets;
  ctx.font = s.palette.mono9;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  for (let i = 0; i < active.length; i++) {
    const pkt = active[i]!;
    const startIdx =
      pkt.viaIdx !== null && pkt.leg === 1 ? pkt.viaIdx : pkt.fromIdx;
    const endIdx =
      pkt.viaIdx !== null && pkt.leg === 0 ? pkt.viaIdx : pkt.toIdx;
    const a = s.nodes[startIdx];
    const b = s.nodes[endIdx];
    if (!a || !b) continue;

    const x = a.cx + (b.cx - a.cx) * pkt.progress;
    const y = a.cy + (b.cy - a.cy) * pkt.progress;

    const inCopy =
      copyRect !== null &&
      x >= copyRect.left &&
      x <= copyRect.right &&
      y >= copyRect.top &&
      y <= copyRect.bottom;

    const color = pkt.dropping
      ? s.palette.accentText
      : pkt.rerouted
        ? s.palette.warn
        : protocolColor(s.palette, pkt.protocol);

    const alpha = inCopy
      ? 0.16
      : pkt.dropping
        ? pkt.dropAlpha
        : 0.92;

    const tailT = Math.max(0, pkt.progress - 0.08);
    const tx = a.cx + (b.cx - a.cx) * tailT;
    const ty = a.cy + (b.cy - a.cy) * tailT;

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = pkt.rerouted ? 2.1 : 1.7;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.globalAlpha = alpha * 0.28;
    ctx.beginPath();
    ctx.arc(x, y, pkt.rerouted ? 6 : 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, pkt.rerouted ? 3 : 2.5, 0, Math.PI * 2);
    ctx.fill();

    if (pkt.showLabel && !inCopy && !s.isBandMode) {
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha * 0.92;
      ctx.fillText(
        pkt.rerouted ? `↻ ${pkt.label}` : pkt.label,
        x,
        y - 6,
      );
    }
  }
}

function drawNodeCards(
  s: Scene,
  ctx: CanvasRenderingContext2D,
  nowMs: number,
): void {
  for (let i = 0; i < s.nodes.length; i++) {
    const n = s.nodes[i]!;
    const { left, top } = n.rect;
    const isHoveredNode =
      s.hoveredHit?.nodeIdx === i && s.hoveredHit.kind === "node";

    ctx.globalAlpha = n.lifecycle === "down" ? 0.88 : 0.97;
    ctx.fillStyle = s.palette.surface;
    let borderCol = s.palette.borderStrong;
    if (n.lifecycle === "down") {
      borderCol = s.palette.accentText;
    } else if (n.healUntilMs > nowMs) {
      borderCol = s.palette.ok;
    } else if (n.lifecycle === "restarting") {
      borderCol = s.palette.warn;
    } else if (isHoveredNode) {
      borderCol = s.palette.msg;
    }

    ctx.strokeStyle = borderCol;
    ctx.lineWidth =
      n.lifecycle === "down" || n.healUntilMs > nowMs || isHoveredNode
        ? 1.75
        : s.palette.isLight
          ? 1.45
          : 1.15;
    if (
      s.palette.isLight &&
      n.lifecycle === "up" &&
      n.healUntilMs <= nowMs &&
      !isHoveredNode
    ) {
      ctx.strokeStyle = s.palette.textMuted;
    }
    if (n.lifecycle === "down") ctx.setLineDash(DASH_DOWN);

    ctx.beginPath();
    ctx.roundRect(left, top, n.w, n.h, 7);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash(NO_DASH);

    const headerH = s.isBandMode ? 19 : 22;
    ctx.strokeStyle = s.palette.border;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(left + 6, top + headerH);
    ctx.lineTo(left + n.w - 6, top + headerH);
    ctx.stroke();

    const ledX = left + 10;
    const ledY = top + headerH * 0.52;
    const ledColor =
      n.lifecycle === "down"
        ? s.palette.accentText
        : n.lifecycle === "restarting"
          ? s.palette.warn
          : s.palette.ok;

    ctx.fillStyle = ledColor;
    ctx.globalAlpha = 0.26;
    ctx.beginPath();
    ctx.arc(ledX, ledY, 5.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(ledX, ledY, 2.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = s.isBandMode ? s.palette.mono10Bold : s.palette.mono11Bold;
    ctx.fillStyle =
      n.lifecycle === "down" ? s.palette.accentText : s.palette.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(n.spec.shortName, left + 18, ledY);

    if (!s.isBandMode) {
      ctx.font = s.palette.mono9;
      ctx.fillStyle = n.statusText
        ? n.lifecycle === "down"
          ? s.palette.accentText
          : n.healUntilMs > nowMs
            ? s.palette.ok
            : s.palette.warn
        : s.palette.textMuted;
      ctx.fillText(
        n.statusText || n.spec.role,
        left + 8,
        top + headerH + 9,
      );
    }

    const supX = n.cx + n.supRelX;
    const supY = n.cy + n.supRelY + (s.isBandMode ? 2 : 5);

    for (let wIdx = 0; wIdx < n.workers.length; wIdx++) {
      const w = n.workers[wIdx]!;
      const wx = n.cx + w.relX;
      const wy = n.cy + w.relY + (s.isBandMode ? 2 : 5);

      ctx.strokeStyle =
        w.state === "crashed"
          ? s.palette.accentText
          : w.flash === "green"
            ? s.palette.ok
            : s.palette.borderStrong;
      ctx.lineWidth = 0.95;
      ctx.globalAlpha = n.lifecycle === "down" ? 0.35 : 0.78;
      ctx.beginPath();
      ctx.moveTo(supX + 4, supY);
      ctx.lineTo(wx, wy);
      ctx.stroke();

      // Worker dot + message handling / restart ring
      const isHoveredWorker =
        s.hoveredHit?.kind === "worker" &&
        s.hoveredHit.nodeIdx === i &&
        s.hoveredHit.workerIdx === wIdx;
      const isPulsing = w.pulseUntilMs > nowMs;

      let wColor = protocolColor(s.palette, n.spec.protocol);
      if (n.lifecycle === "down" || w.state === "crashed" || w.flash === "red") {
        wColor = s.palette.accentText;
      } else if (w.flash === "green") {
        wColor = s.palette.ok;
      }

      if (isPulsing || w.flash !== null || isHoveredWorker) {
        ctx.strokeStyle =
          w.state === "crashed"
            ? s.palette.accentText
            : w.flash === "green"
              ? s.palette.ok
              : wColor;
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(wx, wy, 6.2, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.globalAlpha = n.lifecycle === "down" ? 0.45 : 0.96;
      ctx.fillStyle =
        w.state === "crashed" ? s.palette.accent : wColor;
      ctx.beginPath();
      ctx.arc(wx, wy, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mini supervisor square inside card
    ctx.globalAlpha = n.lifecycle === "down" ? 0.5 : 0.98;
    ctx.fillStyle = s.palette.surface2;
    ctx.strokeStyle =
      n.lifecycle === "down" ? s.palette.accentText : s.palette.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(supX - 4.2, supY - 4.2, 8.4, 8.4);
    ctx.fill();
    ctx.stroke();
  }
}
