import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LayoutPicker } from "./LayoutPicker";
import { FreeformEditor } from "./FreeformEditor";
import { useStore } from "../state/store";
import { colorForSeat } from "../layout/colors";
import { buildFreeLayout, seatsFromLayout } from "../layout/freeform";
import { playerColour } from "../layout/looks";
import { defaultLayoutFor } from "../layout/presets";

afterEach(cleanup);

/** jsdom normalises a hex background to rgb(); compare in that form. */
function rgb(hex: string): string {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `rgb(${n(1)}, ${n(3)}, ${n(5)})`;
}

const GREEN = colorForSeat(4);
const CUSTOM = "#123456";

beforeEach(() => {
  useStore.getState().newGame({ playerCount: 4, startingLife: 40 });
  // p0 takes another seat's hue, p1 a custom colour with an animated style.
  useStore.getState().setPlayerLook("p0", "green");
  useStore.getState().setPlayerLook("p1", `${CUSTOM}-lava`);
});

describe("Customize grid painter", () => {
  it("paints each seat in the colour its player shows after a recolour", () => {
    const { container } = render(<LayoutPicker onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Customize" }));

    const palettes = container.querySelectorAll(".palette");
    const paint = [...palettes[0].querySelectorAll<HTMLElement>(".palette__swatch:not(.palette__erase)")];
    expect(paint.map((b) => b.style.background)).toEqual([
      rgb(GREEN),
      rgb(CUSTOM),
      rgb(colorForSeat(2)),
      rgb(colorForSeat(3)),
      // Nobody sits in seats 5 and 6: they show what a new player there gets,
      // the first presets nobody shows -- gold (p0 left it), then blue (p1
      // left it). Not green: p0 shows that.
      rgb(colorForSeat(0)),
      rgb(colorForSeat(1)),
    ]);

    const facing = [...palettes[1].querySelectorAll<HTMLElement>(".palette__swatch")];
    expect(facing.map((b) => b.style.background)).toEqual([
      rgb(GREEN),
      rgb(CUSTOM),
      rgb(colorForSeat(2)),
      rgb(colorForSeat(3)),
    ]);

    // The 4-player preset is a 2x2 grid in seat order.
    const cells = [...container.querySelectorAll<HTMLElement>(".editor__cell")];
    const shown = new Set(cells.map((c) => c.style.background));
    expect(shown.has(rgb(GREEN))).toBe(true);
    expect(shown.has(rgb(CUSTOM))).toBe(true);
    // Seat 1's default blue is nowhere: p1 recoloured away from it.
    expect(shown.has(rgb(colorForSeat(1)))).toBe(false);
  });
});

describe("new players on a grid board", () => {
  // In use after beforeEach: green (p0), custom (p1), magenta (p2), red (p3).
  const shownBy = () => useStore.getState().game.players.map(playerColour);

  it("Players + gives the new player a colour nobody shows", () => {
    render(<LayoutPicker onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "add player" }));
    const players = useStore.getState().game.players;
    expect(players).toHaveLength(5);
    expect(useStore.getState().game.layout.cells).toBeUndefined();
    expect(playerColour(players[4])).not.toBe(GREEN);
    expect(playerColour(players[4])).toBe(colorForSeat(0));
  });

  it("a preset with two more seats gives two distinct unused colours", () => {
    render(<LayoutPicker onClose={() => {}} />);
    fireEvent.click(screen.getByText("6 players").closest("button")!);
    const shown = shownBy();
    expect(shown).toHaveLength(6);
    expect(new Set(shown).size).toBe(6);
    expect(shown.slice(4)).toEqual([colorForSeat(0), colorForSeat(1)]);
  });

  it("shrinking then growing reuses only colours nobody kept", () => {
    const s = useStore.getState();
    s.applyLayout(defaultLayoutFor(3));
    s.applyLayout(defaultLayoutFor(5));
    const shown = shownBy();
    expect(new Set(shown).size).toBe(5);
    expect(shown.slice(0, 3)).toEqual([GREEN, CUSTOM, colorForSeat(2)]);
  });

  it("Customize Apply creates the new seat in the colour its swatch showed", () => {
    const { container } = render(<LayoutPicker onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Customize" }));
    // 2x2 -> 3 rows, then paint the empty bottom row as seat 5.
    const rowsPlus = container.querySelectorAll(".editor__row .stepper")[0].querySelectorAll("button")[1];
    fireEvent.click(rowsPlus);
    const swatch = container.querySelectorAll<HTMLElement>(".palette")[0].querySelectorAll<HTMLElement>(
      ".palette__swatch:not(.palette__erase)",
    )[4];
    const promised = swatch.style.background;
    fireEvent.click(swatch);
    const cells = [...container.querySelectorAll<HTMLElement>(".editor__cell")];
    fireEvent.click(cells[4]);
    fireEvent.click(cells[5]);
    expect(cells[4].style.background).toBe(promised);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    const players = useStore.getState().game.players;
    expect(players).toHaveLength(5);
    expect(rgb(playerColour(players[4]))).toBe(promised);
    expect(playerColour(players[4])).not.toBe(GREEN);
  });
});

describe("Edit layout (freeform)", () => {
  it("paints a recoloured player in the colour their tile shows", () => {
    const { container } = render(<FreeformEditor W={375} H={700} />);
    const cell = (pid: string) =>
      container.querySelector<HTMLElement>(`.fe-cell[data-pid="${pid}"]`)!;
    expect(cell("p0").style.background).toBe(rgb(GREEN));
    expect(cell("p1").style.background).toBe(rgb(CUSTOM));
    expect(cell("p2").style.background).toBe(rgb(colorForSeat(2)));
  });

  it("gives a new seat a colour no player is showing", () => {
    const { container } = render(<FreeformEditor W={375} H={700} />);
    fireEvent.click(screen.getByRole("button", { name: "add player" }));
    const fresh = container.querySelector<HTMLElement>('.fe-cell[data-pid^="new"]')!;
    // In use: green (p0), custom (p1), magenta (p2), red (p3). Gold, seat 0's
    // default, is free now that p0 left it -- and green is not.
    expect(fresh.style.background).toBe(rgb(colorForSeat(0)));
  });
});

describe("applyFreeform", () => {
  it("creates a new seat's player in a colour no kept player is showing", () => {
    const s = useStore.getState();
    const seats = seatsFromLayout(s.game.layout);
    // Same shapes, one more seat id: the store only checks every id is placed.
    const grown = [...seats, { ...seats[3], playerId: "new" }];
    s.applyFreeform(buildFreeLayout(grown.map((t, i) => ({ ...t, playerId: `p${i}` })), "Freeform"), [
      "p0",
      "p1",
      "p2",
      "p3",
      null,
    ]);
    const players = useStore.getState().game.players;
    expect(players).toHaveLength(5);
    expect(players[4].color).toBe(colorForSeat(0));
  });
});
