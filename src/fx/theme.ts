/**
 * Shared theme palette & responsive Canvas 2D helpers for signature effects.
 * Reads CSS custom properties from `:root` and re-reads when `data-theme` mutates.
 * Caches pre-built Canvas font strings on palette computation (M7).
 */
export interface ThemePalette {
  isLight: boolean;
  bg: string;
  bgElev: string;
  surface: string;
  surface2: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  accent: string;
  accentText: string;
  msg: string;
  msgText: string;
  ok: string;
  warn: string;
  fontMono: string;
  fontSans: string;
  /** Protocol colors (theme-aware AA contrast) */
  protoSip: string;
  protoDiameter: string;
  protoNetconf: string;
  protoMqtt: string;
  protoErlang: string;
  /** Pre-built cached canvas font strings */
  mono9: string;
  mono10: string;
  mono10Bold: string;
  mono11: string;
  mono11Bold: string;
  sans11: string;
}

const listeners = new Set<(palette: ThemePalette) => void>();
let cachedPalette: ThemePalette | null = null;
let observerStarted = false;

function readProp(
  style: CSSStyleDeclaration,
  name: string,
  fallback: string,
): string {
  const val = style.getPropertyValue(name).trim();
  return val || fallback;
}

export function computePalette(): ThemePalette {
  const root = document.documentElement;
  const s = getComputedStyle(root);
  const isLight = root.dataset["theme"] === "light";
  const fontMono = readProp(s, "--font-mono", "ui-monospace, monospace");
  const fontSans = readProp(s, "--font-sans", "system-ui, sans-serif");
  cachedPalette = {
    isLight,
    bg: readProp(s, "--bg", isLight ? "#f6f7f9" : "#0b0f14"),
    bgElev: readProp(s, "--bg-elev", isLight ? "#ffffff" : "#0f151c"),
    surface: readProp(s, "--surface", isLight ? "#ffffff" : "#121a24"),
    surface2: readProp(s, "--surface-2", isLight ? "#eef1f5" : "#18222f"),
    border: readProp(s, "--border", isLight ? "#d6dce4" : "#243142"),
    borderStrong: readProp(
      s,
      "--border-strong",
      isLight ? "#b6c0cd" : "#35475d",
    ),
    text: readProp(s, "--text", isLight ? "#0f1720" : "#e6edf3"),
    textMuted: readProp(s, "--text-muted", isLight ? "#475264" : "#9daabb"),
    accent: readProp(s, "--accent", "#a90533"),
    accentText: readProp(s, "--accent-text", isLight ? "#a90533" : "#ff6b8a"),
    msg: readProp(s, "--msg", isLight ? "#0891b2" : "#22d3ee"),
    msgText: readProp(s, "--msg-text", isLight ? "#0e7490" : "#22d3ee"),
    ok: readProp(s, "--ok", isLight ? "#15803d" : "#4ade80"),
    warn: readProp(s, "--warn", isLight ? "#b45309" : "#f59e0b"),
    fontMono,
    fontSans,
    protoSip: isLight ? "#0891b2" : "#22d3ee",
    protoDiameter: isLight ? "#7c3aed" : "#a78bfa",
    protoNetconf: isLight ? "#b45309" : "#f59e0b",
    protoMqtt: isLight ? "#15803d" : "#4ade80",
    protoErlang: isLight ? "#a90533" : "#ff6b8a",
    mono9: `500 9.5px ${fontMono}`,
    mono10: `500 10px ${fontMono}`,
    mono10Bold: `600 10px ${fontMono}`,
    mono11: `500 11px ${fontMono}`,
    mono11Bold: `600 11px ${fontMono}`,
    sans11: `500 11px ${fontSans}`,
  };
  return cachedPalette;
}

export function getPalette(): ThemePalette {
  return cachedPalette ?? computePalette();
}

export function onThemeChange(cb: (palette: ThemePalette) => void): () => void {
  if (!observerStarted && typeof MutationObserver !== "undefined") {
    observerStarted = true;
    const mo = new MutationObserver(() => {
      const next = computePalette();
      for (const fn of listeners) fn(next);
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** True on narrow screens (≤900px) or coarse (touch) pointers. */
export function isCompactDevice(): boolean {
  return matchMedia("(max-width: 900px), (pointer: coarse)").matches;
}

/** Particle cap per REQUIREMENTS.org §5: ≤200 desktop, ≤60 mobile/coarse. */
export function getParticleCap(): number {
  return isCompactDevice() ? 60 : 200;
}

export interface ManagedCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  disconnect(): void;
}

/**
 * Create a Canvas 2D inside `mount`, capped at DPR 2, observed via ResizeObserver.
 * Per H3: canvas has `role="img"`, `aria-label`, and `tabIndex = -1` (keyboard
 * interaction uses the dedicated focusable demo button).
 */
export function setupCanvas(
  mount: HTMLElement,
  ariaLabel: string,
  onResize: (width: number, height: number) => void,
  interactive = false,
): ManagedCanvas | null {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", ariaLabel);
  canvas.tabIndex = -1;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  if (interactive) {
    canvas.style.pointerEvents = "auto";
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  mount.insertBefore(canvas, mount.firstChild);

  const managed: ManagedCanvas = {
    canvas,
    ctx,
    width: 0,
    height: 0,
    dpr: 1,
    disconnect: () => ro.disconnect(),
  };

  const applySize = (): boolean => {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w === managed.width && h === managed.height && dpr === managed.dpr)
      return false;
    managed.width = w;
    managed.height = h;
    managed.dpr = dpr;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  };

  applySize();
  const ro = new ResizeObserver(() => {
    if (applySize()) onResize(managed.width, managed.height);
  });
  ro.observe(mount);
  ro.observe(canvas);

  return managed;
}
