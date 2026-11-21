import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { numberHole, type ResolvedLook } from "../layout/looks";
import type { Rotation } from "../state/types";

/**
 * The frame a directional look's layers live in: the tile, turned to face its
 * owner. Everything else in .tile__look is a background with no up or down
 * and stays unrotated on purpose; Hearts rise, and must rise AWAY from the
 * person sitting at that seat, whichever edge of the table that is.
 *
 * Sized the way the tile's content box is: a quarter turn swaps width and
 * height, measured off the tile itself (it is a size container). The frame is
 * a size container in turn, so the layers inside can travel in units of their
 * own frame's height whatever the seat.
 */
export function directionalFrame(rotation: Rotation): CSSProperties {
  const quarter = rotation === 90 || rotation === 270;
  return {
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    width: quarter ? "100cqh" : "100%",
    height: quarter ? "100cqw" : "100%",
  };
}

/**
 * Keeps a numberHole style's mask hole over the tile's life total: measures
 * the number's laid-out text (screen space, so the seat's rotation and a
 * freeform face's offset are already in it) against the layer, and writes the
 * hole as --hole-x/-y/-rx/-ry. Re-measured when the tile or the number's box
 * resizes and whenever the number's text changes (40 to 100 widens it). A
 * preview has no life total and keeps the CSS fallback hole.
 */
function useNumberHole(ref: { current: HTMLElement | null }, on: boolean) {
  useLayoutEffect(() => {
    const layer = ref.current;
    const life = layer?.parentElement?.querySelector<HTMLElement>(".tile__life");
    if (!on || !layer || !life || typeof document.createRange !== "function") return;
    const place = () => {
      const range = document.createRange();
      range.selectNodeContents(life);
      const text = range.getBoundingClientRect?.();
      if (!text || text.width === 0) return;
      // A tenth of the figure height covers the text's shadow and the low-life glow.
      const h = numberHole(layer.getBoundingClientRect(), text, Math.max(8, text.height * 0.1));
      layer.style.setProperty("--hole-x", `${h.x.toFixed(1)}px`);
      layer.style.setProperty("--hole-y", `${h.y.toFixed(1)}px`);
      layer.style.setProperty("--hole-rx", `${h.rx.toFixed(1)}px`);
      layer.style.setProperty("--hole-ry", `${h.ry.toFixed(1)}px`);
    };
    place();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    ro?.observe(layer);
    ro?.observe(life);
    const mo = typeof MutationObserver === "function" ? new MutationObserver(place) : null;
    mo?.observe(life, { childList: true, characterData: true, subtree: true });
    return () => {
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [ref, on]);
}

/**
 * A look's decorative layers, shared by the tiles and every preview so a
 * swatch is the genuine style. Renders nothing for a style with no layers.
 */
export function LookLayers({
  look,
  rotation = 0,
  as: Tag = "span",
}: {
  look: ResolvedLook;
  rotation?: Rotation;
  /** A tile takes a div; a preview inside a button needs phrasing content. */
  as?: "div" | "span";
}) {
  const ref = useRef<HTMLElement | null>(null);
  useNumberHole(ref, look.numberHole && look.layers > 0);
  if (look.layers === 0) return null;
  const spans = Array.from({ length: look.layers }, (_, i) => <span key={i} />);
  return (
    <Tag className="tile__look" aria-hidden ref={(el: HTMLElement | null) => {
        ref.current = el;
      }}
    >
      {look.directional ? (
        <span className="tile__look-dir" style={directionalFrame(rotation)}>
          {spans}
        </span>
      ) : (
        spans
      )}
    </Tag>
  );
}
