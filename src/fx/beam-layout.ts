import { rectsOverlap, type BoxRect } from "./engine/mesh-router";

interface Placed {
  rect: BoxRect;
}

function isCardRectFree(
  rect: BoxRect,
  width: number,
  height: number,
  exclusionRects: readonly BoxRect[],
  placed: readonly Placed[],
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
  if (exclusionRects.some((ex) => rectsOverlap(rect, ex, padExcl))) return false;
  return !placed.some((p) => rectsOverlap(rect, p.rect, 10));
}

export function resolveCardPosition(
  prefCx: number,
  prefCy: number,
  cardW: number,
  cardH: number,
  width: number,
  height: number,
  exclusionRects: readonly BoxRect[],
  placed: readonly Placed[],
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
  if (isCardRectFree(baseRect, width, height, exclusionRects, placed, 8)) {
    return { cx: baseCx, cy: baseCy, rect: baseRect };
  }

  const dySteps = [0, -18, 18, -36, 36, -56, 56, -78, 78];
  const dxSteps = [0, -32, 32, -68, 68, -110, 110, -160, 160];
  for (const dy of dySteps) {
    for (const dx of dxSteps) {
      const cx = clampX(baseCx + dx);
      const cy = clampY(baseCy + dy);
      const r = makeRect(cx, cy);
      if (isCardRectFree(r, width, height, exclusionRects, placed, 6)) {
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
      if (isCardRectFree(r, width, height, exclusionRects, placed, 4)) {
        return { cx: bx, cy: by, rect: r };
      }
    }
  }

  return { cx: baseCx, cy: baseCy, rect: baseRect };
}
