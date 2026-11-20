import { describe, expect, it } from "vitest";
import { lifeStep, tenLabelAt, tenLine } from "./PlayerTile";

const EM = 35.2; // the glyph's font size on every tile (its 2.2rem floor)

/** A + / − zone `w` x `h` px at the page's top-left, holding its glyph. */
function zone(w: number, h: number): HTMLElement {
  const btn = document.createElement("button");
  const sign = document.createElement("span");
  sign.className = "tile__sign";
  sign.style.fontSize = `${EM}px`;
  btn.appendChild(sign);
  document.body.appendChild(btn);
  Object.defineProperty(btn, "offsetHeight", { value: h });
  btn.getBoundingClientRect = () => ({ left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0, toJSON: () => ({}) });
  return btn;
}

/** The step a press `up` px above the zone's centre gives, the seat reading it at `rot`. */
function stepAt(btn: HTMLElement, up: number, rot = 0): number {
  const r = btn.getBoundingClientRect();
  const cx = r.width / 2;
  const cy = r.height / 2;
  // "Up" for the seat is screen-up turned by its rotation.
  const a = (rot * Math.PI) / 180;
  return lifeStep({ currentTarget: btn, clientX: cx + up * Math.sin(a), clientY: cy - up * Math.cos(a) }, rot);
}

describe("+ / − zones: ±1 on the glyph and a ring round it, ±10 beyond", () => {
  it("a phone grid tile's zone (127 x 142): glyph and buffer ±1, the band past it ±10", () => {
    const btn = zone(127, 142);
    expect(stepAt(btn, 0)).toBe(1); // the glyph's centre
    expect(stepAt(btn, 10)).toBe(1); // its ink's top edge
    expect(stepAt(btn, 25)).toBe(1); // in the ring round it (was ±10 at 0.3em)
    expect(stepAt(btn, 35)).toBe(10); // past the ring
    expect(stepAt(btn, 65)).toBe(10); // the zone's far end
    expect(stepAt(btn, -60)).toBe(1); // the other side of the glyph
  });

  it("follows the seat's rotation", () => {
    const btn = zone(142, 127);
    for (const rot of [90, 180, 270]) {
      expect(stepAt(btn, 25, rot)).toBe(1);
      expect(stepAt(btn, 35, rot)).toBe(10);
    }
  });

  it("the ring is about the glyph's size again (0.8em), at least a 44px target", () => {
    expect(tenLine(EM, 71)).toBeCloseTo(0.8 * EM, 6);
    expect(tenLine(20, 200)).toBe(22);
  });

  it("a short zone keeps room for the 10 and gives up ring, never the glyph's own ink", () => {
    const b = tenLine(EM, 37);
    expect(b).toBeLessThan(0.8 * EM);
    expect(b).toBeGreaterThanOrEqual(0.42 * EM);
    // The ink reaches 0.27em up: a press on it is ±1 however short the zone.
    expect(stepAt(zone(50, 74), 0.27 * EM)).toBe(1);
  });

  it("the 10 label sits wholly inside the ±10 band", () => {
    for (const half of [37, 49.5, 71, 101, 150]) {
      const foot = tenLabelAt(EM, half);
      expect(foot).toBeGreaterThan(tenLine(EM, half));
      // 0.45em tall: it fits the zone wherever the band keeps its room.
      if (half - 0.8 * EM >= 0.42 * EM) expect(foot + 0.45 * EM).toBeLessThanOrEqual(half);
    }
  });
});
