// E-01 v2 ("Fault-tolerant BEAM mesh") & Phase 2–3 signature effects verification.
// Runs against an existing `npx astro preview --port 4322` or starts its own preview server.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import { preview } from "astro";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const PORT = 4322;
const BASE = `http://127.0.0.1:${PORT}/datnguyenfolio`;
const OUT_DIR = "qa/hero-v2";

const EFFECTS = [
  "beam-cluster",
  "terminal-typing",
  "mailbox-fifo",
  "commit-log",
  "supervision-tree",
  "send-message",
];

function resolveAxeScriptPath() {
  try {
    return require.resolve("axe-core/axe.min.js");
  } catch {
    // Fallback to cached npx or install into /tmp/axe-qa
  }
  const cached = [
    "/tmp/axe-qa/node_modules/axe-core/axe.min.js",
    "/Users/datnguyen/.npm/_npx/0f94ee7615faf582/node_modules/axe-core/axe.min.js",
    "/Users/datnguyen/.npm/_npx/ffe2131771d88588/node_modules/axe-core/axe.min.js",
  ];
  for (const p of cached) {
    if (existsSync(p)) return p;
  }
  execSync("npm install --prefix /tmp/axe-qa axe-core --no-save --silent");
  return "/tmp/axe-qa/node_modules/axe-core/axe.min.js";
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ port, host: "127.0.0.1" });
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => {
      sock.destroy();
      resolve(false);
    });
  });
}

await mkdir(OUT_DIR, { recursive: true });
const axePath = resolveAxeScriptPath();

let ownServer = null;
if (!(await isPortOpen(PORT))) {
  ownServer = await preview({
    root: process.cwd(),
    logLevel: "warn",
    server: { port: PORT, host: "127.0.0.1" },
  });
}

const browser = await chromium.launch();
const report = {
  routes: {},
  heroFps: 0,
  longTasksOver50ms: 0,
  axeViolations: { "/": 0, "/vi/": 0, "/ (light)": 0 },
  coldCls: { "/": 0, "/vi/": 0 },
  geometryAssertions: {},
  mailboxPillOverlap: false,
  heroWorkerCrashRestart: null,
  heroNodedownFailover: null,
  terminalLogLinesAfterCrash: 0,
  skillCrashReport: null,
  contactSendAck: null,
  reducedMotionRafCallsIn1s: null,
  consoleErrors: [],
};

try {
  // 1. Standard motion context: test `/` and `/vi/`, mount all 6 effects, run axe-core
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 840 },
    colorScheme: "dark",
    reducedMotion: "no-preference",
  });
  const page = await ctx.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") report.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    report.consoleErrors.push(String(err));
  });

  const sectionIds = [
    "hero",
    "about",
    "experience",
    "skills",
    "projects",
    "publications",
    "education",
    "contact",
  ];

  for (const route of ["/", "/vi/"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });

    for (const id of sectionIds) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      await page.waitForTimeout(120);
    }

    for (const fx of EFFECTS) {
      await page.waitForSelector(`[data-effect="${fx}"][data-fx-ready="true"]`, {
        timeout: 5000,
      });
    }

    // Verify canvas role="img", aria-label, and tabindex="-1"
    for (const canvasFx of ["beam-cluster", "mailbox-fifo", "send-message"]) {
      const hasAria = await page
        .locator(
          `[data-effect="${canvasFx}"] canvas[role="img"][aria-label][tabindex="-1"]`,
        )
        .count();
      if (hasAria !== 1) {
        throw new Error(`Missing accessible canvas in ${canvasFx} on ${route}`);
      }
    }

    // Inject axe-core and assert 0 violations in dark mode
    await page.addScriptTag({ path: axePath });
    const axeResult = await page.evaluate(async () => {
      // @ts-ignore
      const res = await window.axe.run(document);
      return res.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.length,
      }));
    });
    report.axeViolations[route] = axeResult.length;
    if (axeResult.length > 0) {
      throw new Error(
        `axe-core violations on ${route}: ${JSON.stringify(axeResult)}`,
      );
    }

    const hintText = await page
      .locator('[data-effect="beam-cluster"] [data-beam-hint]')
      .textContent();
    const hudText = await page
      .locator('[data-effect="beam-cluster"] [data-beam-hud]')
      .textContent();

    report.routes[route] = {
      mountedEffects: EFFECTS.length,
      beamHint: hintText?.trim().replace(/\s+/g, " "),
      beamHud: hudText?.trim().replace(/\s+/g, " "),
    };
  }

  // Also verify 0 axe violations in Light theme (glass terminal contrast check)
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await page.waitForTimeout(150);
  await page.addScriptTag({ path: axePath });
  const lightAxeResult = await page.evaluate(async () => {
    // @ts-ignore
    const res = await window.axe.run(document);
    return res.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.length,
    }));
  });
  report.axeViolations["/ (light)"] = lightAxeResult.length;
  if (lightAxeResult.length > 0) {
    throw new Error(
      `axe-core violations on / (light): ${JSON.stringify(lightAxeResult)}`,
    );
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });

  // 2. Hero mesh: crash/restart, nodedown failover, FPS (fresh loads beat passive intro timing)
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.locator("#hero").scrollIntoViewIfNeeded();
  await page.waitForSelector('[data-effect="beam-cluster"][data-fx-ready="true"]');

  // 2a. Placeholder before passive intro (~2.5s), then manual worker crash via Enter
  const placeholderBefore = await page
    .locator("[data-terminal-live] [data-log-seed]")
    .textContent();
  if (!placeholderBefore || !placeholderBefore.includes("observing mesh")) {
    throw new Error(
      `Expected terminal live placeholder before first event, got: ${placeholderBefore}`,
    );
  }

  const demoBtn = page.locator('[data-effect="beam-cluster"] [data-beam-demo]');
  await demoBtn.focus();
  await page.keyboard.press("Enter");
  await demoBtn.evaluate((el) => el.blur());
  const crashedWorker = await page
    .locator('[data-effect="beam-cluster"]')
    .getAttribute("data-last-crash");
  await page.waitForTimeout(1050);
  const restartedWorker = await page
    .locator('[data-effect="beam-cluster"]')
    .getAttribute("data-last-restart");
  const liveAfterCrash = await page
    .locator('[data-effect="beam-cluster"] [data-beam-live]')
    .textContent();

  // Verify terminal received >= 1 live log line after crash
  const termLogInfo = await page.evaluate(() => {
    const lines = Array.from(
      document.querySelectorAll("[data-terminal-live] [data-log-line]"),
    ).map((el) => el.textContent?.trim() ?? "");
    return { count: lines.length, lines };
  });
  report.terminalLogLinesAfterCrash = termLogInfo.count;
  report.heroWorkerCrashRestart = {
    crashedWorker,
    restartedWorker,
    liveAnnouncement: liveAfterCrash?.trim(),
    terminalLogs: termLogInfo.lines,
  };

  if (!crashedWorker || !restartedWorker || termLogInfo.count < 1) {
    throw new Error(
      `Hero worker crash/restart or terminal log failed: crashed=${crashedWorker}, restarted=${restartedWorker}, logs=${termLogInfo.count}`,
    );
  }

  // 2b. Fresh load: trigger `nodedown` on `nso1@netauto` before passive intro (~5.2s)
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.locator("#hero").scrollIntoViewIfNeeded();
  await page.waitForSelector('[data-effect="beam-cluster"][data-fx-ready="true"]');
  await page.waitForTimeout(450);

  await page.evaluate(() => {
    const m = document.querySelector('[data-effect="beam-cluster"]');
    // @ts-ignore
    m?.__triggerNodeDown?.(1);
  });
  await page.waitForTimeout(350);

  // Screenshot mid-nodedown frame at 1280 dark
  await page.screenshot({ path: `${OUT_DIR}/hero-1280-nodedown.png` });

  const midDownState = await page.evaluate(() => {
    const m = document.querySelector('[data-effect="beam-cluster"]');
    // @ts-ignore
    const info = m?.__getBeamGeometry?.();
    return {
      lastNodedown: m?.getAttribute("data-last-nodedown"),
      lastReroute: m?.getAttribute("data-last-reroute"),
      rerouteCount: info?.rerouteCount ?? 0,
      downNodeLifecycle: info?.nodes?.[1]?.lifecycle,
    };
  });

  if (
    midDownState.downNodeLifecycle !== "down" ||
    !midDownState.lastReroute ||
    midDownState.rerouteCount < 1
  ) {
    throw new Error(
      `Nodedown or reroute not observed: ${JSON.stringify(midDownState)}`,
    );
  }

  // Wait up to 2.3s for `nodeup` healing
  await page.waitForTimeout(2000);
  const healedState = await page.evaluate(() => {
    const m = document.querySelector('[data-effect="beam-cluster"]');
    // @ts-ignore
    const info = m?.__getBeamGeometry?.();
    const logs = Array.from(
      document.querySelectorAll("[data-terminal-live] [data-log-line]"),
    ).map((el) => el.textContent?.trim() ?? "");
    return {
      lastNodeup: m?.getAttribute("data-last-nodeup"),
      healedLifecycle: info?.nodes?.[1]?.lifecycle,
      logs,
    };
  });

  if (
    healedState.healedLifecycle !== "up" ||
    healedState.lastNodeup !== midDownState.lastNodedown
  ) {
    throw new Error(`Nodeup heal failed within 3s: ${JSON.stringify(healedState)}`);
  }

  report.heroNodedownFailover = {
    nodedown: midDownState.lastNodedown,
    reroutePath: midDownState.lastReroute,
    rerouteCount: midDownState.rerouteCount,
    nodeup: healedState.lastNodeup,
    terminalLogs: healedState.logs,
  };

  if (midDownState.lastNodedown !== "nso1@netauto") {
    throw new Error(
      `Expected nodedown on nso1@netauto, got ${midDownState.lastNodedown}`,
    );
  }

  // 2c. Measure Hero FPS over 3s on a clean hero view
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.locator("#hero").scrollIntoViewIfNeeded();
  await page.waitForSelector('[data-effect="beam-cluster"][data-fx-ready="true"]');

  const perfResult = await page.evaluate(async () => {
    let longTasks = 0;
    let po = null;
    if ("PerformanceObserver" in window) {
      try {
        po = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) longTasks++;
          }
        });
        po.observe({ entryTypes: ["longtask"] });
      } catch {
        // ignore
      }
    }
    const frames = await new Promise((resolve) => {
      let count = 0;
      const start = performance.now();
      function step(now) {
        count++;
        if (now - start < 3000) {
          requestAnimationFrame(step);
        } else {
          resolve({ count, elapsed: now - start });
        }
      }
      requestAnimationFrame(step);
    });
    po?.disconnect();
    return {
      fps: Number(((frames.count * 1000) / frames.elapsed).toFixed(1)),
      longTasks,
    };
  });

  report.heroFps = perfResult.fps;
  report.longTasksOver50ms = perfResult.longTasks;

  // Contact send-message trigger
  await page.locator("#contact").scrollIntoViewIfNeeded();
  await page.waitForSelector('[data-effect="send-message"][data-fx-ready="true"]');
  await page.locator('[data-effect="send-message"] [data-send-trigger]').click();
  await page.waitForTimeout(1050);
  report.contactSendAck = await page
    .locator('[data-effect="send-message"]')
    .getAttribute("data-last-ack");

  // 3. Viewport geometry assertions & screenshots (390, 768, 1280, 1920)
  const viewports = [
    { width: 390, height: 844, label: "390", expectedNodes: 4 },
    { width: 768, height: 920, label: "768", expectedNodes: 4 },
    { width: 1280, height: 840, label: "1280", expectedNodes: 6 },
    { width: 1920, height: 1080, label: "1920", expectedNodes: 6 },
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.locator('[data-effect="beam-cluster"]').scrollIntoViewIfNeeded();
    await page.waitForSelector('[data-effect="beam-cluster"][data-fx-ready="true"]');
    // Wait for terminal typing to finish so screenshots show all 4 commands + prompt 5> cleanly
    await page.locator("#hero").scrollIntoViewIfNeeded();
    await page.waitForSelector(
      '[data-effect="terminal-typing"][data-typing-state="done"]',
      { timeout: 6000 },
    );
    await page.waitForTimeout(150);

    const geom = await page.evaluate(() => {
      const mount = document.querySelector('[data-effect="beam-cluster"]');
      const canvasEl = mount.querySelector("canvas");
      const hintEl = mount.querySelector("[data-beam-hint]");
      const hintPrimaryEl = mount.querySelector("[data-beam-hint-primary]");
      const copyEl = document.querySelector(".hero__copy");
      const ctaEl = document.querySelector(".hero__cta");
      const termEl = document.querySelector(".terminal");
      const mRect = mount.getBoundingClientRect();
      const canvasRect = canvasEl.getBoundingClientRect();
      const hintRect = hintEl.getBoundingClientRect();
      const cRect = copyEl.getBoundingClientRect();
      const ctaRect = ctaEl.getBoundingClientRect();
      const tRect = termEl.getBoundingClientRect();
      // @ts-ignore
      const info = mount.__getBeamGeometry ? mount.__getBeamGeometry() : null;

      function overlaps(a, b) {
        return !(
          a.right <= b.left ||
          a.left >= b.right ||
          a.bottom <= b.top ||
          a.top >= b.bottom
        );
      }

      let nodeRectsOverlappingCopyOrTerm = 0;
      if (info && !info.isBandMode) {
        const rawCopy = {
          left: cRect.left - mRect.left,
          top: cRect.top - mRect.top,
          right: cRect.right - mRect.left,
          bottom: cRect.bottom - mRect.top,
        };
        const rawTerm = {
          left: tRect.left - mRect.left,
          top: tRect.top - mRect.top,
          right: tRect.right - mRect.left,
          bottom: tRect.bottom - mRect.top,
        };
        for (const n of info.nodes) {
          if (overlaps(n.rect, rawCopy) || overlaps(n.rect, rawTerm)) {
            nodeRectsOverlappingCopyOrTerm++;
          }
        }
      }

      let allCardsFitCanvasWithPadding = true;
      let minBottomPaddingPx = 999;
      if (info && info.nodes) {
        for (const n of info.nodes) {
          const botPad = canvasRect.height - n.rect.bottom;
          if (botPad < minBottomPaddingPx) minBottomPaddingPx = botPad;
          if (
            n.rect.top < 12 ||
            n.rect.bottom > canvasRect.height - 12 ||
            n.rect.left < 6 ||
            n.rect.right > canvasRect.width - 6
          ) {
            allCardsFitCanvasWithPadding = false;
          }
        }
      }

      return {
        viewportWidth: window.innerWidth,
        isBandMode: info?.isBandMode ?? false,
        nodeCount: info?.nodeCount ?? 0,
        edgeCount: info?.edgeCount ?? 0,
        nodeIds: info?.nodes?.map((n) => n.id) ?? [],
        nodeRectsOverlappingCopyOrTerm,
        canvasTopBelowCtas: mRect.top >= ctaRect.bottom - 1,
        canvasTopBelowTerminal: mRect.top >= tRect.bottom - 1,
        hintTopBelowCanvas: hintRect.top >= canvasRect.bottom + 4,
        hintGapFromBottomCardPx: Math.round(
          hintRect.top - (canvasRect.top + (canvasRect.height - minBottomPaddingPx)),
        ),
        allCardsFitCanvasWithPadding,
        hintPrimaryText: hintPrimaryEl?.textContent?.trim() ?? "",
      };
    });

    report.geometryAssertions[vp.label] = geom;

    const expectedEdges = (vp.expectedNodes * (vp.expectedNodes - 1)) / 2;
    if (geom.nodeCount !== vp.expectedNodes) {
      throw new Error(
        `Expected ${vp.expectedNodes} nodes at ${vp.label}, got ${geom.nodeCount}`,
      );
    }
    if (geom.edgeCount !== expectedEdges) {
      throw new Error(
        `Expected ${expectedEdges} full-mesh edges at ${vp.label}, got ${geom.edgeCount}`,
      );
    }
    if (vp.width >= 1280 && geom.nodeRectsOverlappingCopyOrTerm > 0) {
      throw new Error(
        `Node card rect overlapped copy or terminal at ${vp.label}: ${JSON.stringify(geom)}`,
      );
    }
    if (vp.width <= 900) {
      if (!geom.canvasTopBelowCtas || !geom.hintTopBelowCanvas || !geom.allCardsFitCanvasWithPadding) {
        throw new Error(
          `Mobile/tablet band layout check failed at ${vp.label}: ${JSON.stringify(geom)}`,
        );
      }
      if (!geom.hintPrimaryText.startsWith("Tap a worker")) {
        throw new Error(
          `Expected mobile hint copy at ${vp.label}, got: ${geom.hintPrimaryText}`,
        );
      }
    }

    // Trigger a worker crash so the terminal has a fresh live report line in desktop screenshots,
    // and keep the first mobile screenshot showing the initial placeholder or post-crash cleanly
    await page.evaluate(() => {
      const m = document.querySelector('[data-effect="beam-cluster"]');
      // @ts-ignore
      m?.__triggerWorkerCrash?.(0, 0);
    });
    await page.waitForTimeout(980);

    // For mobile/tablet (390, 768), frame the terminal live log + full mesh band + normal-flow hint with bottom margin
    if (vp.width <= 900) {
      await page.evaluate(() => {
        const el = document.querySelector('[data-effect="beam-cluster"]');
        if (el) {
          const r = el.getBoundingClientRect();
          window.scrollBy(0, r.bottom - window.innerHeight + 36);
        }
      });
      await page.waitForTimeout(100);
    }

    // Dark screenshot
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
    });
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${OUT_DIR}/hero-${vp.label}-dark.png` });

    // Light screenshot
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "light";
    });
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${OUT_DIR}/hero-${vp.label}-light.png` });

    // Restore dark
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
    });

    // Verify About mailbox pills never overlap
    await page.locator("#about").scrollIntoViewIfNeeded();
    await page.waitForSelector('[data-effect="mailbox-fifo"][data-fx-ready="true"]');
    await page.waitForTimeout(200);
    const pillOverlap = await page.evaluate(() => {
      const m = document.querySelector('[data-effect="mailbox-fifo"]');
      // @ts-ignore
      const pills = m?.__getMailboxPills ? m.__getMailboxPills() : [];
      for (let i = 0; i < pills.length - 1; i++) {
        if (pills[i].x + pills[i].width > pills[i + 1].x + 0.5) {
          return true;
        }
      }
      return false;
    });
    if (pillOverlap) {
      report.mailboxPillOverlap = true;
      throw new Error(`Mailbox pills overlapped at viewport ${vp.label}`);
    }

    // Verify Skills global strategy + worker button crash
    await page.locator("#skills").scrollIntoViewIfNeeded();
    await page.waitForSelector(
      '[data-effect="supervision-tree"][data-fx-ready="true"]',
    );
    await page
      .locator(
        '[data-effect="supervision-tree"] input[name="sup-global-strategy"][value="rest_for_one"]',
      )
      .check();
    const firstGroup = page.locator("#skills .group").first();
    await firstGroup.locator(".worker__btn").nth(1).click();
    await page.waitForTimeout(200);
    const supPrimary = await page
      .locator('[data-effect="supervision-tree"] [data-sup-primary]')
      .textContent();
    const supSub = await page
      .locator('[data-effect="supervision-tree"] [data-sup-sub]')
      .textContent();
    report.skillCrashReport = {
      primary: supPrimary?.trim(),
      sub: supSub?.trim(),
    };
  }

  await ctx.close();

  // 4. Cold-load CLS on `/` and `/vi/` (cache disabled, slow 4G, 4x CPU, Pixel 7 412x915)
  for (const route of ["/", "/vi/"]) {
    const clsCtx = await browser.newContext({
      viewport: { width: 412, height: 915 },
      userAgent:
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      deviceScaleFactor: 2.625,
      isMobile: true,
      hasTouch: true,
    });
    const clsPage = await clsCtx.newPage();
    const cdp = await clsCtx.newCDPSession(clsPage);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: Math.floor((1.6 * 1024 * 1024) / 8),
      uploadThroughput: Math.floor((750 * 1024) / 8),
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    await clsPage.addInitScript(() => {
      // @ts-ignore
      window.__clsValue = 0;
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // @ts-ignore
          if (!entry.hadRecentInput) {
            // @ts-ignore
            window.__clsValue += entry.value;
          }
        }
      });
      po.observe({ type: "layout-shift", buffered: true });
    });

    await clsPage.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    await clsPage.waitForTimeout(800);
    const clsVal = await clsPage.evaluate(() => {
      // @ts-ignore
      return Number((window.__clsValue || 0).toFixed(4));
    });
    report.coldCls[route] = clsVal;
    await clsCtx.close();

    if (clsVal >= 0.05) {
      throw new Error(`Cold CLS on ${route} exceeded 0.05: ${clsVal}`);
    }
  }

  // 5. Reduced-motion verification: static frame rendered, 0 continuous rAF calls
  const rmCtx = await browser.newContext({
    viewport: { width: 1280, height: 840 },
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  const rmPage = await rmCtx.newPage();
  rmPage.on("console", (msg) => {
    if (msg.type() === "error") report.consoleErrors.push(msg.text());
  });

  await rmPage.goto(`${BASE}/`, { waitUntil: "networkidle" });
  for (const id of ["hero", "about", "experience", "skills", "contact"]) {
    await rmPage.locator(`#${id}`).scrollIntoViewIfNeeded();
    await rmPage.waitForTimeout(100);
  }
  for (const fx of EFFECTS) {
    await rmPage.waitForSelector(
      `[data-effect="${fx}"][data-fx-ready="true"]`,
      { timeout: 5000 },
    );
  }
  await rmPage.locator("#hero").scrollIntoViewIfNeeded();
  await rmPage.waitForTimeout(150);

  const rmCheck = await rmPage.evaluate(async () => {
    let appRafCalls = 0;
    const origRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = function (cb) {
      appRafCalls++;
      return origRaf.call(window, cb);
    };
    await new Promise((r) => setTimeout(r, 1000));
    window.requestAnimationFrame = origRaf;

    const c = document.querySelector('[data-effect="beam-cluster"] canvas');
    const ctx2d = c.getContext("2d");
    const data = ctx2d.getImageData(0, 0, c.width, c.height).data;
    let nonZero = 0;
    for (let i = 3; i < data.length; i += 64) {
      if (data[i] > 0) nonZero++;
    }
    return {
      motionAttr: document.documentElement.dataset.motion,
      appRafCalls,
      staticPixelsDrawn: nonZero > 0,
    };
  });

  report.reducedMotionRafCallsIn1s = rmCheck;
  await rmCtx.close();

  if (
    rmCheck.motionAttr !== "off" ||
    rmCheck.appRafCalls !== 0 ||
    !rmCheck.staticPixelsDrawn
  ) {
    throw new Error(
      `Reduced motion check failed: ${JSON.stringify(rmCheck)}`,
    );
  }
  if (report.consoleErrors.length > 0) {
    throw new Error(`Console errors: ${report.consoleErrors.join("; ")}`);
  }

  // HR review captures (~4s after load, passive intro story visible)
  const HR_DIR = "qa/hr-fix";
  await mkdir(HR_DIR, { recursive: true });
  const hrCaptures = [
    { width: 1440, height: 900, theme: "dark", file: "hero-1440-dark.png" },
    { width: 1440, height: 900, theme: "light", file: "hero-1440-light.png" },
    { width: 390, height: 844, theme: "dark", file: "hero-390.png" },
  ];
  const hrCtx = await browser.newContext({
    colorScheme: "dark",
    reducedMotion: "no-preference",
  });
  const hrPage = await hrCtx.newPage();
  for (const cap of hrCaptures) {
    await hrPage.setViewportSize({ width: cap.width, height: cap.height });
    await hrPage.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await hrPage.locator("#hero").scrollIntoViewIfNeeded();
    await hrPage.waitForSelector(
      '[data-effect="beam-cluster"][data-fx-ready="true"]',
    );
    await hrPage.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, cap.theme);
    await hrPage.waitForTimeout(4000);
    await hrPage.screenshot({ path: `${HR_DIR}/${cap.file}` });
  }
  await hrCtx.close();

  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await ownServer?.stop();
}
