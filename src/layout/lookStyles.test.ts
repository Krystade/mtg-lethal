import { describe, expect, it } from "vitest";
// Vitest hands CSS imports back empty, even with ?raw, and this project has
// no Node types for tsc, so styles.css is read through a Node import whose
// name tsc does not try to resolve.
const fsName = "node:fs" as string;
const nodeFs: { readFileSync(path: string, encoding: string): string } = await import(/* @vite-ignore */ fsName);
const cwd = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
const css = nodeFs.readFileSync(`${cwd}/src/styles.css`, "utf8");
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
  TARTAN_SETT,
  sparkleDataUri,
  stoneFor,
  tartanCrossing,
  tartanDataUri,
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

describe("tartan", () => {
  it("weaves a crossing of two colours as their opaque OKLab midpoint", () => {
    const l = resolveLook("blue-tartan", "#000");
    const lo = l.vars["--look-lo"];
    const hi = l.vars["--look-hi"];
    const c = tartanCrossing(lo, hi, l.base);
    expect(c).toBe(mixOklab(lo, hi, 0.5));
    expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("leaves a thread crossing its own colour pure", () => {
    expect(tartanCrossing("#123456", "#123456", "#123456")).toBe("#123456");
  });

  it("paints every cell of one repeat, and every colour it uses is in paintedColours", () => {
    const l = resolveLook("red-tartan", "#000");
    const plaid = tartanDataUri(l.base, l.vars["--look-lo"], l.vars["--look-hi"]);
    const svg = svgOf(plaid.uri);
    expect(svg.match(/<rect /g)).toHaveLength(TARTAN_SETT.length ** 2);
    expect(plaid.size).toBe(TARTAN_SETT.reduce((n, [, w]) => n + w, 0));
    expect(l.vars["--look-sett"]).toBe(`${plaid.size}px`);
    // No alpha anywhere: a translucent crossing is what goes to mud.
    expect(svg).not.toMatch(/opacity/);
    for (const fill of svg.match(/fill='(#[0-9a-f]{6})'/g) ?? []) {
      expect(l.paintedColours).toContain(fill.slice(6, 13));
    }
    // Base, shadow, highlight, and the three crossings between them.
    expect(new Set(plaid.colours).size).toBe(6);
  });

  it("is static: a cloth needs no layers", () => {
    const l = resolveLook("red-tartan", "#000");
    expect(l.animated).toBe(false);
    expect(l.layers).toBe(0);
  });
});

describe("glitch timing", () => {
  // Photosensitivity rests on numbers that live in styles.css, so they are
  // read back out of it rather than restated here, where they could drift.
  const strips = [1, 2, 3].map((n) => {
    const period = Number(css.match(new RegExp(`lkGlitch${n} calc\\(([\\d.]+)s`))?.[1]);
    const body = css.match(new RegExp(`@keyframes lkGlitch${n} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
    const stops = [...body.matchAll(/([\d.]+)%(?:, 100%)? \{ opacity: (\d)/g)].map((m) => ({
      at: Number(m[1]) / 100,
      on: m[2] === "1",
    }));
    const on = stops.find((s) => s.on)!.at;
    const off = stops.find((s) => !s.on && s.at > on)!.at;
    return { period, start: on * period, end: off * period };
  });

  it("finds three strips on mismatched 5s, 7s and 11s cycles", () => {
    expect(strips.map((s) => s.period)).toEqual([5, 7, 11]);
  });

  it("idles each strip about 90% of its cycle or more", () => {
    for (const s of strips) expect((s.end - s.start) / s.period).toBeLessThan(0.1);
  });

  it("makes at most two jumps a second on any strip", () => {
    // A tear is one jump out and one back; the next tear is a whole cycle on.
    for (const s of strips) {
      expect(s.end - s.start).toBeGreaterThan(0.25);
      expect(s.period - (s.end - s.start)).toBeGreaterThan(1);
    }
  });

  it("never lets two strips tear at once, however the cycles drift", () => {
    // Coprime periods meet at every whole-second offset, so what matters is
    // each pair's start times modulo one second.
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++) {
        const d = (((strips[j].start - strips[i].start) % 1) + 1) % 1;
        const gap = Math.min(d, 1 - d);
        expect(gap).toBeGreaterThanOrEqual(Math.max(strips[i].end - strips[i].start, strips[j].end - strips[j].start));
      }
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
