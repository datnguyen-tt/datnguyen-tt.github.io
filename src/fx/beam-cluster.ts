/**
 * E-01 v2: "Fault-tolerant BEAM mesh" in Hero.
 * - Desktop (>900px): 6 domain BEAM VM cards (`sbg1@sig-01`, `nso1@netauto`, …) in a
 *   single full-mesh network (15 links)
 *   spanning the entire hero. Links and protocol packets pass behind the glass terminal;
 *   every node card rectangle is strictly outside `.hero__copy` and `.terminal`.
 * - Mobile (≤900px): 4 compact BEAM VM cards (`sbg`, `nso`, `mnesia`, `iot`) in a
 *   connected full-mesh (6 links) inside the dedicated band below CTAs.
 * - Inside each card: mini supervision tree (1 supervisor square + 3–4 worker dots)
 *   plus a status LED (green up / red down / amber restarting).
 * - Click a worker dot -> worker crash (red, EXIT) -> supervisor restart (green ring).
 * - Click node card header/supervisor -> `nodedown`: links turn red dashed, in-flight
 *   packets to it drop, new traffic reroutes via a healthy relay node, and after ~2s
 *   `nodeup` heals with a green link pulse.
 * - Chaos monkey triggers a worker crash or `nodedown` every 6–9s when idle.
 */
import { isMotionOn, isVisible, onMotionChange } from "../scripts/motion";
import {
  buildFullMeshEdges,
  findMeshEdgeIndex,
  getActiveNodeSpecs,
  planRoute,
  PROTOCOL_SPECS,
  rectsOverlap,
  selectRelayNode,
  type BeamNodeSpec,
  type BoxRect,
  type MeshEdge,
  type NodeLifecycle,
  type ProtocolId,
} from "./engine/mesh-router";
import { ObjectPool } from "./engine/pool";
import { scheduler } from "./engine/scheduler";
import { Supervisor } from "./engine/supervisor";
import { appendTerminalLog } from "./terminal-typing";
import {
  getPalette,
  getParticleCap,
  onThemeChange,
  setupCanvas,
  type ThemePalette,
} from "./theme";

interface WorkerSlot {
  id: string;
  relX: number;
  relY: number;
  state: "running" | "crashed";
  pulseUntilMs: number;
  statusUntilMs: number;
  flash: "red" | "green" | null;
  pid: number;
}

interface MeshNodeCard {
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

interface MeshPacket {
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

type HitTarget =
  | { kind: "worker"; nodeIdx: number; workerIdx: number }
  | { kind: "node"; nodeIdx: number }
  | null;

const DASH_DOWN: number[] = [5, 5];
const DASH_REROUTE: number[] = [3, 3];
const NO_DASH: number[] = [];

export function mountBeamCluster(mount: HTMLElement): void {
  if (mount.dataset["fxReady"] === "true") return;

  const ariaLabel =
    mount.dataset["aria"] ??
    "Interactive fault-tolerant BEAM mesh simulation: 6 distributed Erlang nodes exchange packets; click a worker to crash it or click a node to trigger nodedown failover.";
  const escalatedMsg =
    mount.dataset["escalated"] ??
    "max restart intensity reached — supervisor shut down, parent restarts it";

  const hudLabels = {
    observer: mount.dataset["hudObserver"] ?? "observer",
    nodes: mount.dataset["hudNodes"] ?? "nodes",
    msgs: mount.dataset["hudMsgs"] ?? "msgs/s",
    restarts: mount.dataset["hudRestarts"] ?? "restarts",
    netsplits: mount.dataset["hudNetsplits"] ?? "netsplits",
    sim: mount.dataset["hudSim"] ?? "simulation",
  };

  const heroSection = mount.closest("section") ?? mount.parentElement;
  const copyEl = heroSection?.querySelector<HTMLElement>(".hero__copy") ?? null;
  const termEl = heroSection?.querySelector<HTMLElement>(".terminal") ?? null;
  const demoBtn = mount.querySelector<HTMLButtonElement>("[data-beam-demo]");
  const liveOut = mount.querySelector<HTMLElement>("[data-beam-live]");
  const hudEl = mount.querySelector<HTMLElement>("[data-beam-hud]");
  const hintPrimary = mount.querySelector<HTMLElement>(".beam-hint__primary");
  const hintDesktopText =
    mount.dataset["hintDesktop"] ?? hintPrimary?.textContent ?? "";
  const hintMobileText =
    mount.dataset["hintMobile"] ??
    "Tap a worker to crash it · tap a node to take it down";
  let defaultHintText = hintDesktopText;

  let palette: ThemePalette = getPalette();
  let isBandMode = window.innerWidth <= 900;
  let exclusionRects: BoxRect[] = [];
  let exclusionSig = "";

  const nodes: MeshNodeCard[] = [];
  let edges: MeshEdge[] = [];
  let hoveredHit: HitTarget = null;
  let demoCursor = 0;

  let simNow = performance.now();
  let frameDt = 16.67;
  let spawnAccumMs = 0;
  let hudAccumMs = 0;
  let lastUserInteractMs = performance.now();
  let nextChaosAtMs = performance.now() + 6800;
  let lastLiveAnnounceMs = 0;
  let heroVisibleSinceMs = 0;
  let introCrashDone = false;
  let introNodedownDone = false;

  // Observer HUD counters
  let restartCount = 0;
  let netsplitCount = 0;
  let rerouteCount = 0;
  let msgRate = 142;
  let deliveredInWindow = 0;

  // Timers for reduced-motion / cleanup
  const timers: ReturnType<typeof setTimeout>[] = [];
  function scheduleTimeout(fn: () => void, ms: number): void {
    const id = setTimeout(fn, ms);
    timers.push(id);
  }

  const packetPool = new ObjectPool<MeshPacket>(
    getParticleCap(),
    () => ({
      fromIdx: 0,
      toIdx: 1,
      viaIdx: null,
      leg: 0,
      progress: 0,
      speed: 0.00085,
      protocol: "SIP",
      label: "INVITE",
      showLabel: false,
      rerouted: false,
      dropping: false,
      dropAlpha: 1,
    }),
    (p) => {
      p.viaIdx = null;
      p.leg = 0;
      p.progress = 0;
      p.speed = 0.00072 + Math.random() * 0.00038;
      p.showLabel = false;
      p.rerouted = false;
      p.dropping = false;
      p.dropAlpha = 1;
    },
    true,
  );

  function protocolColor(proto: ProtocolId): string {
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

  function announcePolite(text: string, force = false): void {
    if (!liveOut) return;
    const now = performance.now();
    if (force || now - lastLiveAnnounceMs >= 5000) {
      lastLiveAnnounceMs = now;
      liveOut.textContent = text;
    }
  }

  function updateHudText(): void {
    if (!hudEl) return;
    const upCount = nodes.reduce(
      (acc, n) => acc + (n.lifecycle === "down" ? 0 : 1),
      0,
    );
    const total = nodes.length;
    if (isBandMode) {
      hudEl.textContent = `${hudLabels.observer} · ${upCount}/${total} · ${msgRate} msg/s · ↻${restartCount} · ⚡${netsplitCount}`;
    } else {
      hudEl.textContent = `${hudLabels.observer} · ${hudLabels.nodes} ${upCount}/${total} · ${hudLabels.msgs} ${msgRate} · ${hudLabels.restarts} ${restartCount} · ${hudLabels.netsplits} ${netsplitCount} · ${hudLabels.sim}`;
    }
  }

  // Hoisted packet sweep callback (M7: zero per-frame closure allocations)
  const advancePacket = (pkt: MeshPacket): boolean => {
    if (pkt.dropping) {
      pkt.dropAlpha -= frameDt * 0.0028;
      pkt.progress = Math.min(1, pkt.progress + pkt.speed * frameDt * 0.35);
      return pkt.dropAlpha > 0.04;
    }

    const curTargetIdx =
      pkt.viaIdx !== null && pkt.leg === 0 ? pkt.viaIdx : pkt.toIdx;
    const targetNode = nodes[curTargetIdx];
    if (!targetNode || targetNode.lifecycle === "down") {
      pkt.dropping = true;
      pkt.dropAlpha = 0.85;
      return true;
    }

    const stepBoost = pkt.viaIdx !== null ? 1.45 : 1;
    pkt.progress += pkt.speed * frameDt * stepBoost;

    if (pkt.progress >= 1) {
      if (pkt.viaIdx !== null && pkt.leg === 0) {
        // Relay hop reached: pulse a worker on the relay node and start leg 1
        const relayNode = nodes[pkt.viaIdx];
        if (relayNode && relayNode.workers.length > 0) {
          const rw =
            relayNode.workers[
              Math.floor(Math.random() * relayNode.workers.length)
            ];
          if (rw && rw.state === "running") rw.pulseUntilMs = simNow + 260;
        }
        pkt.leg = 1;
        pkt.progress = 0;
        return true;
      }

      // Final destination reached: pulse a running worker on target node
      deliveredInWindow++;
      const runningWorkers = targetNode.workers.filter(
        (w) => w.state === "running",
      );
      if (runningWorkers.length > 0) {
        const w =
          runningWorkers[Math.floor(Math.random() * runningWorkers.length)]!;
        w.pulseUntilMs = simNow + 320;
      }
      return false;
    }
    return true;
  };

  function computeRawExclusions(): BoxRect[] {
    if (window.innerWidth <= 900) return [];
    const mRect = mount.getBoundingClientRect();
    const out: BoxRect[] = [];
    for (const el of [copyEl, termEl]) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      out.push({
        left: r.left - mRect.left,
        top: r.top - mRect.top,
        right: r.right - mRect.left,
        bottom: r.bottom - mRect.top,
      });
    }
    return out;
  }

  function isCardRectFree(
    rect: BoxRect,
    width: number,
    height: number,
    placed: readonly MeshNodeCard[],
    padExcl = 8,
  ): boolean {
    if (
      rect.left < 6 ||
      rect.right > width - 6 ||
      rect.top < 6 ||
      rect.bottom > height - 26
    ) {
      return false;
    }
    for (let i = 0; i < exclusionRects.length; i++) {
      if (rectsOverlap(rect, exclusionRects[i]!, padExcl)) return false;
    }
    for (let i = 0; i < placed.length; i++) {
      if (rectsOverlap(rect, placed[i]!.rect, 10)) return false;
    }
    return true;
  }

  function resolveCardPosition(
    prefCx: number,
    prefCy: number,
    cardW: number,
    cardH: number,
    width: number,
    height: number,
    placed: readonly MeshNodeCard[],
  ): { cx: number; cy: number; rect: BoxRect } {
    const halfW = cardW * 0.5;
    const halfH = cardH * 0.5;
    const clampX = (x: number) =>
      Math.max(halfW + 8, Math.min(width - halfW - 8, x));
    const clampY = (y: number) =>
      Math.max(halfH + 8, Math.min(height - halfH - 28, y));

    const makeRect = (cx: number, cy: number): BoxRect => ({
      left: cx - halfW,
      top: cy - halfH,
      right: cx + halfW,
      bottom: cy + halfH,
    });

    const baseCx = clampX(prefCx);
    const baseCy = clampY(prefCy);
    const baseRect = makeRect(baseCx, baseCy);
    if (isCardRectFree(baseRect, width, height, placed, 8)) {
      return { cx: baseCx, cy: baseCy, rect: baseRect };
    }

    // Deterministic spiral search for nearest free perimeter slot
    const dySteps = [0, -18, 18, -36, 36, -56, 56, -78, 78];
    const dxSteps = [0, -32, 32, -68, 68, -110, 110, -160, 160];
    for (const dy of dySteps) {
      for (const dx of dxSteps) {
        const cx = clampX(baseCx + dx);
        const cy = clampY(baseCy + dy);
        const r = makeRect(cx, cy);
        if (isCardRectFree(r, width, height, placed, 6)) {
          return { cx, cy, rect: r };
        }
      }
    }

    // Fallback scan along top and bottom bands outside exclusion rects
    const CopyOrTermTop =
      exclusionRects.length > 0
        ? Math.min(...exclusionRects.map((e) => e.top))
        : 90;
    const CopyOrTermBottom =
      exclusionRects.length > 0
        ? Math.max(...exclusionRects.map((e) => e.bottom))
        : height - 90;

    const bandYs = [
      clampY(CopyOrTermTop * 0.5),
      clampY(CopyOrTermBottom + (height - CopyOrTermBottom) * 0.48),
    ];
    for (const by of bandYs) {
      for (let bx = halfW + 16; bx <= width - halfW - 16; bx += 42) {
        const r = makeRect(bx, by);
        if (isCardRectFree(r, width, height, placed, 4)) {
          return { cx: bx, cy: by, rect: r };
        }
      }
    }

    return { cx: baseCx, cy: baseCy, rect: baseRect };
  }

  function buildTopology(width: number, height: number): void {
    isBandMode = window.innerWidth <= 900;
    defaultHintText = isBandMode ? hintMobileText : hintDesktopText;
    if (hintPrimary && mount.dataset["escalatedState"] !== "true") {
      hintPrimary.textContent = defaultHintText;
    }
    exclusionRects = computeRawExclusions();
    exclusionSig = exclusionRects
      .map(
        (r) =>
          `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`,
      )
      .join("|");

    nodes.length = 0;
    packetPool.releaseAll();

    const specs = getActiveNodeSpecs(isBandMode);

    if (isBandMode) {
      // Mobile/tablet ≤900px: 4 compact nodes arranged in a clean 2×2 mesh inside the 204px canvas band
      const isTabletBand = width >= 540;
      const cardW = isTabletBand
        ? 136
        : Math.min(118, Math.max(98, Math.floor(width * 0.32)));
      const cardH = isTabletBand ? 54 : 48;
      const topY = cardH * 0.5 + 16;
      const botY = Math.max(topY + cardH + 28, height - cardH * 0.5 - 16);
      const leftX = Math.max(
        cardW * 0.5 + 10,
        width * (isTabletBand ? 0.27 : 0.24),
      );
      const rightX = Math.min(
        width - cardW * 0.5 - 10,
        width * (isTabletBand ? 0.73 : 0.76),
      );

      const mobileCoords = [
        { cx: leftX, cy: topY },
        { cx: rightX, cy: topY },
        { cx: rightX, cy: botY },
        { cx: leftX, cy: botY },
      ];

      specs.forEach((spec, idx) => {
        const pt = mobileCoords[idx] ?? { cx: width * 0.5, cy: height * 0.5 };
        createNodeCard(idx, spec, pt.cx, pt.cy, cardW, cardH);
      });
    } else {
      // Desktop >900px: 6 BEAM VM cards framing the entire hero around `.hero__copy` and `.terminal`
      const cardW = 122;
      const cardH = 62;
      const cRect = exclusionRects[0] ?? {
        left: 36,
        top: 96,
        right: width * 0.52,
        bottom: height - 96,
      };
      const tRect = exclusionRects[1] ?? {
        left: width * 0.56,
        top: 130,
        right: width - 48,
        bottom: height - 130,
      };

      const topBandY = Math.max(
        cardH * 0.5 + 10,
        Math.min(cRect.top, tRect.top) * 0.48,
      );
      const termTopBandY = Math.max(cardH * 0.5 + 10, tRect.top * 0.48);
      const termBotBandY = Math.min(
        height - cardH * 0.5 - 30,
        tRect.bottom + (height - tRect.bottom) * 0.46,
      );
      const copyBotBandY = Math.min(
        height - cardH * 0.5 - 30,
        cRect.bottom + (height - cRect.bottom) * 0.48,
      );

      // Check if wide viewport (e.g. 1920px) has right-margin space outside `.terminal`
      const rightMarginAvail = width - tRect.right;
      const hasRightMarginSlot = rightMarginAvail >= cardW + 24;

      const preferredSlots: { cx: number; cy: number }[] = [
        // 0: sbg1@sig-01 — top-left above hero copy
        { cx: cRect.left + cardW * 0.55 + 12, cy: topBandY },
        // 1: nso1@netauto — top-center / above glass terminal left
        {
          cx: hasRightMarginSlot
            ? (cRect.right + tRect.left) * 0.52
            : tRect.left + (tRect.right - tRect.left) * 0.26,
          cy: termTopBandY,
        },
        // 2: edge1@lora-gw — top-right above terminal (or right margin on wide 1920px screens)
        hasRightMarginSlot
          ? {
              cx: tRect.right + Math.min(115, rightMarginAvail * 0.52),
              cy: (tRect.top + tRect.bottom) * 0.36,
            }
          : {
              cx: tRect.right - cardW * 0.55 - 8,
              cy: termTopBandY,
            },
        // 3: mnesia1@store — bottom-right below glass terminal
        hasRightMarginSlot
          ? {
              cx: tRect.right - cardW * 0.4,
              cy: termBotBandY,
            }
          : {
              cx: tRect.right - cardW * 0.55 - 8,
              cy: termBotBandY,
            },
        // 4: iot1@telemetry — bottom-center below glass terminal left
        {
          cx: tRect.left + (tRect.right - tRect.left) * 0.24,
          cy: termBotBandY,
        },
        // 5: ivr1@msg-gw — bottom-left below hero copy CTAs
        {
          cx: cRect.left + (cRect.right - cRect.left) * 0.34,
          cy: copyBotBandY,
        },
      ];

      specs.forEach((spec, idx) => {
        const pref = preferredSlots[idx] ?? { cx: width * 0.5, cy: topBandY };
        const resolved = resolveCardPosition(
          pref.cx,
          pref.cy,
          cardW,
          cardH,
          width,
          height,
          nodes,
        );
        createNodeCard(idx, spec, resolved.cx, resolved.cy, cardW, cardH);
      });
    }

    // Build full-mesh undirected edges: n*(n-1)/2
    edges = buildFullMeshEdges(nodes.length);

    // Seed initial protocol packets across the mesh so static/initial frame is rich
    const seedCount = isBandMode ? 6 : 12;
    for (let i = 0; i < seedCount; i++) {
      const e = edges[i % edges.length];
      if (!e) continue;
      const fromIdx = i % 2 === 0 ? e.a : e.b;
      const toIdx = i % 2 === 0 ? e.b : e.a;
      spawnPacketBetween(fromIdx, toIdx, ((i * 0.23) % 0.72) + 0.14);
    }

    // Card centres (mount coordinates) for the shell intro's node hand-off.
    mount.dataset["nodeAnchors"] = JSON.stringify(
      nodes.map((n) => ({ id: n.spec.id, x: Math.round(n.cx), y: Math.round(n.cy) })),
    );

    updateHudText();
  }

  function createNodeCard(
    idx: number,
    spec: BeamNodeSpec,
    cx: number,
    cy: number,
    w: number,
    h: number,
  ): void {
    const sup = new Supervisor({
      id: spec.supId,
      strategy: spec.strategy,
      children: spec.workers,
      restartDelayMs: 900,
      maxRestarts: 3,
      periodMs: 4500,
    });

    // Mini supervision tree coordinates inside the card (relative to card center)
    const supRelX = -w * 0.31;
    const supRelY = h * 0.21;
    const workerCount = spec.workers.length;
    const startX = -w * 0.06;
    const endX = w * 0.36;
    const spanX = workerCount > 1 ? (endX - startX) / (workerCount - 1) : 0;

    const workers: WorkerSlot[] = spec.workers.map((wId, wIdx) => {
      const child = sup.getChild(wId);
      return {
        id: wId,
        relX: startX + wIdx * spanX,
        relY: h * 0.21 + (wIdx % 2 === 0 ? -2.5 : 2.5),
        state: "running",
        pulseUntilMs: 0,
        statusUntilMs: 0,
        flash: null,
        pid: child?.pid ?? 200 + idx * 10 + wIdx,
      };
    });

    nodes.push({
      idx,
      spec,
      cx,
      cy,
      w,
      h,
      rect: {
        left: cx - w * 0.5,
        top: cy - h * 0.5,
        right: cx + w * 0.5,
        bottom: cy + h * 0.5,
      },
      supRelX,
      supRelY,
      workers,
      sup,
      lifecycle: "up",
      downUntilMs: 0,
      healUntilMs: 0,
      statusText: "",
      statusUntilMs: 0,
    });
  }

  function countPacketLabelsVisible(): number {
    let n = 0;
    for (const p of packetPool.items) {
      if (p.showLabel && !p.dropping) n++;
    }
    return n;
  }

  function trimPacketLabelsToMax(max: number): void {
    let shown = 0;
    for (const p of packetPool.items) {
      if (!p.showLabel || p.dropping) continue;
      if (shown >= max) p.showLabel = false;
      else shown++;
    }
  }

  function getActiveDownNodeIdx(): number {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i]!.lifecycle === "down") return i;
    }
    return -1;
  }

  function spawnPacketBetween(
    rawFromIdx: number,
    rawToIdx: number,
    initialProgress = 0,
  ): boolean {
    const states = nodes.map((n) => n.lifecycle);
    const activeDownIdx = getActiveDownNodeIdx();
    const route = planRoute(rawFromIdx, rawToIdx, states, activeDownIdx);
    if (!route) return false;

    const pkt = packetPool.acquire();
    if (!pkt) return false;

    const senderSpec = nodes[route.fromIdx]!.spec;
    const labelPool =
      senderSpec.packetLabels ?? PROTOCOL_SPECS[senderSpec.protocol].labels;
    const label =
      labelPool[
        (route.fromIdx + route.toIdx + packetPool.activeCount) %
          labelPool.length
      ]!;

    pkt.fromIdx = route.fromIdx;
    pkt.toIdx = route.toIdx;
    pkt.viaIdx = route.viaIdx;
    pkt.leg = 0;
    pkt.progress = initialProgress;
    pkt.protocol = senderSpec.protocol;
    pkt.label = label;
    pkt.rerouted = route.rerouted;
    const wantLabel = route.rerouted || packetPool.activeCount % 3 === 0;
    pkt.showLabel = wantLabel && countPacketLabelsVisible() < 2;

    if (route.rerouted && route.viaIdx !== null) {
      rerouteCount++;
      mount.dataset["lastReroute"] =
        `${nodes[route.fromIdx]!.spec.id}->${nodes[route.viaIdx]!.spec.id}->${nodes[route.toIdx]!.spec.id}`;
      const e1 = findMeshEdgeIndex(edges, route.fromIdx, route.viaIdx);
      const e2 = findMeshEdgeIndex(edges, route.viaIdx, route.toIdx);
      if (e1 !== -1) edges[e1]!.rerouteUntilMs = simNow + 650;
      if (e2 !== -1) edges[e2]!.rerouteUntilMs = simNow + 650;
    }
    return true;
  }

  function crashWorker(nodeIdx: number, workerIdx: number): void {
    const node = nodes[nodeIdx];
    if (!node || node.lifecycle === "down") return;
    const worker = node.workers[workerIdx];
    if (!worker) return;

    const now = performance.now();
    simNow = now;
    const report = node.sup.crash(worker.id, now);
    if (report.restartSet.length === 0) return;

    mount.dataset["lastCrash"] = `${node.spec.id}:${worker.id}`;

    // M5: Supervisor max restart intensity escalation
    if (report.escalated) {
      mount.dataset["escalatedState"] = "true";
      if (hintPrimary) hintPrimary.textContent = escalatedMsg;
      node.lifecycle = "restarting";
      node.statusText = "SUP_ESCALATED";
      node.statusUntilMs = now + 1200;
      for (const w of node.workers) {
        w.state = "crashed";
        w.flash = "red";
        w.statusUntilMs = now + 1200;
      }
      appendTerminalLog(
        `=SUPERVISOR REPORT==== ${node.spec.supId} max_restart_intensity (${node.spec.id})`,
        "err",
      );
      announcePolite(`${node.spec.supId}: ${escalatedMsg}`, true);
      renderFrame(now);

      scheduleTimeout(() => {
        const t = performance.now();
        node.sup.reset(t);
        node.lifecycle = "up";
        node.statusText = "restarted";
        node.statusUntilMs = t + 900;
        mount.dataset["escalatedState"] = "false";
        if (hintPrimary) hintPrimary.textContent = defaultHintText;
        for (const w of node.workers) {
          const child = node.sup.getChild(w.id);
          w.state = "running";
          w.pid = child?.pid ?? w.pid + 1;
          w.flash = "green";
          w.statusUntilMs = t + 900;
        }
        restartCount += node.workers.length;
        updateHudText();
        renderFrame(t);
      }, 1200);
      return;
    }

    // Standard worker crash: hold red ~900ms with EXIT
    for (const w of node.workers) {
      if (report.restartSet.includes(w.id)) {
        w.state = "crashed";
        w.flash = "red";
        w.statusUntilMs = now + 900;
      }
    }
    node.lifecycle = "restarting";
    node.statusText = `EXIT ${worker.id}`;
    node.statusUntilMs = now + 900;

    appendTerminalLog(
      `=ERROR REPORT==== <0.${worker.pid}.0> exit: killed (${node.spec.id})`,
      "err",
    );
    announcePolite(
      `${worker.id} exited on ${node.spec.id}; ${node.spec.supId} restarting`,
      true,
    );
    renderFrame(now);

    if (!isMotionOn()) {
      scheduleTimeout(() => {
        const later = performance.now();
        stepSupervisors(later);
        renderFrame(later);
        scheduleTimeout(() => {
          const finalNow = performance.now();
          clearExpiredStatuses(finalNow);
          renderFrame(finalNow);
        }, 950);
      }, 920);
    }
  }

  function triggerNodeDown(nodeIdx: number): void {
    const node = nodes[nodeIdx];
    if (!node || node.lifecycle === "down") return;

    const now = performance.now();
    simNow = now;
    node.lifecycle = "down";
    node.downUntilMs = now + 2000;
    node.statusText = "nodedown";
    node.statusUntilMs = now + 2000;
    netsplitCount++;
    mount.dataset["lastNodedown"] = node.spec.id;

    // Mark all in-flight packets heading toward `nodeIdx` as dropping
    for (const pkt of packetPool.items) {
      const target =
        pkt.viaIdx !== null && pkt.leg === 0 ? pkt.viaIdx : pkt.toIdx;
      if (target === nodeIdx || pkt.fromIdx === nodeIdx) {
        pkt.dropping = true;
        pkt.dropAlpha = 0.9;
      }
    }

    // Immediately dispatch rerouted failover packets through a healthy relay node
    const states = nodes.map((n) => n.lifecycle);
    const otherHealthy: number[] = [];
    for (let i = 0; i < nodes.length; i++) {
      if (i !== nodeIdx && nodes[i]!.lifecycle !== "down") {
        otherHealthy.push(i);
      }
    }
    const relayIdx = selectRelayNode(
      otherHealthy[0] ?? 0,
      otherHealthy[1] ?? 1,
      nodeIdx,
      states,
    );
    const relayName =
      relayIdx !== null ? nodes[relayIdx]!.spec.id : "mnesia1@store";

    if (otherHealthy.length >= 2) {
      spawnPacketBetween(otherHealthy[0]!, nodeIdx, 0.05);
      spawnPacketBetween(
        otherHealthy[1]!,
        otherHealthy[otherHealthy.length - 1]!,
        0.12,
      );
    }

    appendTerminalLog(
      `nodedown '${node.spec.id}' — rerouting via '${relayName}'`,
      "warn",
    );
    announcePolite(
      `nodedown ${node.spec.id}; traffic rerouted via ${relayName}`,
      true,
    );
    updateHudText();
    renderFrame(now);

    // Ensure nodeup heals even if motion is off or tab is throttled
    scheduleTimeout(() => {
      if (node.lifecycle === "down") {
        healNodeUp(nodeIdx, performance.now());
      }
    }, 2050);
  }

  function healNodeUp(nodeIdx: number, nowMs: number): void {
    const node = nodes[nodeIdx];
    if (!node || node.lifecycle !== "down") return;

    node.lifecycle = "up";
    node.downUntilMs = 0;
    node.healUntilMs = nowMs + 950;
    node.statusText = "nodeup";
    node.statusUntilMs = nowMs + 950;
    mount.dataset["lastNodeup"] = node.spec.id;

    // Pulse all links incident to healed node green
    for (const e of edges) {
      if (e.a === nodeIdx || e.b === nodeIdx) {
        e.pulseUntilMs = nowMs + 950;
      }
    }

    appendTerminalLog(`nodeup '${node.spec.id}' — mesh healed`, "ok");
    announcePolite(`nodeup ${node.spec.id}; full mesh restored`, true);
    updateHudText();
    renderFrame(nowMs);
  }

  function stepSupervisors(nowMs: number): void {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      if (node.lifecycle === "down") {
        if (nowMs >= node.downUntilMs) {
          healNodeUp(i, nowMs);
        }
        continue;
      }

      const restarted = node.sup.tick(nowMs);
      if (restarted.length > 0) {
        restartCount += restarted.length;
        node.lifecycle = "up";
        node.statusText = "restarted";
        node.statusUntilMs = nowMs + 900;
        mount.dataset["lastRestart"] = restarted.join(",");

        for (const w of node.workers) {
          if (restarted.includes(w.id)) {
            const child = node.sup.getChild(w.id);
            w.state = "running";
            w.pid = child?.pid ?? w.pid + 1;
            w.flash = "green";
            w.statusUntilMs = nowMs + 900;
          }
        }

        appendTerminalLog(
          `=PROGRESS REPORT== supervisor ${node.spec.supId} restarted ${restarted.join(", ")}`,
          "ok",
        );
        announcePolite(
          `${node.spec.supId} restarted ${restarted.join(", ")} on ${node.spec.id}`,
        );
        updateHudText();
      }
    }
  }

  function clearExpiredStatuses(nowMs: number): void {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      if (
        n.lifecycle !== "down" &&
        n.statusUntilMs > 0 &&
        nowMs >= n.statusUntilMs
      ) {
        n.statusText = "";
        n.statusUntilMs = 0;
        if (n.lifecycle === "restarting") n.lifecycle = "up";
      }
      for (let wIdx = 0; wIdx < n.workers.length; wIdx++) {
        const w = n.workers[wIdx]!;
        if (w.statusUntilMs > 0 && nowMs >= w.statusUntilMs && w.state === "running") {
          w.flash = null;
          w.statusUntilMs = 0;
        }
      }
    }
  }

  function tickSimulation(dtMs: number, nowMs: number): void {
    simNow = nowMs;
    frameDt = dtMs;

    stepSupervisors(nowMs);
    clearExpiredStatuses(nowMs);

    // Passive intro story: crash ~2.5s, nodedown→nodeup by ~7.5s after hero visible
    if (
      isMotionOn() &&
      heroVisibleSinceMs > 0 &&
      visible &&
      !introCrashDone &&
      nowMs - heroVisibleSinceMs >= 2500
    ) {
      introCrashDone = true;
      const n0 = nodes[0];
      if (n0 && n0.lifecycle === "up" && n0.workers.length > 0) {
        crashWorker(0, 0);
      }
    }
    if (
      isMotionOn() &&
      heroVisibleSinceMs > 0 &&
      visible &&
      introCrashDone &&
      !introNodedownDone &&
      nowMs - heroVisibleSinceMs >= 5200 &&
      getActiveDownNodeIdx() === -1
    ) {
      introNodedownDone = true;
      const nsoIdx = nodes.findIndex((n) => n.spec.id === "nso1@netauto");
      triggerNodeDown(nsoIdx >= 0 ? nsoIdx : 1);
      nextChaosAtMs = nowMs + 6800;
    }

    // Chaos monkey: when user idle >= 6s, trigger a worker crash or nodedown every 6–9s
    if (
      introNodedownDone &&
      nowMs - lastUserInteractMs >= 6000 &&
      nowMs >= nextChaosAtMs
    ) {
      nextChaosAtMs = nowMs + 6200 + Math.random() * 2600;
      const upNodes = nodes.filter((n) => n.lifecycle === "up");
      if (upNodes.length > 0) {
        const pick = upNodes[Math.floor(Math.random() * upNodes.length)]!;
        if (Math.random() < 0.38 && getActiveDownNodeIdx() === -1) {
          triggerNodeDown(pick.idx);
        } else {
          const wIdx = Math.floor(Math.random() * pick.workers.length);
          crashWorker(pick.idx, wIdx);
        }
      }
    }

    // Spawn protocol packets across the mesh
    spawnAccumMs += dtMs;
    const spawnInterval = isBandMode ? 190 : 105;
    while (spawnAccumMs >= spawnInterval) {
      spawnAccumMs -= spawnInterval;
      if (nodes.length >= 2) {
        const fromIdx = Math.floor(Math.random() * nodes.length);
        let toIdx = Math.floor(Math.random() * (nodes.length - 1));
        if (toIdx >= fromIdx) toIdx++;
        spawnPacketBetween(fromIdx, toIdx, 0);
      }
    }

    packetPool.sweep(advancePacket);
    trimPacketLabelsToMax(2);

    // Update HUD msgs/s counter every 900ms
    hudAccumMs += dtMs;
    if (hudAccumMs >= 900) {
      const instantRate = Math.round((deliveredInWindow * 1000) / hudAccumMs);
      msgRate = Math.max(96, Math.min(240, 128 + instantRate * 12));
      deliveredInWindow = 0;
      hudAccumMs = 0;
      updateHudText();
    }

    renderFrame(nowMs);
  }

  const managed = setupCanvas(
    mount,
    ariaLabel,
    (w, h) => {
      const nextBand = window.innerWidth <= 900;
      const nextRects = computeRawExclusions();
      const nextSig = nextRects
        .map(
          (r) =>
            `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`,
        )
        .join("|");
      if (nextBand !== isBandMode || nextSig !== exclusionSig || nodes.length === 0) {
        buildTopology(w, h);
      }
      renderFrame(simNow);
    },
    true,
  );
  if (!managed) return;

  buildTopology(managed.width, managed.height);

  function renderFrame(nowMs: number): void {
    const { ctx, width, height } = managed!;
    ctx.clearRect(0, 0, width, height);

    const copyRect = !isBandMode && exclusionRects[0] ? exclusionRects[0] : null;

    // 1. Draw full-mesh links (soft alpha behind copy <= 0.16, clearer in open space & behind glass terminal)
    drawMeshLinks(ctx, nowMs, false);

    // If desktop, attenuate any link segment directly behind `.hero__copy` so copy readability is 100% preserved
    if (copyRect) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        copyRect.left - 8,
        copyRect.top - 8,
        copyRect.right - copyRect.left + 16,
        copyRect.bottom - copyRect.top + 16,
      );
      ctx.clip();
      ctx.clearRect(
        copyRect.left - 8,
        copyRect.top - 8,
        copyRect.right - copyRect.left + 16,
        copyRect.bottom - copyRect.top + 16,
      );
      drawMeshLinks(ctx, nowMs, true);
      ctx.restore();
    }

    // 2. Draw protocol packets along links (with soft glow & occasional protocol tags)
    drawPackets(ctx, copyRect);

    // 3. Draw BEAM VM node cards (strictly outside `.hero__copy` and `.terminal`)
    drawNodeCards(ctx, nowMs);

    ctx.globalAlpha = 1;
  }

  function drawMeshLinks(
    ctx: CanvasRenderingContext2D,
    nowMs: number,
    behindCopy: boolean,
  ): void {
    const baseAlpha = behindCopy
      ? 0.12
      : palette.isLight
        ? 0.28
        : 0.44;

    for (let i = 0; i < edges.length; i++) {
      const e = edges[i]!;
      const na = nodes[e.a];
      const nb = nodes[e.b];
      if (!na || !nb) continue;

      const isDownEdge =
        na.lifecycle === "down" || nb.lifecycle === "down";
      const isHealing = e.pulseUntilMs > nowMs;
      const isReroute = !isDownEdge && e.rerouteUntilMs > nowMs;

      if (isDownEdge) {
        ctx.strokeStyle = palette.accentText;
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = behindCopy ? 0.12 : 0.78;
        ctx.setLineDash(DASH_DOWN);
      } else if (isHealing) {
        ctx.strokeStyle = palette.ok;
        ctx.lineWidth = 1.75;
        ctx.globalAlpha = behindCopy ? 0.12 : 0.88;
        ctx.setLineDash(NO_DASH);
      } else if (isReroute) {
        ctx.strokeStyle = palette.warn;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = behindCopy ? 0.12 : 0.82;
        ctx.setLineDash(DASH_REROUTE);
      } else {
        ctx.strokeStyle = palette.borderStrong;
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
    ctx: CanvasRenderingContext2D,
    copyRect: BoxRect | null,
  ): void {
    const active = packetPool.items;
    ctx.font = palette.mono9;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    for (let i = 0; i < active.length; i++) {
      const pkt = active[i]!;
      const startIdx =
        pkt.viaIdx !== null && pkt.leg === 1 ? pkt.viaIdx : pkt.fromIdx;
      const endIdx =
        pkt.viaIdx !== null && pkt.leg === 0 ? pkt.viaIdx : pkt.toIdx;
      const a = nodes[startIdx];
      const b = nodes[endIdx];
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
        ? palette.accentText
        : pkt.rerouted
          ? palette.warn
          : protocolColor(pkt.protocol);

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

      // Soft outer halo + crisp core dot
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha * 0.28;
      ctx.beginPath();
      ctx.arc(x, y, pkt.rerouted ? 6 : 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, pkt.rerouted ? 3 : 2.5, 0, Math.PI * 2);
      ctx.fill();

      if (pkt.showLabel && !inCopy && !isBandMode) {
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

  function drawNodeCards(ctx: CanvasRenderingContext2D, nowMs: number): void {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      const { left, top } = n.rect;
      const isHoveredNode =
        hoveredHit?.nodeIdx === i && hoveredHit.kind === "node";

      // Card surface & border
      ctx.globalAlpha = n.lifecycle === "down" ? 0.88 : 0.97;
      ctx.fillStyle = palette.surface;
      let borderCol = palette.borderStrong;
      if (n.lifecycle === "down") {
        borderCol = palette.accentText;
      } else if (n.healUntilMs > nowMs) {
        borderCol = palette.ok;
      } else if (n.lifecycle === "restarting") {
        borderCol = palette.warn;
      } else if (isHoveredNode) {
        borderCol = palette.msg;
      }

      ctx.strokeStyle = borderCol;
      ctx.lineWidth =
        n.lifecycle === "down" || n.healUntilMs > nowMs || isHoveredNode
          ? 1.75
          : palette.isLight
            ? 1.45
            : 1.15;
      if (
        palette.isLight &&
        n.lifecycle === "up" &&
        n.healUntilMs <= nowMs &&
        !isHoveredNode
      ) {
        ctx.strokeStyle = palette.textMuted;
      }
      if (n.lifecycle === "down") ctx.setLineDash(DASH_DOWN);

      ctx.beginPath();
      ctx.roundRect(left, top, n.w, n.h, 7);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash(NO_DASH);

      // Subtle header divider line inside the VM card
      const headerH = isBandMode ? 19 : 22;
      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(left + 6, top + headerH);
      ctx.lineTo(left + n.w - 6, top + headerH);
      ctx.stroke();

      // Status LED (green up / red down / amber restarting)
      const ledX = left + 10;
      const ledY = top + headerH * 0.52;
      const ledColor =
        n.lifecycle === "down"
          ? palette.accentText
          : n.lifecycle === "restarting"
            ? palette.warn
            : palette.ok;

      ctx.fillStyle = ledColor;
      ctx.globalAlpha = 0.26;
      ctx.beginPath();
      ctx.arc(ledX, ledY, 5.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(ledX, ledY, 2.7, 0, Math.PI * 2);
      ctx.fill();

      // Node name (`sbg1@sig-01`, etc.)
      ctx.font = isBandMode ? palette.mono10Bold : palette.mono11Bold;
      ctx.fillStyle =
        n.lifecycle === "down" ? palette.accentText : palette.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(n.spec.shortName, left + 18, ledY);

      // Role subtitle or transient status badge (`nodedown`, `EXIT`, `nodeup`)
      if (!isBandMode) {
        ctx.font = palette.mono9;
        ctx.fillStyle = n.statusText
          ? n.lifecycle === "down"
            ? palette.accentText
            : n.healUntilMs > nowMs
              ? palette.ok
              : palette.warn
          : palette.textMuted;
        ctx.fillText(
          n.statusText || n.spec.role,
          left + 8,
          top + headerH + 9,
        );
      }

      // Mini supervision tree inside the card: 1 supervisor square + 3–4 worker dots
      const supX = n.cx + n.supRelX;
      const supY = n.cy + n.supRelY + (isBandMode ? 2 : 5);

      for (let wIdx = 0; wIdx < n.workers.length; wIdx++) {
        const w = n.workers[wIdx]!;
        const wx = n.cx + w.relX;
        const wy = n.cy + w.relY + (isBandMode ? 2 : 5);

        // Tiny internal link from supervisor square to worker dot
        ctx.strokeStyle =
          w.state === "crashed"
            ? palette.accentText
            : w.flash === "green"
              ? palette.ok
              : palette.borderStrong;
        ctx.lineWidth = 0.95;
        ctx.globalAlpha = n.lifecycle === "down" ? 0.35 : 0.78;
        ctx.beginPath();
        ctx.moveTo(supX + 4, supY);
        ctx.lineTo(wx, wy);
        ctx.stroke();

        // Worker dot + message handling / restart ring
        const isHoveredWorker =
          hoveredHit?.kind === "worker" &&
          hoveredHit.nodeIdx === i &&
          hoveredHit.workerIdx === wIdx;
        const isPulsing = w.pulseUntilMs > nowMs;

        let wColor = protocolColor(n.spec.protocol);
        if (n.lifecycle === "down" || w.state === "crashed" || w.flash === "red") {
          wColor = palette.accentText;
        } else if (w.flash === "green") {
          wColor = palette.ok;
        }

        if (isPulsing || w.flash !== null || isHoveredWorker) {
          ctx.strokeStyle =
            w.state === "crashed"
              ? palette.accentText
              : w.flash === "green"
                ? palette.ok
                : wColor;
          ctx.lineWidth = 1.4;
          ctx.globalAlpha = 0.85;
          ctx.beginPath();
          ctx.arc(wx, wy, 6.2, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.globalAlpha = n.lifecycle === "down" ? 0.45 : 0.96;
        ctx.fillStyle =
          w.state === "crashed" ? palette.accent : wColor;
        ctx.beginPath();
        ctx.arc(wx, wy, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Mini supervisor square inside card
      ctx.globalAlpha = n.lifecycle === "down" ? 0.5 : 0.98;
      ctx.fillStyle = palette.surface2;
      ctx.strokeStyle =
        n.lifecycle === "down" ? palette.accentText : palette.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(supX - 4.2, supY - 4.2, 8.4, 8.4);
      ctx.fill();
      ctx.stroke();
    }
  }

  function hitTest(clientX: number, clientY: number): HitTarget {
    const rect = managed!.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      if (
        x < n.rect.left - 4 ||
        x > n.rect.right + 4 ||
        y < n.rect.top - 4 ||
        y > n.rect.bottom + 4
      ) {
        continue;
      }

      // Check worker dots first (generous 9px radius hit target)
      const yOffset = isBandMode ? 2 : 5;
      for (let wIdx = 0; wIdx < n.workers.length; wIdx++) {
        const w = n.workers[wIdx]!;
        const wx = n.cx + w.relX;
        const wy = n.cy + w.relY + yOffset;
        const dx = x - wx;
        const dy = y - wy;
        if (dx * dx + dy * dy <= 9.5 * 9.5) {
          return { kind: "worker", nodeIdx: i, workerIdx: wIdx };
        }
      }

      return { kind: "node", nodeIdx: i };
    }
    return null;
  }

  managed.canvas.addEventListener("pointermove", (e) => {
    lastUserInteractMs = performance.now();
    const hit = hitTest(e.clientX, e.clientY);
    const changed =
      hit?.kind !== hoveredHit?.kind ||
      hit?.nodeIdx !== hoveredHit?.nodeIdx ||
      (hit?.kind === "worker" &&
        hoveredHit?.kind === "worker" &&
        hit.workerIdx !== hoveredHit.workerIdx);
    if (changed) {
      hoveredHit = hit;
      managed.canvas.style.cursor = hit ? "pointer" : "default";
      if (!ticker.isActive()) renderFrame(simNow);
    }
  });

  managed.canvas.addEventListener("pointerleave", () => {
    if (hoveredHit !== null) {
      hoveredHit = null;
      managed.canvas.style.cursor = "default";
      if (!ticker.isActive()) renderFrame(simNow);
    }
  });

  managed.canvas.addEventListener("click", (e) => {
    lastUserInteractMs = performance.now();
    const hit = hitTest(e.clientX, e.clientY);
    if (!hit) return;
    if (hit.kind === "worker") {
      crashWorker(hit.nodeIdx, hit.workerIdx);
    } else {
      triggerNodeDown(hit.nodeIdx);
    }
  });

  // Keyboard / screen-reader demo button:
  // Enter / Click = crash random worker; Shift+Enter / Shift+Click = nodedown random node
  demoBtn?.addEventListener("click", (e) => {
    lastUserInteractMs = performance.now();
    if (nodes.length === 0) return;
    const nodeIdx = demoCursor % nodes.length;
    demoCursor++;
    if (e.shiftKey) {
      triggerNodeDown(nodeIdx);
    } else {
      const node = nodes[nodeIdx]!;
      const wIdx = demoCursor % node.workers.length;
      crashWorker(nodeIdx, wIdx);
    }
  });

  // Shell intro: a `nodes().` atom landed on its card — greet it with a nodeup pulse.
  window.addEventListener("beam:nodeup", (e) => {
    const id = (e as CustomEvent<string>).detail;
    const node = nodes.find((n) => n.spec.id === id);
    if (!node || node.lifecycle !== "up") return;
    const nowMs = performance.now();
    lastUserInteractMs = nowMs; // keep the chaos monkey quiet while the page settles
    node.healUntilMs = nowMs + 950;
    node.statusText = "nodeup";
    node.statusUntilMs = nowMs + 950;
    for (const edge of edges) {
      if (edge.a === node.idx || edge.b === node.idx) edge.pulseUntilMs = nowMs + 950;
    }
    renderFrame(nowMs);
  });

  const ticker = scheduler.register("beam-cluster", tickSimulation, false);
  let visible = false;

  function syncRunState(): void {
    scheduler.setGlobalEnabled(isMotionOn());
    if (visible && isMotionOn()) {
      ticker.start();
    } else {
      ticker.pause();
      renderFrame(simNow);
    }
  }

  isVisible(mount, (v) => {
    visible = v;
    if (v && heroVisibleSinceMs === 0) {
      heroVisibleSinceMs = performance.now();
      introCrashDone = false;
      introNodedownDone = false;
      nextChaosAtMs = heroVisibleSinceMs + 10200;
    }
    syncRunState();
  });

  onMotionChange(() => syncRunState());
  onThemeChange((nextPalette) => {
    palette = nextPalette;
    renderFrame(simNow);
  });

  // Expose QA inspection & deterministic fault-injection helpers for `scripts/fx-smoke.mjs`
  (
    mount as HTMLElement & {
      __getBeamGeometry?: () => {
        isBandMode: boolean;
        nodeCount: number;
        edgeCount: number;
        rerouteCount: number;
        netsplitCount: number;
        restartCount: number;
        nodes: {
          id: string;
          lifecycle: NodeLifecycle;
          x: number;
          y: number;
          rect: BoxRect;
          workers: { id: string; x: number; y: number }[];
        }[];
        exclusionRects: BoxRect[];
      };
      __triggerNodeDown?: (nodeIdx?: number) => void;
      __triggerWorkerCrash?: (nodeIdx?: number, workerIdx?: number) => void;
    }
  ).__getBeamGeometry = () => {
    const yOffset = isBandMode ? 2 : 5;
    return {
      isBandMode,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      rerouteCount,
      netsplitCount,
      restartCount,
      nodes: nodes.map((n) => ({
        id: n.spec.id,
        lifecycle: n.lifecycle,
        x: n.cx,
        y: n.cy,
        rect: { ...n.rect },
        workers: n.workers.map((w) => ({
          id: w.id,
          x: n.cx + w.relX,
          y: n.cy + w.relY + yOffset,
        })),
      })),
      exclusionRects,
    };
  };

  (
    mount as HTMLElement & {
      __triggerNodeDown?: (nodeIdx?: number) => void;
    }
  ).__triggerNodeDown = (nodeIdx = 1) => {
    triggerNodeDown(nodeIdx % Math.max(1, nodes.length));
  };

  (
    mount as HTMLElement & {
      __triggerWorkerCrash?: (nodeIdx?: number, workerIdx?: number) => void;
    }
  ).__triggerWorkerCrash = (nodeIdx = 0, workerIdx = 0) => {
    crashWorker(nodeIdx % Math.max(1, nodes.length), workerIdx);
  };

  mount.dataset["fxReady"] = "true";
}
