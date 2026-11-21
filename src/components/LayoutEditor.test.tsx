import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LayoutEditor } from "./LayoutEditor";
import { useLayoutEdit } from "./layoutEdit";
import { useStore } from "../state/store";
import { STORAGE_KEY } from "../state/storageKey";
import { BUILTIN_TEMPLATES, buildFreeLayout, templateSeats, toPts } from "../layout/freeform";
import { defaultLayoutFor } from "../layout/presets";

const s = () => useStore.getState();
const X = BUILTIN_TEMPLATES.find((t) => t.id === "x")!;
const W = 375;
const H = 700;

beforeEach(() => {
  localStorage.clear();
  s().newGame({ playerCount: 4, startingLife: 40, layout: defaultLayoutFor(4) });
  useLayoutEdit.getState().start();
});
afterEach(cleanup);

/** Give every player a life, a counter, a name and a colour of their own. */
function mark() {
  s().game.players.forEach((p, i) => {
    s().adjustLife(p.id, -(i + 1));
    s().adjustCounter(p.id, "poison", i + 1);
    s().setPlayerName(p.id, `N${i}`);
  });
  s().setPlayerLook("p2", "green");
  s().adjustCommanderDamage("p0", "p1", 7);
}
/** Each player by name: everything but the seat. */
const people = () =>
  Object.fromEntries(
    s().game.players.map((p) => [p.name, { life: p.life, color: p.color, look: p.look, poison: p.counters.poison }]),
  );

const open = () => render(<LayoutEditor W={W} H={H} />);
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const mode = (m: "Grid" | "Freeform") => fireEvent.click(screen.getByRole("radio", { name: new RegExp(m) }));
const bbox = (poly: [number, number][]) => {
  const pts = toPts(poly);
  return [Math.min(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.y))];
};

/** A pointer gesture: down on an element, move and up on the window. */
function drag(el: Element, from: [number, number], to: [number, number]) {
  const ev = (type: string, [x, y]: [number, number]) => {
    const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(e, "pointerId", { value: 1 });
    return e;
  };
  act(() => {
    el.dispatchEvent(ev("pointerdown", from));
  });
  act(() => {
    window.dispatchEvent(ev("pointermove", [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]));
    window.dispatchEvent(ev("pointermove", to));
  });
  act(() => {
    window.dispatchEvent(ev("pointerup", to));
  });
}

describe("one Layout screen: the Grid | Freeform switch", () => {
  it("opens in the board's mode", () => {
    open();
    expect(screen.getByRole("radio", { name: /Grid/ })).toHaveAttribute("aria-checked", "true");
    cleanup();
    s().applyLayout(buildFreeLayout(templateSeats(X), "X"));
    open();
    expect(screen.getByRole("radio", { name: /Freeform/ })).toHaveAttribute("aria-checked", "true");
  });

  it("Grid -> Freeform keeps every tile where it was, and every player", () => {
    s().applyLayout(defaultLayoutFor(3));
    mark();
    const before = people();
    const grid = s().game.layout;
    open();
    mode("Freeform");
    click("done");
    const l = s().game.layout;
    expect(l.cells).toHaveLength(3);
    for (const c of l.cells!) {
      const p = grid.placements.find((q) => q.playerId === c.playerId)!;
      const want = [(p.col - 1) / grid.cols, (p.row - 1) / grid.rows, (p.col - 1 + p.colSpan) / grid.cols, (p.row - 1 + p.rowSpan) / grid.rows];
      bbox(c.poly).forEach((v, k) => expect(v).toBeCloseTo(want[k], 3));
      expect(c.rotation).toBe(p.rotation);
    }
    expect(people()).toEqual(before);
    expect(s().game.players.find((p) => p.id === "p0")!.commanderDamage).toEqual({ p1: 7 });
    expect(useLayoutEdit.getState().editing).toBe(false);
  });

  it("Freeform -> Grid gives the standard grid and keeps every player", () => {
    s().applyLayout(buildFreeLayout(templateSeats(X), "X"));
    mark();
    const before = people();
    open();
    mode("Grid");
    click("done");
    expect(s().game.layout).toEqual(defaultLayoutFor(4));
    expect(people()).toEqual(before);
    expect(s().game.players.map((p) => p.id)).toEqual(["p0", "p1", "p2", "p3"]);
  });

  it("straight back to Freeform puts back the freeform board it replaced", () => {
    const x = buildFreeLayout(templateSeats(X), "X");
    s().applyLayout(x);
    const live = s().game.layout;
    open();
    mode("Grid");
    mode("Freeform");
    click("done");
    // Nothing changed in the end, so the game was left alone.
    expect(s().game.layout).toBe(live);
    expect(s().game.layout.cells!.map((c) => c.poly)).toEqual(x.cells!.map((c) => c.poly));
  });

  it("Undo steps back through the switch; Cancel leaves the game alone", () => {
    const was = s().game.layout;
    const { container } = open();
    mode("Freeform");
    expect(container.querySelectorAll(".fe-cell")).toHaveLength(4);
    click("undo");
    expect(screen.getByRole("radio", { name: /Grid/ })).toHaveAttribute("aria-checked", "true");
    expect(container.querySelectorAll(".ge-tile")).toHaveLength(4);
    mode("Freeform");
    click("cancel");
    expect(s().game.layout).toBe(was);
    expect(useLayoutEdit.getState().editing).toBe(false);
  });
});

describe("Grid mode", () => {
  it("dropping a tile on another swaps the two seats", () => {
    mark();
    const before = people();
    const { container } = open();
    const tile = (pid: string) => container.querySelector(`.ge-tile[data-pid="${pid}"]`)!;
    // 2x2 at 375x700: p0 top left, p3 bottom right.
    drag(tile("p0"), [90, 170], [280, 520]);
    click("done");
    const at = (pid: string) => s().game.layout.placements.find((p) => p.playerId === pid)!;
    expect(at("p0")).toMatchObject({ row: 2, col: 2 });
    expect(at("p3")).toMatchObject({ row: 1, col: 1 });
    expect(s().game.layout.cells).toBeUndefined();
    expect(people()).toEqual(before);
  });

  it("dropping a tile back on itself changes nothing", () => {
    const was = s().game.layout;
    const { container } = open();
    drag(container.querySelector('.ge-tile[data-pid="p1"]')!, [280, 170], [300, 200]);
    click("done");
    expect(s().game.layout).toBe(was);
  });

  it("⟳ turns a tile to face the next side", () => {
    open();
    click("turn P1 to face the next side");
    click("done");
    expect(s().game.layout.placements[0].rotation).toBe(180);
  });

  it("Players − N + moves to the standard grid for the new count", () => {
    open();
    click("add player");
    expect(screen.getByLabelText("player count")).toHaveTextContent("5");
    click("done");
    expect(s().game.layout).toEqual(defaultLayoutFor(5));
    expect(s().game.players).toHaveLength(5);
  });

  it("the strip shows grids for this many players, and applies one", () => {
    open();
    expect(screen.getByRole("button", { name: "template Standard" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "template X" })).toBeNull();
    click("template Ends");
    click("done");
    expect(s().game.layout.rows).toBe(3);
    expect(s().game.players).toHaveLength(4);
  });

  it("Save adds the grid to your layouts, once", () => {
    open();
    click("template Ends");
    click("save as template");
    click("save as template");
    expect(s().customLayouts).toHaveLength(1);
    expect(s().customLayouts[0].cells).toBeUndefined();
    expect(screen.getByRole("button", { name: `template ${s().customLayouts[0].name}` })).toBeInTheDocument();
  });
});

describe("Freeform mode", () => {
  it("the strip shows freeform templates, and Save keeps one", () => {
    open();
    mode("Freeform");
    expect(screen.getByRole("button", { name: "template X" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "template Standard" })).toBeNull();
    click("template X");
    click("save as template");
    // X is built in: nothing new saved.
    expect(s().freeTemplates).toHaveLength(0);
    click("done");
    expect(s().game.layout.cells).toHaveLength(4);
  });

  it("Done no longer saves a template on its own", () => {
    open();
    mode("Freeform");
    click("add player");
    click("done");
    expect(s().game.players).toHaveLength(5);
    expect(s().freeTemplates).toHaveLength(0);
  });
});

describe("saves from older builds", () => {
  it("painted grids and freeform templates still load and appear in their mode", async () => {
    const painted = {
      ...defaultLayoutFor(4),
      id: "custom-a",
      name: "Mine",
      builtIn: false,
      rows: 4,
      cols: 1,
      placements: [0, 1, 2, 3].map((i) => ({ playerId: `p${i}`, row: i + 1, col: 1, rowSpan: 1, colSpan: 1, rotation: 0 as const })),
    };
    const blob = {
      state: {
        game: { ...s().game },
        settings: {},
        customLayouts: [painted, { ...defaultLayoutFor(3), id: "custom-b", name: "Three", builtIn: false }],
        freeTemplates: [{ id: "ft-1", name: "4P · #1", seats: X.seats }],
        profiles: [],
        setups: [],
      },
      version: 2,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
    await useStore.persist.rehydrate();
    open();
    click("template Mine");
    click("done");
    expect(s().game.layout.rows).toBe(4);
    expect(s().game.layout.cols).toBe(1);
    cleanup();
    useLayoutEdit.getState().start();
    open();
    // Another count's saved grid is there too, after this count's.
    expect(screen.getByRole("button", { name: "template Three" })).toBeInTheDocument();
    mode("Freeform");
    expect(screen.getByRole("button", { name: "template 4P · #1" })).toBeInTheDocument();
  });
});
