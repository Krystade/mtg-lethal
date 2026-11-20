import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { snapAngle, usePillGesture } from "./usePillGesture";
import { cleanTimerPos } from "../state/sanitize";

describe("turn timer pinch", () => {
  it("snaps near-square turns to square, leaves others", () => {
    expect(snapAngle(7)).toBe(0);
    expect(snapAngle(-8)).toBe(0);
    expect(snapAngle(95)).toBe(90);
    expect(snapAngle(355)).toBe(0);
    expect(snapAngle(45)).toBe(45);
  });
  it("keeps a spot dragged past a freeform face (outside 0-100%)", () => {
    expect(cleanTimerPos({ x: -60, y: 140 })).toEqual({ x: -60, y: 140 });
    expect(cleanTimerPos({ x: -9999, y: 9999 })).toEqual({ x: -300, y: 400 });
  });
  it("cleans saved size and turn", () => {
    expect(cleanTimerPos({ x: 50, y: 50, scale: 99, angle: -90 })).toEqual({ x: 50, y: 50, scale: 3, angle: 270 });
    expect(cleanTimerPos({ x: 50, y: 50 })).toEqual({ x: 50, y: 50 });
    expect(cleanTimerPos({ x: "a", y: 1 })).toBeUndefined();
  });
});

describe("turn timer drag", () => {
  const box = document.createElement("div");
  Object.defineProperty(box, "offsetWidth", { value: 100 });
  Object.defineProperty(box, "offsetHeight", { value: 100 });
  const fire = (type: string, x: number, y: number) => {
    const ev = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
    Object.defineProperty(ev, "pointerId", { value: 1 });
    window.dispatchEvent(ev);
  };
  const drag = (fit?: Parameters<typeof usePillGesture>[0]["fit"]) => {
    const onCommit = vi.fn();
    const { result, unmount } = renderHook(() =>
      usePillGesture({ pos: { x: 50, y: 50 }, rotation: 0, pinned: false, box: () => box, onTap: () => {}, onCommit, fit }),
    );
    act(() => {
      result.current.onPointerDown({
        pointerId: 1,
        clientX: 0,
        clientY: 0,
        stopPropagation: () => {},
        preventDefault: () => {},
      } as unknown as Parameters<typeof result.current.onPointerDown>[0]);
    });
    act(() => fire("pointermove", 120, -80));
    act(() => fire("pointerup", 120, -80));
    unmount();
    return onCommit.mock.calls[0]?.[0];
  };

  it("a grid tile keeps it 4-96% inside the box", () => {
    expect(drag()).toMatchObject({ x: 96, y: 4 });
  });

  it("a freeform cell lets fit decide, past the face box", () => {
    // fit as a cell reaching 70% past the face on the right and 20% above it.
    const fit = vi.fn((p: { x: number; y: number }) => ({ x: Math.min(p.x, 170), y: Math.max(p.y, -20) }));
    expect(drag(fit)).toMatchObject({ x: 170, y: -20 });
    expect(fit).toHaveBeenCalled();
  });
});
