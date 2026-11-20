import { describe, expect, it } from "vitest";
import { clampInPoly, clearSpot, discFaceSpot, faceFrame, fitsAt, hubDisc } from "./polyPlace";
import { BUILTIN_TEMPLATES, buildFreeLayout, polyGeoms, templateSeats } from "./freeform";
import { boardHub } from "./junction";

// A tall triangle-ish cell: wide at the bottom, narrow at the top.
const poly = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 120, y: 300 },
  { x: 0, y: 300 },
];

describe("clearSpot", () => {
  it("keeps the usual spot when it already fits", () => {
    expect(clearSpot(poly, [], 20, 20, { x: 30, y: 250 })).toEqual({ x: 30, y: 250, moved: false });
  });

  it("moves to the nearest spot clear of a block and inside the cell", () => {
    const block = { x: 0, y: 200, w: 60, h: 80 };
    const s = clearSpot(poly, [block], 20, 20, { x: 30, y: 250 })!;
    expect(s.moved).toBe(true);
    const me = { x: s.x - 10, y: s.y - 10, w: 20, h: 20 };
    const hit = me.x < block.x + block.w && me.x + me.w > block.x && me.y < block.y + block.h && me.y + me.h > block.y;
    expect(hit).toBe(false);
    // inside: right edge runs from (40,0) to (120,300)
    expect(me.x + me.w).toBeLessThanOrEqual(40 + (80 * me.y) / 300);
  });

  it("gives up (null) when nothing fits", () => {
    expect(clearSpot(poly, [{ x: -10, y: -10, w: 200, h: 400 }], 20, 20, { x: 30, y: 250 })).toBeNull();
  });
});

describe("clampInPoly", () => {
  // The playtest's triangle: apex on the left at the hub, base the right edge.
  const tri = [
    { x: 0, y: 150 },
    { x: 300, y: 0 },
    { x: 300, y: 300 },
  ];
  const inside = (c: { x: number; y: number }, w: number, h: number, m: number) =>
    // Top edge y = 150 - x/2, bottom edge y = 150 + x/2, right edge x = 300.
    c.x + w / 2 <= 300 - m + 1e-6 &&
    c.y - h / 2 >= 150 - (c.x - w / 2) / 2 + m * Math.hypot(1, 0.5) - 1e-6 &&
    c.y + h / 2 <= 150 + (c.x - w / 2) / 2 - m * Math.hypot(1, 0.5) + 1e-6;

  it("keeps a spot that already fits, even far outside the face rectangle", () => {
    // The triangle's largest rectangle is x 150-300; this is well left of it.
    expect(clampInPoly(tri, 40, 20, { x: 110, y: 150 }, 4)).toEqual({ x: 110, y: 150 });
  });

  it("pulls a spot past an edge back to the nearest one inside, the whole box clear", () => {
    for (const c of [
      { x: 20, y: 150 }, // past the apex
      { x: 200, y: 40 }, // over the top edge
      { x: 340, y: 280 }, // past the base corner
    ]) {
      const p = clampInPoly(tri, 40, 20, c, 4)!;
      expect(inside(p, 40, 20, 4)).toBe(true);
    }
    // Straight up from the middle: it slides to the top edge, not the face.
    const p = clampInPoly(tri, 40, 20, { x: 200, y: 40 }, 4)!;
    expect(p.y).toBeLessThan(110);
  });

  it("null when the box fits nowhere", () => {
    expect(clampInPoly(tri, 400, 20, { x: 200, y: 150 }, 4)).toBeNull();
  });
});

describe("corner timer on a freeform cell: a disc on the hub", () => {
  // The playtest's layout: two seats stacked on the left, one big seat on the
  // right whose cell is a triangle with its apex at the hub.
  const OWNER = [
    { x: 0.325, y: 0.05, w: 0.2, h: 0.4, rot: null },
    { x: 0.325, y: 0.55, w: 0.2, h: 0.4, rot: null },
    { x: 0.36, y: 0.36, w: 0.3, h: 0.28, rot: null },
  ].map((s, i) => ({ playerId: `p${i}`, ...s }));
  const W = 732;
  const H = 1125;
  const layouts = {
    owner: buildFreeLayout(OWNER),
    x: buildFreeLayout(templateSeats(BUILTIN_TEMPLATES.find((t) => t.id === "x")!)),
    grid: buildFreeLayout(templateSeats(BUILTIN_TEMPLATES.find((t) => t.id === "grid")!)),
  };

  it("the playtest layout is two cells and a triangle", () => {
    expect(layouts.owner.cells!.map((c) => c.poly.length)).toEqual([5, 5, 3]);
  });

  for (const [name, l] of Object.entries(layouts)) {
    it(`${name}: every seat's disc is centred on the hub, its share inside the cell`, () => {
      const geoms = polyGeoms(l.cells!, W, H);
      const hub = boardHub(l);
      let total = 0;
      for (const c of l.cells!) {
        const g = geoms.get(c.playerId)!;
        expect(g.wedge).not.toBeNull();
        total += g.wedge!.sweep;
        // The hub, in the tile's box.
        expect(g.hub!.x + g.box.x).toBeCloseTo(hub.x * W, 6);
        expect(g.hub!.y + g.box.y).toBeCloseTo(hub.y * H, 6);
        // Out along the share's bisector the disc is on this cell.
        const mid = ((g.wedge!.from + g.wedge!.sweep / 2) * Math.PI) / 180;
        const p = { x: g.hub!.x + 60 * Math.sin(mid), y: g.hub!.y - 60 * Math.cos(mid) };
        expect(fitsAt(g.poly, [], 1, 1, p)).toBe(true);
        // In the face's frame the disc's centre is the hub, and its bisector
        // is the same direction turned by the seat's rotation.
        const d = hubDisc(g, c.rotation)!;
        const f = faceFrame(g.face, c.rotation).toLocal;
        const h = f(g.hub!);
        expect(d.x).toBeCloseTo(h.x, 3);
        expect(d.y).toBeCloseTo(h.y, 3);
        const q = f(p);
        expect(d.bx).toBeCloseTo((q.x - h.x) / 60, 3);
        expect(d.by).toBeCloseTo((q.y - h.y) / 60, 3);
      }
      // The shares round the hub make the whole disc.
      expect(total).toBeGreaterThan(350);
      expect(total).toBeLessThan(370);
    });
  }

  it("the face goes where it is on the cell, not off the board, by a hub near the edge", () => {
    const geoms = polyGeoms(layouts.owner.cells!, W, H);
    const c = layouts.owner.cells![0];
    const g = geoms.get(c.playerId)!;
    const d = hubDisc(g, c.rotation)!;
    const poly = g.poly.map(faceFrame(g.face, c.rotation).toLocal);
    const o = discFaceSpot(poly, d, 140, 50, { x: d.bx, y: d.by }, 60, 50);
    expect(fitsAt(poly, [], 60, 50, { x: d.x + o.x, y: d.y + o.y })).toBe(true);
  });
});

describe("faceFrame", () => {
  it("maps a 90° face into its own frame", () => {
    const f = faceFrame({ x: 0, y: 0, w: 100, h: 200 }, 90);
    expect([f.sw, f.sh]).toEqual([200, 100]);
    // rotate(90deg) sends local +x to screen +y: the face's top-left (as read) is the screen's top-right.
    const p = f.toLocal({ x: 100, y: 0 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });
});
