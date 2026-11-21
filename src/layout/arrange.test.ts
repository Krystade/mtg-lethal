import { describe, expect, it } from "vitest";
import {
  draftFromLayout,
  finalIds,
  finishFree,
  finishGrid,
  freeToGrid,
  gridPresetsFor,
  gridToFree,
  lastSeat,
  sameGrid,
  standardGrid,
  swapInGrid,
  turnInGrid,
  type GridDraft,
} from "./arrange";
import { BUILTIN_TEMPLATES, buildFreeLayout, templateSeats, toPts } from "./freeform";
import { gapFree } from "./table";
import { defaultLayoutFor } from "./presets";

const grid = (n: number) => draftFromLayout(defaultLayoutFor(n)) as GridDraft;
const X = BUILTIN_TEMPLATES.find((t) => t.id === "x")!;

/** A tile's unit rect, as the board draws it. */
const tileRect = (g: GridDraft, pid: string) => {
  const p = g.placements.find((q) => q.playerId === pid)!;
  return [(p.col - 1) / g.cols, (p.row - 1) / g.rows, (p.col - 1 + p.colSpan) / g.cols, (p.row - 1 + p.rowSpan) / g.rows];
};
const bbox = (poly: { x: number; y: number }[]) => [
  Math.min(...poly.map((p) => p.x)),
  Math.min(...poly.map((p) => p.y)),
  Math.max(...poly.map((p) => p.x)),
  Math.max(...poly.map((p) => p.y)),
];

describe("Grid -> Freeform", () => {
  it.each([3, 4, 5])("draws every %i-player tile exactly where it was", (n) => {
    const g = grid(n);
    const f = gridToFree(g, 375, 700);
    expect(f.drawn).not.toBeNull();
    f.seats.forEach((s, i) => {
      expect(bbox(f.drawn![i])).toEqual(tileRect(g, s.playerId));
      expect(s.rot).toBe(g.placements.find((p) => p.playerId === s.playerId)!.rotation);
    });
    // Baked for the store, the cells are still the tiles.
    const done = finishFree(f, 375, 700)!;
    done.layout.cells!.forEach((c) => {
      const was = done.keep[Number(c.playerId.slice(1))]!;
      bbox(toPts(c.poly)).forEach((v, k) => expect(v).toBeCloseTo(tileRect(g, was)[k], 3));
    });
  });

  it("keeps a swapped grid's seating", () => {
    const g = swapInGrid(grid(4), "p0", "p3");
    const f = gridToFree(g, 375, 700);
    const i = f.seats.findIndex((s) => s.playerId === "p0");
    expect(bbox(f.drawn![i])).toEqual(tileRect(grid(4), "p3"));
  });
});

describe("Freeform -> Grid", () => {
  it("is the standard grid for the seats, in seat order", () => {
    const d = draftFromLayout(buildFreeLayout(templateSeats(X), "X"));
    expect(d.mode).toBe("free");
    const g = freeToGrid(d as Exclude<typeof d, GridDraft>);
    expect(finishGrid(g).layout).toEqual(defaultLayoutFor(4));
  });
});

describe("grid edits", () => {
  it("a swap trades the two seats' tiles and facings, nothing else", () => {
    const g = swapInGrid(grid(4), "p0", "p1");
    const before = grid(4).placements;
    expect(g.placements.find((p) => p.playerId === "p0")).toMatchObject({ row: 1, col: 2, rotation: before[1].rotation });
    expect(g.placements.find((p) => p.playerId === "p1")).toMatchObject({ row: 1, col: 1, rotation: before[0].rotation });
    expect(gapFree(g)).toBe(true);
    // Nobody is renumbered by a swap.
    const f = finishGrid(g);
    expect(f.keep).toEqual(["p0", "p1", "p2", "p3"]);
    expect(f.layout.placements.find((p) => p.playerId === "p0")).toMatchObject({ row: 1, col: 2 });
  });

  it("⟳ turns one tile a quarter", () => {
    const g = turnInGrid(grid(4), "p2");
    expect(g.placements[2].rotation).toBe(180);
    expect(g.placements[0].rotation).toBe(90);
  });

  it("Players − takes the newest seat, so it undoes a +", () => {
    expect(lastSeat(["p0", "p1", "p2", "p3"])).toBe("p3");
    expect(lastSeat(["p0", "new2", "p3", "new1"])).toBe("new2");
  });

  it("a removed player's id goes to whoever has to move; new seats fill the rest", () => {
    expect(finalIds(["p0", "p3", "p2"])).toEqual(["p0", "p1", "p2"]);
    expect(finalIds(["p1", "new1", "p0"])).toEqual(["p1", "p2", "p0"]);
    const f = finishGrid(standardGrid(["p0", "p3", "p2"]));
    expect(f.keep).toEqual(["p0", "p3", "p2"]);
  });
});

describe("grid templates", () => {
  it("are for the players at the table, standard first, all solid", () => {
    for (let n = 1; n <= 6; n++) {
      const ps = gridPresetsFor(n);
      expect(sameGrid(ps[0], defaultLayoutFor(n))).toBe(true);
      ps.forEach((p) => {
        expect(p.placements).toHaveLength(n);
        expect(gapFree(p)).toBe(true);
      });
    }
    expect(gridPresetsFor(4).map((p) => p.name)).toEqual(["Standard", "Ends"]);
  });

  it("sameGrid ignores who sits where but not shape or facing", () => {
    expect(sameGrid(swapInGrid(grid(4), "p0", "p1"), grid(4))).toBe(true);
    expect(sameGrid(gridPresetsFor(4)[1], grid(4))).toBe(false);
    expect(sameGrid(grid(4), defaultLayoutFor(4))).toBe(true);
    expect(sameGrid(turnInGrid(grid(4), "p0"), grid(4))).toBe(false);
  });
});
