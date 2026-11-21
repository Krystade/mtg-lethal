import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LayoutEditor } from "./LayoutEditor";
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

describe("new players on a grid board", () => {
  // In use after beforeEach: green (p0), custom (p1), magenta (p2), red (p3).
  const shownBy = () => useStore.getState().game.players.map(playerColour);

  it("Players + then Done gives the new player a colour nobody shows, and its tile showed it", () => {
    const { container } = render(<LayoutEditor W={375} H={700} />);
    fireEvent.click(screen.getByRole("button", { name: "add player" }));
    const fresh = container.querySelector<HTMLElement>('.ge-tile[data-pid^="new"]')!;
    expect(fresh.style.background).toBe(rgb(colorForSeat(0)));
    fireEvent.click(screen.getByRole("button", { name: "done" }));
    const players = useStore.getState().game.players;
    expect(players).toHaveLength(5);
    expect(useStore.getState().game.layout.cells).toBeUndefined();
    expect(playerColour(players[4])).not.toBe(GREEN);
    expect(playerColour(players[4])).toBe(colorForSeat(0));
  });

  it("two more seats give two distinct unused colours", () => {
    render(<LayoutEditor W={375} H={700} />);
    fireEvent.click(screen.getByRole("button", { name: "add player" }));
    fireEvent.click(screen.getByRole("button", { name: "add player" }));
    fireEvent.click(screen.getByRole("button", { name: "done" }));
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
});

describe("Layout screen, freeform", () => {
  const freeform = () => {
    const r = render(<LayoutEditor W={375} H={700} />);
    fireEvent.click(screen.getByRole("radio", { name: /Freeform/ }));
    return r;
  };

  it("paints a recoloured player in the colour their tile shows", () => {
    const { container } = freeform();
    const cell = (pid: string) =>
      container.querySelector<HTMLElement>(`.fe-cell[data-pid="${pid}"]`)!;
    expect(cell("p0").style.background).toBe(rgb(GREEN));
    expect(cell("p1").style.background).toBe(rgb(CUSTOM));
    expect(cell("p2").style.background).toBe(rgb(colorForSeat(2)));
  });

  it("gives a new seat a colour no player is showing", () => {
    const { container } = freeform();
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
