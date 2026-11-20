import { centroid, clipPoly, halfPlanes, type Pt } from "./power";

/**
 * Free spots inside a freeform cell. A narrow cell's face (its largest
 * inscribed rectangle) has no spare corner: the ⋯ button lands on a + / −
 * sign and the turn timer on the life number. The cell has room outside its
 * face, so these move to the nearest clear spot inside the polygon. Ported
 * from the layout-editor prototype's placeMore. Everything works in the
 * face's own (rotated) frame, so a result is a plain left/top on the element.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const boxOf = (pts: Pt[]): Box => {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

/**
 * The face's own frame: (0, 0) at its top-left as its player reads it.
 * `face` is in the same coordinates as the points later passed to toLocal;
 * `rotation` is the content box's CSS rotation (0/90/180/270).
 */
export function faceFrame(face: Box, rotation: number) {
  const turned = rotation === 90 || rotation === 270;
  const sw = turned ? face.h : face.w;
  const sh = turned ? face.w : face.h;
  const a = (rotation * Math.PI) / 180;
  const cos = Math.round(Math.cos(a));
  const sin = Math.round(Math.sin(a));
  const cx = face.x + face.w / 2;
  const cy = face.y + face.h / 2;
  const toLocal = (p: Pt): Pt => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return { x: dx * cos + dy * sin + sw / 2, y: -dx * sin + dy * cos + sh / 2 };
  };
  return { sw, sh, toLocal };
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Does a w×h box centred on `c` lie wholly inside the convex `poly` and
 * touch none of `blocks`? (clearSpot's own test, with no margin: is
 * something that is already there in the way.)
 */
export function fitsAt(poly: Pt[], blocks: Box[], w: number, h: number, c: Pt): boolean {
  if (poly.length < 3) return false;
  const E = halfPlanes(poly);
  const x0 = c.x - w / 2;
  const y0 = c.y - h / 2;
  for (const [x, y] of [[x0, y0], [x0 + w, y0], [x0, y0 + h], [x0 + w, y0 + h]])
    if (!E.every((e) => e.mx * x + e.my * y - e.k >= -0.5)) return false;
  const me = { x: x0, y: y0, w, h };
  return !blocks.some((b) => overlaps(me, b));
}

/** A direction as a CSS conic-gradient angle: degrees clockwise from up (screen y runs down). */
const conicDeg = (dx: number, dy: number) => (((Math.atan2(dx, -dy) * 180) / Math.PI) % 360 + 360) % 360;

/** Within this many px of the hub, a cell's corner is the one at the hub (the gap's inset moves it off). */
const HUB_CORNER = 30;

/**
 * The share of a disc centred on the hub that a convex cell holds, as a
 * conic-gradient range: `from` (degrees clockwise from up) and `sweep`.
 * Where the cell has a corner at the hub, the angle between its two edges
 * there; where the hub is the middle of one of its edges (two seats head to
 * head), the half on the cell's side of that edge.
 */
export function hubWedge(poly: Pt[], hub: Pt): { from: number; sweep: number } | null {
  const n = poly.length;
  if (n < 3) return null;
  let vi = 0;
  let vd = Infinity;
  poly.forEach((p, i) => {
    const d = Math.hypot(p.x - hub.x, p.y - hub.y);
    if (d < vd) {
      vd = d;
      vi = i;
    }
  });
  if (vd <= HUB_CORNER) {
    const V = poly[vi];
    const A = poly[(vi - 1 + n) % n];
    const B = poly[(vi + 1) % n];
    const a = conicDeg(A.x - V.x, A.y - V.y);
    const b = conicDeg(B.x - V.x, B.y - V.y);
    const d = (b - a + 360) % 360;
    return d <= 180 ? { from: a, sweep: d } : { from: b, sweep: 360 - d };
  }
  // The edge the hub lies on: the half disc on the cell's side of it.
  const E = halfPlanes(poly);
  let best = E[0];
  let bd = Infinity;
  for (const e of E) {
    const d = Math.abs(e.mx * hub.x + e.my * hub.y - e.k);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  // Inward normal m: the half disc runs from 90° anticlockwise of it.
  return { from: (conicDeg(best.mx, best.my) + 270) % 360, sweep: 180 };
}

/**
 * The corner timer on a freeform cell: a disc centred on the hub, its ring
 * drawn over the cell's share (the tile's clip shows only that), its face
 * along the share's bisector. Everything in the face's own (rotated) frame:
 * the centre in px, the angles turned back by the seat's rotation, and the
 * bisector as a unit vector.
 */
export function hubDisc(
  geom: { face: Box; hub: Pt | null; wedge: { from: number; sweep: number } | null },
  rotation: number,
): { x: number; y: number; from: number; sweep: number; bx: number; by: number } | null {
  if (!geom.hub || !geom.wedge) return null;
  const c = faceFrame(geom.face, rotation).toLocal(geom.hub);
  const from = (((geom.wedge.from - rotation) % 360) + 360) % 360;
  const mid = ((from + geom.wedge.sweep / 2) * Math.PI) / 180;
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
  return { x: r4(c.x), y: r4(c.y), from: r4(from), sweep: r4(geom.wedge.sweep), bx: r4(Math.sin(mid)), by: r4(-Math.cos(mid)) };
}

/**
 * Where the hub disc's face (fw×fh) goes, as an offset from the disc's
 * centre: on the bisector (bx, by) halfway between the hole and the rim,
 * unless that is off the cell -- a hub near the board's edge leaves only a
 * sliver of the wedge on the board -- in which case the nearest spot where
 * it lies wholly inside both the cell and the disc's face (radius `inner`).
 * `poly` and `c` in the face's own frame.
 */
export function discFaceSpot(
  poly: Pt[],
  c: Pt,
  inner: number,
  hole: number,
  b: Pt,
  fw: number,
  fh: number,
): Pt {
  // The cell cut down to the disc's face (a 32-gon just inside the circle).
  const N = 32;
  let region = poly;
  for (let k = 0; k < N && region.length >= 3; k++) {
    const a = (2 * Math.PI * k) / N;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const lim = inner * Math.cos(Math.PI / N);
    region = clipPoly(region, (p) => (p.x - c.x) * ux + (p.y - c.y) * uy - lim);
  }
  // Out from the hub toward the middle of what shows: the bisector where
  // the whole wedge is on the cell, turned toward the board where an edge
  // of it cuts the wedge short.
  let dir = b;
  if (region.length >= 3) {
    const m = centroid(region);
    const L = Math.hypot(m.x - c.x, m.y - c.y);
    if (L > 1) dir = { x: (m.x - c.x) / L, y: (m.y - c.y) / L };
  }
  const d = (inner + hole) / 2;
  const target = { x: c.x + dir.x * d, y: c.y + dir.y * d };
  const at = region.length >= 3 ? clampInPoly(region, fw, fh, target, 2) : null;
  const p = at ?? target;
  return { x: p.x - c.x, y: p.y - c.y };
}

/**
 * The centre nearest `c` at which a w×h box lies wholly inside the convex
 * `poly`, `margin` px clear of every edge: `c` itself when it already does.
 * The centres that fit are the polygon with each edge pulled in by the box's
 * reach across it (half its extent along the edge's normal) plus the margin;
 * outside that, the nearest point on its border. null when the box fits
 * nowhere. This is where a dragged timer may go on a freeform cell: the whole
 * cell, not just the rectangle its face fills.
 */
export function clampInPoly(poly: Pt[], w: number, h: number, c: Pt, margin = 4): Pt | null {
  if (poly.length < 3) return null;
  const E = halfPlanes(poly);
  const bb = boxOf(poly);
  let fit: Pt[] = [
    { x: bb.x, y: bb.y },
    { x: bb.x + bb.w, y: bb.y },
    { x: bb.x + bb.w, y: bb.y + bb.h },
    { x: bb.x, y: bb.y + bb.h },
  ];
  const need = E.map((e) => e.k + (Math.abs(e.mx) * w) / 2 + (Math.abs(e.my) * h) / 2 + margin);
  E.forEach((e, i) => {
    if (fit.length >= 3) fit = clipPoly(fit, (p) => need[i] - (e.mx * p.x + e.my * p.y));
  });
  if (fit.length < 3) return null;
  if (E.every((e, i) => e.mx * c.x + e.my * c.y >= need[i] - 1e-9)) return { x: c.x, y: c.y };
  let best = fit[0];
  let bd = Infinity;
  for (let i = 0; i < fit.length; i++) {
    const p = fit[i];
    const q = fit[(i + 1) % fit.length];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const L2 = dx * dx + dy * dy;
    const s = L2 > 0 ? Math.max(0, Math.min(1, ((c.x - p.x) * dx + (c.y - p.y) * dy) / L2)) : 0;
    const pt = { x: p.x + dx * s, y: p.y + dy * s };
    const d = (pt.x - c.x) ** 2 + (pt.y - c.y) ** 2;
    if (d < bd) {
      bd = d;
      best = pt;
    }
  }
  return best;
}

/**
 * Centre for a w×h element inside the convex `poly`, clear of `blocks`.
 * `prefer` (its usual spot) wins if it already fits; otherwise the nearest
 * fitting point on a 4px grid. null when nothing fits (keep the usual spot).
 */
export function clearSpot(
  poly: Pt[],
  blocks: Box[],
  w: number,
  h: number,
  prefer: Pt,
): { x: number; y: number; moved: boolean } | null {
  if (poly.length < 3) return null;
  const E = halfPlanes(poly);
  const fits = (cx: number, cy: number, edge: number, pad: number) => {
    const x0 = cx - w / 2;
    const y0 = cy - h / 2;
    for (const [x, y] of [[x0, y0], [x0 + w, y0], [x0, y0 + h], [x0 + w, y0 + h]])
      if (!E.every((e) => e.mx * x + e.my * y - e.k >= edge)) return false;
    const me = { x: x0 - pad, y: y0 - pad, w: w + 2 * pad, h: h + 2 * pad };
    return !blocks.some((b) => overlaps(me, b));
  };
  if (fits(prefer.x, prefer.y, 1, 2)) return { x: prefer.x, y: prefer.y, moved: false };
  const bb = boxOf(poly);
  let best: Pt | null = null;
  let bd = Infinity;
  for (let y = bb.y + h / 2; y <= bb.y + bb.h - h / 2; y += 4)
    for (let x = bb.x + w / 2; x <= bb.x + bb.w - w / 2; x += 4) {
      const d = (x - prefer.x) ** 2 + (y - prefer.y) ** 2;
      if (d < bd && fits(x, y, 5, 4)) {
        bd = d;
        best = { x, y };
      }
    }
  return best ? { ...best, moved: true } : null;
}
