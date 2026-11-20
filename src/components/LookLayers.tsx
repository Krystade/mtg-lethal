import type { CSSProperties } from "react";
import type { ResolvedLook } from "../layout/looks";
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
  if (look.layers === 0) return null;
  const spans = Array.from({ length: look.layers }, (_, i) => <span key={i} />);
  return (
    <Tag className="tile__look" aria-hidden>
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
