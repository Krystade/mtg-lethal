import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { LookLayers, directionalFrame } from "./LookLayers";
import { LOOK_STYLES, lookId, numberHole, resolveLook } from "../layout/looks";
import type { Rotation } from "../state/types";

const look = (id: string) => resolveLook(id, "#3E92CC");

describe("directionalFrame", () => {
  // The frame must turn exactly as the tile's content does, or hearts would
  // rise sideways past the owner instead of away from them.
  it.each([
    [0, "100%", "100%"],
    [90, "100cqh", "100cqw"],
    [180, "100%", "100%"],
    [270, "100cqh", "100cqw"],
  ] as [Rotation, string, string][])(
    "turns %i degrees and sizes the frame %s by %s",
    (rot, w, h) => {
      const f = directionalFrame(rot);
      expect(f.transform).toBe(`translate(-50%, -50%) rotate(${rot}deg)`);
      expect(f.width).toBe(w);
      expect(f.height).toBe(h);
    },
  );
});

describe("LookLayers", () => {
  it("puts Hearts inside a frame turned to the seat", () => {
    const { container } = render(
      <LookLayers look={look("blue-hearts")} rotation={90} as="div" />,
    );
    const frame = container.querySelector(".tile__look > .tile__look-dir") as HTMLElement;
    expect(frame).not.toBeNull();
    // (jsdom drops container-query units, so the swapped size is checked on
    // directionalFrame above rather than here.)
    expect(frame.style.transform).toContain("rotate(90deg)");
    expect(frame.querySelectorAll(":scope > span")).toHaveLength(7);
  });

  it("follows the seat round: an upside-down seat turns its hearts upside down", () => {
    const { container } = render(
      <LookLayers look={look("blue-hearts")} rotation={180} as="div" />,
    );
    const frame = container.querySelector(".tile__look-dir") as HTMLElement;
    expect(frame.style.transform).toContain("rotate(180deg)");
  });

  it("gives no frame to a style without an up and a down", () => {
    for (const s of LOOK_STYLES.filter((x) => !x.directional && x.layers > 0)) {
      const { container } = render(
        <LookLayers look={look(lookId("blue", s.id))} rotation={90} as="div" />,
      );
      expect(container.querySelector(".tile__look-dir")).toBeNull();
      expect(container.querySelectorAll(".tile__look > span")).toHaveLength(s.layers);
    }
  });

  it("renders a tile's container as a div and a preview's as a span", () => {
    const a = render(<LookLayers look={look("blue-lava")} as="div" />);
    expect(a.container.querySelector("div.tile__look")).not.toBeNull();
    const b = render(<LookLayers look={look("blue-lava")} />);
    expect(b.container.querySelector("span.tile__look")).not.toBeNull();
  });

  it("renders nothing for a style with no layers", () => {
    const { container } = render(<LookLayers look={look("blue-fade")} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("LookLayers -- the number hole", () => {
  // jsdom has no layout, so the tile and the number's text are given boxes.
  const rects: { tile: DOMRect; text: DOMRect } = {
    tile: { left: 100, top: 50, width: 200, height: 400 } as DOMRect,
    text: { left: 150, top: 200, width: 100, height: 60 } as DOMRect,
  };
  let spies: { mockRestore(): void }[] = [];
  beforeEach(() => {
    spies = [
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => rects.tile),
      vi.spyOn(document, "createRange").mockImplementation(
        () => ({ selectNodeContents() {}, getBoundingClientRect: () => rects.text }) as unknown as Range,
      ),
    ];
  });
  afterEach(() => spies.forEach((s) => s.mockRestore()));

  const tile = (id: string, withLife = true) =>
    render(
      <div>
        <LookLayers look={look(id)} as="div" />
        {withLife && <div className="tile__life">40</div>}
      </div>,
    ).container.querySelector(".tile__look") as HTMLElement;

  it("centres the hole on the tile's life total and sizes it from numberHole", () => {
    const el = tile("blue-glitter");
    const h = numberHole(rects.tile, rects.text, 8);
    expect(el.style.getPropertyValue("--hole-x")).toBe(`${h.x.toFixed(1)}px`);
    expect(el.style.getPropertyValue("--hole-y")).toBe(`${h.y.toFixed(1)}px`);
    expect(el.style.getPropertyValue("--hole-rx")).toBe(`${h.rx.toFixed(1)}px`);
    expect(el.style.getPropertyValue("--hole-ry")).toBe(`${h.ry.toFixed(1)}px`);
    expect(h.x).toBe(100);
    expect(h.y).toBe(180);
  });

  it("writes no hole for a style without one, nor for a preview with no number", () => {
    expect(tile("blue-lava").style.getPropertyValue("--hole-x")).toBe("");
    expect(tile("blue-glitter", false).style.getPropertyValue("--hole-x")).toBe("");
  });
});
