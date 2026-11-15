import { cellInfo, powerCells, type Rect } from "./power";

/**
 * Where a new freeform seat goes, shared by Edit layout's (+) and the layout
 * picker's player stepper so the two cannot drift apart. All rects in board px.
 */

export const SEAT_GAP = 8;
export const MIN_TILE = 84;

export const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
export const padded = (o: Rect): Rect => ({
  x: o.x - SEAT_GAP + 1,
  y: o.y - SEAT_GAP + 1,
  w: o.w + 2 * SEAT_GAP - 2,
  h: o.h + 2 * SEAT_GAP - 2,
});

const scaledAbout = (r: Rect, k: number): Rect => {
  const kk = Math.min(1, Math.max(k, MIN_TILE / r.w, MIN_TILE / r.h));
  const w = r.w * kk;
  const hh = r.h * kk;
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - hh) / 2, w, h: hh };
};

/** The short side of the smallest cell's face; -1 if any cell is unusable. */
function fillScore(units: Rect[], SW: number, SH: number) {
  let worst = Infinity;
  for (const rp of powerCells(units)) {
    const c = cellInfo(rp, SW, SH);
    if (!c.ok) return -1;
    worst = Math.min(worst, c.rect.w, c.rect.h);
  }
  return worst;
}

/**
 * A new seat goes against a board edge at the average seat size, wherever
 * the smallest resulting cell is biggest. If there's no room, every seat
 * shrinks by the same factor first, which leaves the existing cells alone.
 * Returns the (possibly shrunk) existing seats and the new seat, in px.
 */
export function fillSpot(base: Rect[], SW: number, SH: number): { rects: Rect[]; spot: Rect } | null {
  const n = base.length || 1;
  const mw = base.reduce((s, r) => s + r.w, 0) / n || 120;
  const mh = base.reduce((s, r) => s + r.h, 0) / n || 180;
  const norm = (r: Rect) => ({ x: r.x / SW, y: r.y / SH, w: r.w / SW, h: r.h / SH });
  const perK: { score: number; rects: Rect[]; spot: Rect }[] = [];
  for (const k of [1, 0.86, 0.74, 0.64, 0.55, 0.47]) {
    const rects = base.map((r) => scaledAbout(r, k));
    const nr = scaledAbout({ x: 0, y: 0, w: mw, h: mh }, k);
    const w = nr.w;
    const hh = nr.h;
    let best: { score: number; rects: Rect[]; spot: Rect } | null = null;
    const N = 18;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      for (const c of [
        { x: 0, y: (SH - hh) * u },
        { x: SW - w, y: (SH - hh) * u },
        { x: (SW - w) * u, y: 0 },
        { x: (SW - w) * u, y: SH - hh },
      ]) {
        const r = { ...c, w, h: hh };
        if (rects.some((o) => overlap(r, padded(o)))) continue;
        const score = fillScore([...rects, r].map(norm), SW, SH);
        if (!best || score > best.score + 1e-6) best = { score, rects, spot: r };
      }
    }
    if (best) perK.push(best);
  }
  if (!perK.length) return null;
  const top = Math.max(...perK.map((b) => b.score));
  return perK.find((b) => b.score >= top * 0.92 - 1e-6) ?? null;
}
