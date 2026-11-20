import { render, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RandomFirstOverlay } from "./RandomFirstOverlay";
import { useStore } from "../state/store";
import { colorForSeat } from "../layout/colors";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** jsdom normalises a hex background to rgb(); compare in that form. */
function rgb(hex: string): string {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `rgb(${n(1)}, ${n(3)}, ${n(5)})`;
}

describe("RandomFirstOverlay", () => {
  it("paints each seat in the colour its tile shows after a recolour", () => {
    vi.useFakeTimers();
    useStore.getState().newGame({ playerCount: 4, startingLife: 40 });
    // p0 picks a named hue and p1 a custom colour with an animated style; the
    // tile paints each from its look's base, not the seat's default colour.
    useStore.getState().setPlayerLook("p0", "green");
    useStore.getState().setPlayerLook("p1", "#123456-lava");

    const { container } = render(<RandomFirstOverlay onClose={() => {}} />);
    const seat = (id: string) =>
      container.querySelector<HTMLElement>(`[data-player-id="${id}"]`)!;

    expect(seat("p0").style.background).toBe(rgb(colorForSeat(4)));
    expect(seat("p1").style.background).toBe(rgb("#123456"));
    // Untouched seats keep their default colour.
    expect(seat("p2").style.background).toBe(rgb(colorForSeat(2)));
    // Ink follows the new colour: green takes white, so does dark navy.
    expect(seat("p1").style.color).toBe(rgb("#ffffff"));
  });

  it("follows a light custom colour with dark ink", () => {
    vi.useFakeTimers();
    useStore.getState().newGame({ playerCount: 2, startingLife: 40 });
    useStore.getState().setPlayerLook("p0", "#f0f0a0");
    const { container } = render(<RandomFirstOverlay onClose={() => {}} />);
    const p0 = container.querySelector<HTMLElement>('[data-player-id="p0"]')!;
    expect(p0.style.background).toBe(rgb("#f0f0a0"));
    expect(p0.style.color).toBe(rgb("#0d0d0d"));
  });
});
