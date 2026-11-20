import type { CSSProperties } from "react";
import { textOn } from "../layout/colors";
import type { ResolvedLook } from "../layout/looks";
import { LookLayers } from "./LookLayers";

/**
 * Renders a look using the very same CSS the tiles use, so a swatch is the
 * genuine style rather than an imitation of it that can drift out of sync.
 */
export function LookPreview({
  look,
  className,
  children,
}: {
  look: ResolvedLook;
  className: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      className={`look ${className}`}
      data-style={look.styleId}
      // Ink is resolved the same way the tile resolves it, so a preview cannot
      // show white-on-gold while the real tile renders black.
      style={{ color: textOn(look.base), ...look.vars } as CSSProperties}
    >
      <LookLayers look={look} />
      {children}
    </span>
  );
}
