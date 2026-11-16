import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";
import { BUILTIN_TEMPLATES, buildFreeLayout, templateSeats } from "../layout/freeform";
import { defaultLayoutFor, isStandardGrid } from "../layout/presets";
import type { LayoutConfig } from "./types";

const s = () => useStore.getState();
const X = BUILTIN_TEMPLATES.find((t) => t.id === "x")!;
const xLayout = () => buildFreeLayout(templateSeats(X), X.name);

/** Give every player a life, a counter and a name of their own. */
function mark() {
  s().game.players.forEach((p, i) => {
    s().adjustLife(p.id, -(i + 1));
    s().adjustCounter(p.id, "poison", i + 1);
    s().setPlayerName(p.id, `N${i}`);
  });
  if (s().game.players.length > 1) s().adjustCommanderDamage("p0", "p1", 7);
}

const facts = () =>
  s().game.players.map((p) => ({
    id: p.id,
    name: p.name,
    life: p.life,
    color: p.color,
    poison: p.counters.poison,
    cmdr: p.commanderDamage,
  }));

/** Four seats in a column: a grid, but not the standard one. */
const painted = (): LayoutConfig => ({
  id: "custom-draft",
  name: "4 players",
  playerCount: 4,
  rows: 4,
  cols: 1,
  placements: [0, 1, 2, 3].map((i) => ({ playerId: `p${i}`, row: i + 1, col: 1, rowSpan: 1, colSpan: 1, rotation: 0 })),
  builtIn: false,
});

beforeEach(() => {
  localStorage.clear();
  s().newGame({ playerCount: 4, startingLife: 40, layout: defaultLayoutFor(4) });
});

describe("applyBasicGrid", () => {
  it("puts a freeform board on the standard grid and keeps every player", () => {
    s().applyLayout(xLayout());
    mark();
    const before = facts();

    s().applyBasicGrid();

    expect(s().game.layout.cells).toBeUndefined();
    expect(s().game.layout.seats).toBeUndefined();
    expect(s().game.layout).toEqual(defaultLayoutFor(4));
    expect(facts()).toEqual(before);
  });

  it("keeps the turn and each sticker on its holder's tile", () => {
    s().applyLayout(xLayout());
    s().setActivePlayer("p2");
    s().giveSticker("monarch", "p3");
    const turn = s().game.turn;

    s().applyBasicGrid();

    expect(s().game.turn).toEqual(turn);
    const st = s().game.stickers.find((x) => x.id === "monarch")!;
    expect(st.holder).toBe("p3");
    // p3 sits bottom-right on the standard four-player grid.
    expect(st.x).toBeGreaterThan(0.5);
    expect(st.y).toBeGreaterThan(0.5);
  });

  it("replaces a painted grid", () => {
    s().applyLayout(painted());
    mark();
    const before = facts();
    s().applyBasicGrid();
    expect(s().game.layout).toEqual(defaultLayoutFor(4));
    expect(facts()).toEqual(before);
  });

  it("puts moved and turned seats back", () => {
    const std = defaultLayoutFor(4);
    const [a, b, ...rest] = std.placements;
    s().rearrangeSeats({
      ...std,
      id: "arranged-4",
      builtIn: false,
      placements: [{ ...a, playerId: b.playerId }, { ...b, playerId: a.playerId }, ...rest],
    });
    expect(isStandardGrid(s().game.layout)).toBe(false);
    s().applyBasicGrid();
    expect(s().game.layout).toEqual(std);

    s().setSeatRotation("p0", 180);
    expect(isStandardGrid(s().game.layout)).toBe(false);
    s().applyBasicGrid();
    expect(s().game.layout).toEqual(std);
  });

  it("leaves a board already on the standard grid untouched", () => {
    const game = s().game;
    s().applyBasicGrid();
    expect(s().game).toBe(game);
  });

  it.each([2, 3, 4, 5, 6])("works at %i players", (n) => {
    s().newGame({ playerCount: n, startingLife: 40, layout: defaultLayoutFor(n) });
    // A freeform board with n seats: add one in Edit layout's way and take it off the grid.
    const seats = Array.from({ length: n }, (_, i) => ({
      playerId: `p${i}`,
      x: 0.05 + (i % 2) * 0.5,
      y: 0.03 + Math.floor(i / 2) * 0.33,
      w: 0.4,
      h: 0.26,
      rot: null,
    }));
    s().applyLayout(buildFreeLayout(seats));
    expect(s().game.layout.cells).toHaveLength(n);
    mark();
    const before = facts();

    s().applyBasicGrid();

    expect(s().game.layout).toEqual(defaultLayoutFor(n));
    expect(s().game.players).toHaveLength(n);
    expect(facts()).toEqual(before);
  });
});

describe("isStandardGrid", () => {
  it.each([1, 2, 3, 4, 5, 6])("is true for the %i-player preset", (n) => {
    expect(isStandardGrid(defaultLayoutFor(n))).toBe(true);
  });

  it("does not care about the order placements are listed in, or the layout's name", () => {
    const std = defaultLayoutFor(5);
    expect(isStandardGrid({ ...std, id: "custom-a", name: "Mine", builtIn: false, placements: [...std.placements].reverse() })).toBe(true);
  });

  it("is false for freeform, painted, moved and turned boards", () => {
    const std = defaultLayoutFor(4);
    expect(isStandardGrid(xLayout())).toBe(false);
    expect(isStandardGrid(painted())).toBe(false);
    expect(
      isStandardGrid({ ...std, placements: std.placements.map((p, i) => (i === 0 ? { ...p, rotation: 0 } : p)) }),
    ).toBe(false);
    const [a, b, ...rest] = std.placements;
    expect(
      isStandardGrid({ ...std, placements: [{ ...a, playerId: b.playerId }, { ...b, playerId: a.playerId }, ...rest] }),
    ).toBe(false);
  });
});
