import { describe, expect, it } from "vitest";
import {
  glitterInks,
  grainDataUri,
  reachToward,
  resolveLook,
  sparkleDataUri,
} from "./looks";
import { contrastRatio, mixOklab, textOn } from "./colors";

/** The SVG inside a `url("data:image/svg+xml,...")` value. */
const svgOf = (url: string) =>
  decodeURIComponent(url.replace(/^url\("data:image\/svg\+xml,/, "").replace(/"\)$/, ""));

describe("reachToward", () => {
  it("reaches pure white on a dark-ink hue, where lightening only gains contrast", () => {
    const gold = resolveLook("gold-glitter", "#000");
    expect(reachToward(gold.vars["--look-hi"], "#ffffff", gold.base)).toBe("#ffffff");
  });

  it("stops short of white on a white-ink hue, at a colour that still passes", () => {
    const blue = resolveLook("blue-glitter", "#000");
    const got = reachToward(blue.vars["--look-hi"], "#ffffff", blue.base);
    expect(got).not.toBe("#ffffff");
    expect(contrastRatio("#ffffff", got)).toBeGreaterThanOrEqual(3.05);
  });

  it("goes as far as it can, not merely somewhere safe", () => {
    // A step further toward white must fail, or the search gave up early.
    const blue = resolveLook("blue-glitter", "#000");
    const got = reachToward(blue.vars["--look-hi"], "#ffffff", blue.base);
    expect(contrastRatio("#ffffff", mixOklab(got, "#ffffff", 0.04))).toBeLessThan(3.05);
  });
});

describe("glitter", () => {
  it("uses dark specks on gold, where light ones would vanish into the base", () => {
    const l = resolveLook("gold-glitter", "#000");
    const { speck } = glitterInks(l.base, l.vars["--look-lo"], l.vars["--look-hi"]);
    expect(speck).toBe(l.vars["--look-lo"]);
  });

  it("keeps the base as the ground on a dark-ink hue", () => {
    const l = resolveLook("gold-glitter", "#000");
    expect(glitterInks(l.base, l.vars["--look-lo"], l.vars["--look-hi"]).ground).toBe(l.base);
  });

  it.each(["blue", "green", "magenta", "red", "purple"])(
    "deepens the ground on %s, so a glint it can afford still stands out",
    (hue) => {
      const l = resolveLook(`${hue}-glitter`, "#000");
      const { ground, glint } = glitterInks(l.base, l.vars["--look-lo"], l.vars["--look-hi"]);
      // Darker than the base: more contrast for the white number, never less.
      expect(contrastRatio("#ffffff", ground)).toBeGreaterThan(contrastRatio("#ffffff", l.base));
      // And the glint now clearly outshines its ground, where on the bare
      // base it barely did.
      expect(contrastRatio(glint, ground)).toBeGreaterThan(1.4);
    },
  );

  it("discriminates — on bare blue the glint all but vanishes", () => {
    const l = resolveLook("blue-glitter", "#000");
    const { glint } = glitterInks(l.base, l.vars["--look-lo"], l.vars["--look-hi"]);
    expect(contrastRatio(glint, l.base)).toBeLessThan(1.15);
  });

  it("uses light specks on a deepened green", () => {
    const l = resolveLook("green-glitter", "#000");
    const { speck, glint } = glitterInks(l.base, l.vars["--look-lo"], l.vars["--look-hi"]);
    expect(speck).toBe(glint);
  });

  it("paints its speck and glint, so the contrast sweep sees them", () => {
    const l = resolveLook("gold-glitter", "#000");
    const { speck, glint } = glitterInks(l.base, l.vars["--look-lo"], l.vars["--look-hi"]);
    expect(l.paintedColours).toEqual(expect.arrayContaining([speck, glint]));
    // And the glint really is new paint: white is in no other gold style.
    expect(resolveLook("gold-lava", "#000").paintedColours).not.toContain(glint);
  });

  it("supplies the grain and both sparkle tiles", () => {
    const l = resolveLook("purple-glitter", "#000");
    for (const v of ["--look-grain", "--look-spark-a", "--look-spark-b"]) {
      expect(l.vars[v]).toMatch(/^url\("data:image\/svg\+xml,/);
    }
  });

  it("thresholds the grain hard and paints it in sRGB", () => {
    const svg = svgOf(grainDataUri("#123456", 0.62, 7));
    expect(svg).toContain("color-interpolation-filters='sRGB'");
    expect(svg).toContain("stitchTiles='stitch'");
    // alpha = 30 * noise - 30 * cut: transparent below the cut, solid just above.
    expect(svg).toMatch(/ 30 0 0 0 -18\.60'/);
    // The speck colour arrives as the matrix constants.
    expect(svg).toContain("0 0 0 0 0.071 0 0 0 0 0.204 0 0 0 0 0.337");
  });

  it("builds sparkle tiles at the asked size with the asked dots and stars", () => {
    const svg = svgOf(sparkleDataUri(97, 3, 11, 3, "#111111", "#eeeeee"));
    expect(svg).toContain("width='97' height='97'");
    expect(svg.match(/<circle /g)).toHaveLength(11);
    expect(svg.match(/<path /g)).toHaveLength(3);
    // Stars are always glints; dots are 1 or 2px across.
    expect(svg.match(/<path [^>]*fill='#eeeeee'/g)).toHaveLength(3);
    for (const r of svg.match(/r='[\d.]+'/g) ?? []) {
      expect(["r='0.5'", "r='1'"]).toContain(r);
    }
  });

  it("keeps every sparkle inside its tile so the repeat has no cut-off halves", () => {
    const svg = svgOf(sparkleDataUri(131, 8, 40, 6, "#111111", "#eeeeee"));
    const nums = [...svg.matchAll(/c[xy]='([\d.]+)'/g)].map((m) => Number(m[1]));
    for (const n of nums) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(130);
    }
    const pts = [...svg.matchAll(/d='([^']+)'/g)]
      .flatMap((m) => m[1].match(/-?[\d.]+/g) ?? [])
      .map(Number);
    for (const n of pts) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(131);
    }
  });

  it("bakes the same sparkles every time, so a re-render cannot reshuffle them", () => {
    expect(sparkleDataUri(97, 3, 11, 3, "#111111", "#eeeeee")).toBe(
      sparkleDataUri(97, 3, 11, 3, "#111111", "#eeeeee"),
    );
    expect(sparkleDataUri(97, 3, 11, 3, "#111111", "#eeeeee")).not.toBe(
      sparkleDataUri(97, 4, 11, 3, "#111111", "#eeeeee"),
    );
  });

  it("keeps the glint legible on a white-ink hue it could not make white", () => {
    const l = resolveLook("blue-glitter", "#000");
    const { glint } = glitterInks(l.base, l.vars["--look-lo"], l.vars["--look-hi"]);
    expect(contrastRatio(textOn(l.base), glint)).toBeGreaterThanOrEqual(3);
  });
});
