import { describe, expect, it } from "vitest";
import {
  HEART_ALPHA,
  accentFor,
  crackNetwork,
  fissureDataUris,
  glitterInks,
  grainDataUri,
  heartDataUri,
  heartInk,
  reachToward,
  resolveLook,
  sparkleDataUri,
  stoneFor,
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

describe("hearts", () => {
  it("is the one directional style so far, and draws seven hearts", () => {
    const l = resolveLook("red-hearts", "#000");
    expect(l.directional).toBe(true);
    expect(l.layers).toBe(7);
    expect(resolveLook("red-glitter", "#000").directional).toBe(false);
  });

  it("bakes the see-through alpha into the heart, leaving opacity free to fade", () => {
    const svg = svgOf(heartDataUri("#abcdef"));
    expect(svg).toContain("fill='#abcdef'");
    expect(svg).toContain(`fill-opacity='${HEART_ALPHA}'`);
    expect(HEART_ALPHA).toBeGreaterThan(0.3);
    expect(HEART_ALPHA).toBeLessThan(0.5);
  });

  it("paints light hearts where the seat can afford them", () => {
    for (const hue of ["gold", "magenta", "red", "purple"]) {
      const l = resolveLook(`${hue}-hearts`, "#000");
      const heart = heartInk(l.base, l.vars["--look-lo"], l.vars["--look-hi"]);
      expect(heart).not.toBe(l.vars["--look-lo"]);
      expect(l.paintedColours).toContain(heart);
    }
  });

  it("falls back to deep hearts where a light one would vanish", () => {
    for (const hue of ["blue", "green"]) {
      const l = resolveLook(`${hue}-hearts`, "#000");
      expect(heartInk(l.base, l.vars["--look-lo"], l.vars["--look-hi"])).toBe(l.vars["--look-lo"]);
    }
  });

  it("puts the heart colour in the shared heart image", () => {
    const l = resolveLook("gold-hearts", "#000");
    const heart = heartInk(l.base, l.vars["--look-lo"], l.vars["--look-hi"]);
    expect(svgOf(l.vars["--look-heart"])).toContain(`fill='${heart}'`);
  });
});

describe("foil", () => {
  it("shines in the brightest light the seat can afford, and paints it", () => {
    for (const hue of ["gold", "blue", "purple"]) {
      const l = resolveLook(`${hue}-foil`, "#000");
      const sheen = l.vars["--look-sheen"];
      expect(sheen).toBe(reachToward(l.vars["--look-hi"], "#ffffff", l.base));
      expect(l.paintedColours).toContain(sheen);
    }
  });

  it("shines white on gold, where lightening costs the black number nothing", () => {
    expect(resolveLook("gold-foil", "#000").vars["--look-sheen"]).toBe("#ffffff");
  });
});

describe("radiance", () => {
  it("draws its rays three quarters of the way to the seat's accent, and paints them", () => {
    for (const hue of ["gold", "blue", "magenta"]) {
      const l = resolveLook(`${hue}-radiance`, "#000");
      const accent = accentFor(l.base, l.vars["--look-lo"], l.vars["--look-hi"]);
      expect(l.vars["--look-ray"]).toBe(mixOklab(l.base, accent, 0.75));
      expect(l.paintedColours).toContain(l.vars["--look-ray"]);
    }
  });

  it("keeps gold's rays short of full white", () => {
    const ray = resolveLook("gold-radiance", "#000").vars["--look-ray"];
    expect(ray).not.toBe("#ffffff");
    expect(contrastRatio(ray, "#E4B33D")).toBeGreaterThan(1.3);
  });

  it("draws dark rays where light ones would vanish", () => {
    const l = resolveLook("green-radiance", "#000");
    expect(contrastRatio("#ffffff", l.vars["--look-ray"])).toBeGreaterThan(contrastRatio("#ffffff", l.base));
  });
});

describe("fissure", () => {
  it.each(["blue", "red", "green", "magenta", "purple"])(
    "lays %s over dark stone, which only gains the white number contrast",
    (hue) => {
      const l = resolveLook(`${hue}-fissure`, "#000");
      const stone = l.vars["--look-stone"];
      expect(stone).toBe(stoneFor(l.base));
      expect(contrastRatio("#ffffff", stone)).toBeGreaterThan(contrastRatio("#ffffff", l.base) * 1.6);
      expect(l.paintedColours).toContain(stone);
    },
  );

  it("darkens gold only as far as its black number still reads", () => {
    const l = resolveLook("gold-fissure", "#000");
    const stone = l.vars["--look-stone"];
    const ink = textOn(l.base);
    expect(ink).toBe("#0d0d0d");
    // As dark as it can go, and no darker: right at the bar, not short of it.
    expect(contrastRatio(ink, stone)).toBeGreaterThanOrEqual(3.05);
    expect(contrastRatio(ink, stone)).toBeLessThan(3.4);
  });

  it("bakes the glow's blur into its own SVG and leaves the cracks crisp", () => {
    const l = resolveLook("blue-fissure", "#000");
    const glow = svgOf(l.vars["--look-glow"]);
    const cracks = svgOf(l.vars["--look-cracks"]);
    expect(glow).toContain("<feGaussianBlur");
    expect(glow).toContain(`stroke='${l.vars["--look-hi"]}'`);
    expect(cracks).not.toContain("<filter");
    // A shadow rim with a core of the glow colour.
    expect(cracks).toContain(`stroke='${l.vars["--look-lo"]}'`);
    expect(cracks).toContain(`stroke='${l.vars["--look-hi"]}'`);
  });

  it("draws the same network on every call, thinning from trunk to tip", () => {
    const a = crackNetwork(5);
    expect(crackNetwork(5)).toEqual(a);
    expect(crackNetwork(6)).not.toEqual(a);
    expect(a.length).toBeGreaterThan(2);
    for (let i = 1; i < a.length; i++) expect(a[i].w).toBeLessThan(a[i - 1].w);
    expect(a[0].w).toBe(1);
  });

  it("strokes the glow wider than the crack it comes through", () => {
    const { cracks, glow } = fissureDataUris("#111111", "#eeeeee");
    const widest = (svg: string, colour: string) =>
      Math.max(
        ...[...svgOf(svg).matchAll(new RegExp(`stroke='${colour}' stroke-width='([\\d.]+)'`, "g"))].map((m) => Number(m[1])),
      );
    const glowW = Math.max(...[...svgOf(glow).matchAll(/stroke-width='([\d.]+)'/g)].map((m) => Number(m[1])));
    expect(glowW).toBeGreaterThan(widest(cracks, "#111111"));
    expect(widest(cracks, "#111111")).toBeGreaterThan(widest(cracks, "#eeeeee"));
  });
});
