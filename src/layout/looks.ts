import {
  PLAYER_COLORS,
  contrastRatio,
  hueDirection,
  mix,
  mixOklab,
  rotateHue,
  shift,
  textOn,
} from "./colors";

/**
 * A tile look is a hue crossed with a style.
 *
 * Everything is pure CSS — no images — so looks cost nothing to store, work
 * offline, and render at any tile rotation. Styles are one rule set each,
 * driven by custom properties, so six hues do not mean six copies.
 *
 * The rule that keeps the life total readable: contrast is decided from the
 * hue's flat `base`, never from rendered pixels, and every colour a style
 * paints stays close enough to that base for the choice to hold. looks.test.ts
 * asserts this across the whole catalogue.
 */

export interface Hue {
  id: string;
  name: string;
  base: string;
}

export interface LookStyle {
  id: string;
  name: string;
  animated: boolean;
  /** How many decorative layers the tile renders for this style. */
  layers: number;
  /**
   * The layers have an up and a down, so they turn with the seat. Only these
   * styles pay for the extra rotated container; everything else is a
   * background with no orientation.
   */
  directional?: boolean;
  /**
   * The layers carry a hole over the life total (see numberHole): LookLayers
   * measures the number and the style's CSS masks every layer clear there.
   * Only such a style may paint flashColours.
   */
  numberHole?: boolean;
}

export const HUES: Hue[] = [
  { id: "gold", name: "Gold", base: PLAYER_COLORS[0] },
  { id: "blue", name: "Blue", base: PLAYER_COLORS[1] },
  { id: "magenta", name: "Magenta", base: PLAYER_COLORS[2] },
  { id: "red", name: "Red", base: PLAYER_COLORS[3] },
  { id: "green", name: "Green", base: PLAYER_COLORS[4] },
  { id: "purple", name: "Purple", base: PLAYER_COLORS[5] },
];

// `solid` must stay first: it is the default, and defaultLookFor indexes it.
export const LOOK_STYLES: LookStyle[] = [
  { id: "solid", name: "Solid", animated: false, layers: 0 },
  { id: "fade", name: "Fade", animated: false, layers: 0 },
  { id: "stripe", name: "Stripes", animated: false, layers: 0 },
  { id: "drift", name: "Drift", animated: true, layers: 2 },
  { id: "lava", name: "Lava", animated: true, layers: 3 },
  { id: "nebula", name: "Nebula", animated: true, layers: 3 },
  { id: "tide", name: "Tide", animated: true, layers: 2 },
  { id: "pulse", name: "Pulse", animated: true, layers: 2 },
  { id: "smoke", name: "Smoke", animated: true, layers: 1 },
  { id: "marble", name: "Marble", animated: true, layers: 1 },
  { id: "glitter", name: "Glitter", animated: true, layers: 4, numberHole: true },
  { id: "hearts", name: "Hearts", animated: true, layers: 7, directional: true },
  { id: "foil", name: "Foil", animated: true, layers: 1 },
  { id: "fissure", name: "Fissure", animated: true, layers: 2 },
  { id: "radiance", name: "Radiance", animated: true, layers: 2 },
  // Directional: a tear runs along the owner's lines of text, like a bad
  // scanline. Unturned, on a side seat it tore across the number instead.
  { id: "glitch", name: "Glitch", animated: true, layers: 3, directional: true },
  { id: "tartan", name: "Tartan", animated: false, layers: 0 },
];

/**
 * How far each style's darkest and lightest paint reaches for. These are
 * ambitions, not guarantees — `within` pulls them back until the life total
 * still clears 3:1 against them.
 */
const LO = -0.34;
const HI = 0.3;

/** WCAG large-text minimum, with a hair of margin. The life total is huge. */
const MIN_CONTRAST = 3.05;

/**
 * Shifts `base` by `t`, backing off until the result still clears MIN_CONTRAST
 * against the ink chosen for that base.
 *
 * The band cannot be symmetric. A dark hue takes white text, so lightening a
 * layer spends contrast while darkening it gains contrast; for a light hue it
 * is the other way round. Clamping per direction is what lets every hue keep
 * as much depth as it can afford rather than every hue being limited by the
 * worst one.
 */
/**
 * Pulls `candidate` toward the ink colour until it clears MIN_CONTRAST against
 * it. Used when a highlight comes from a *different* colour than the base, so
 * the clamp has to be applied against the base's ink rather than its own.
 */
function withinInk(candidate: string, base: string): string {
  const ink = textOn(base);
  let c = candidate;
  for (let i = 0; i < 24; i++) {
    if (contrastRatio(ink, c) >= MIN_CONTRAST) return c;
    c = shift(c, ink === "#ffffff" ? -0.08 : 0.08);
  }
  return base;
}

function within(base: string, t: number): string {
  const ink = textOn(base);
  let amount = t;
  for (let i = 0; i < 24 && Math.abs(amount) > 0.005; i++) {
    const candidate = shift(base, amount);
    if (contrastRatio(ink, candidate) >= MIN_CONTRAST) return candidate;
    amount *= 0.85;
  }
  return base;
}

export interface ResolvedLook {
  id: string;
  hueId: string;
  /** The raw colour tokens, e.g. ["blue"] or ["#aabbcc", "green"]. */
  colourSpec: string[];
  /** How much of the second colour reaches the highlight, 0..1. 1 with none. */
  mix: number;
  styleId: string;
  name: string;
  /** The flat colour contrast is decided from. */
  base: string;
  /** Custom properties the style's CSS reads. */
  vars: Record<string, string>;
  animated: boolean;
  layers: number;
  /** The layers turn with the seat (see LookStyle.directional). */
  directional: boolean;
  /** The layers are masked clear over the life total (LookStyle.numberHole). */
  numberHole: boolean;
  /** Every colour this look paints where the life total can sit, for the contrast test. */
  paintedColours: string[];
  /**
   * Colours painted ONLY in layers masked clear over the life total, so they
   * are exempt from the contrast clamp. Empty unless numberHole.
   */
  flashColours: string[];
}

/**
 * A fractal-noise field baked into an SVG data URI.
 *
 * The noise is generated once into an image rather than living as a live
 * filter on the tile: a live feTurbulence recomputes every frame, which is
 * what made an earlier attempt boil in place instead of drifting. As an image
 * it is rasterised once and then simply moved, and six tiles cannot collide
 * over duplicate filter ids.
 */
function noiseDataUri(colour: string, frequency: number, octaves: number, seed: number, cut: number): string {
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(colour.replace("#", "").slice(i - 1, i + 1), 16) / 255,
  );
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='520' height='520'>` +
    `<filter id='n' x='0' y='0' width='100%' height='100%'>` +
    `<feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='${octaves}' seed='${seed}'/>` +
    `<feColorMatrix type='matrix' values='0 0 0 0 ${r.toFixed(3)} 0 0 0 0 ${g.toFixed(3)} 0 0 0 0 ${b.toFixed(3)} 0 0 0 ${-cut} ${cut.toFixed(2)}'/>` +
    `</filter><rect width='520' height='520' filter='url(#n)'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** An SVG document as a CSS url() value. */
function svgUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** A colour's channels as 0..1, written for an feColorMatrix. */
function channels(colour: string): string[] {
  return [1, 3, 5].map((i) =>
    (parseInt(colour.replace("#", "").slice(i - 1, i + 1), 16) / 255).toFixed(3),
  );
}

/**
 * A small seeded generator, so every baked pattern is the same on every device
 * and every render -- a sparkle that moved between renders would flicker.
 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Travels from `from` toward `toward` in OKLab as far as the life total still
 * clears MIN_CONTRAST against the base's ink, and returns where it stopped.
 *
 * This is how a style asks for "as bright a glint as this seat can afford":
 * on a dark-ink hue it reaches nearly white, on a white-ink hue it stops at
 * the last colour the white number still reads against.
 */
export function reachToward(from: string, toward: string, base: string): string {
  const ink = textOn(base);
  const ok = (c: string) => contrastRatio(ink, c) >= MIN_CONTRAST;
  if (!ok(from)) return withinInk(from, base);
  const end = mixOklab(from, toward, 1);
  if (ok(end)) return end;
  let good = 0;
  let bad = 1;
  for (let i = 0; i < 16; i++) {
    const t = (good + bad) / 2;
    if (ok(mixOklab(from, toward, t))) good = t;
    else bad = t;
  }
  return mixOklab(from, toward, good);
}

/**
 * Glitter's paint, in two groups with two different promises.
 *
 * `field` is the bed of facets scattered over the whole tile, the ground
 * behind the life total included, so every colour in it (and the sheen's two
 * ends) is held inside the contrast clamp like any other painted colour. On a
 * white-ink hue the ground deepens first, which only gains contrast, so a
 * facet the seat can afford still shows lighter than its bed.
 *
 * `flash` is the bright flecks and star glints: white, a pale tint of the hue
 * and two iridescent neighbours either side of it on the wheel. These are
 * what make it glitter rather than grain, and on most hues they are far too
 * bright to sit behind a white number. So they are painted only in the
 * masked layers, which are fully transparent over the number (NUMBER_HOLE_CLEAR),
 * and never under it.
 */
export function glitterInks(
  base: string,
  lo: string,
  hi: string,
): { ground: string; sheenLo: string; sheenHi: string; field: string[]; flash: string[] } {
  const whiteInk = textOn(base) === "#ffffff";
  const ground = whiteInk ? shift(base, -0.2) : base;
  // The brightest facet the seat can afford, and a hue-shifted one beside it:
  // a little iridescence in the bed too, not only in the flashes.
  const light = reachToward(mixOklab(ground, hi, 0.5), "#ffffff", base);
  const tint = withinInk(rotateHue(mixOklab(ground, light, 0.7), 14, 0.05), base);
  const mid = mixOklab(ground, light, 0.5);
  // A shadow facet, kept close to the ground and in the hue: black-brown
  // specks were what made the first version read as dirt.
  const shade = mixOklab(ground, reachToward(ground, mixOklab(lo, "#000000", 0.2), base), 0.35);
  // The sheen runs along the black-white axis from the ground, so every
  // channel moves the same way and the gradient between its ends stays as
  // legible as its ends.
  const sheenHi = mixOklab(ground, reachToward(ground, "#ffffff", base), 0.6);
  const sheenLo = whiteInk ? shift(ground, -0.1) : mixOklab(ground, reachToward(ground, "#000000", base), 0.5);
  const flash = [
    "#ffffff",
    mixOklab(hi, "#ffffff", 0.62),
    mixOklab(rotateHue(hi, 48, 0.25), "#ffffff", 0.5),
    mixOklab(rotateHue(hi, -56, 0.25), "#ffffff", 0.5),
  ];
  // Weighted by repetition: mostly light-catching facets, few in shadow.
  return { ground, sheenLo, sheenHi, field: [shade, mid, mid, light, light, light, tint], flash };
}

/**
 * How much of the number hole's ellipse is fully clear. The masked layers are
 * transparent out to this fraction of the hole's outer radius and only then
 * fade in; numberHole() sizes the clear part to contain the life total's box.
 */
export const NUMBER_HOLE_CLEAR = 0.8;

/**
 * Where the masked layers' hole goes, in px within the layer: centred on the
 * life total's laid-out text box (screen space, so a seat's rotation is
 * already in it), with a clear ellipse that circumscribes that box plus
 * `pad` -- an ellipse through the box's corners has semi-axes sqrt(2) times
 * the half-sides -- and an outer fade ring beyond it.
 */
export function numberHole(
  layer: { left: number; top: number },
  text: { left: number; top: number; width: number; height: number },
  pad: number,
): { x: number; y: number; rx: number; ry: number } {
  const clear = (half: number) => (half + pad) * Math.SQRT2;
  return {
    x: text.left + text.width / 2 - layer.left,
    y: text.top + text.height / 2 - layer.top,
    rx: clear(text.width / 2) / NUMBER_HOLE_CLEAR,
    ry: clear(text.height / 2) / NUMBER_HOLE_CLEAR,
  };
}

/**
 * Fine grain thresholded hard, so it reads as specks rather than a cloud.
 *
 * Alpha is a steep ramp on the noise value: everything under `cut` is
 * transparent and the few pixels above it are solid, which is the difference
 * between glitter and dust. The colour space is pinned to sRGB so the speck
 * is painted in exactly the colour the contrast test checked, not a lighter
 * linear-light reading of it. stitchTiles makes the tile repeat seamlessly.
 */
export function grainDataUri(
  colour: string,
  cut: number,
  seed: number,
  size = 180,
  /** Lower frequency and a gentle ramp turn specks into soft mottling. */
  { frequency = 0.9, octaves = 1, k = 30 } = {},
): string {
  const [r, g, b] = channels(colour);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>` +
    `<filter id='g' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>` +
    `<feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='${octaves}' seed='${seed}' stitchTiles='stitch'/>` +
    `<feColorMatrix type='matrix' values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} ${k} 0 0 0 ${(-k * cut).toFixed(2)}'/>` +
    `</filter><rect width='${size}' height='${size}' filter='url(#g)'/></svg>`;
  return svgUrl(svg);
}

/** A four-point star centred on (x, y): four concave curves through the middle. */
function starPath(x: number, y: number, r: number): string {
  const p = (n: number) => n.toFixed(1);
  return (
    `M${p(x)} ${p(y - r)}Q${p(x)} ${p(y)} ${p(x + r)} ${p(y)}` +
    `Q${p(x)} ${p(y)} ${p(x)} ${p(y + r)}Q${p(x)} ${p(y)} ${p(x - r)} ${p(y)}` +
    `Q${p(x)} ${p(y)} ${p(x)} ${p(y - r)}Z`
  );
}

/**
 * A tile of glitter facets: small flat squares, each turned to its own angle
 * and cut in a colour drawn from `colours`, the way flakes of craft glitter
 * lie at random and each catches the light differently.
 *
 * `r` is a facet's half-diagonal, skewed toward the small end so most flakes
 * are fine and a few are chunky. Every facet sits wholly inside the tile, so
 * the repeat cuts none in half. Tiles at prime sizes repeat on a long common
 * period, so the eye never finds the grid.
 */
export function facetDataUri(
  size: number,
  seed: number,
  count: number,
  colours: string[],
  rMin: number,
  rMax: number,
): string {
  const key = [size, seed, count, rMin, rMax, ...colours].join("|");
  const hit = baked.get(key);
  if (hit) return hit;
  const rand = seeded(seed);
  const p = (n: number) => n.toFixed(2);
  let body = "";
  for (let i = 0; i < count; i++) {
    const r = rMin + (rMax - rMin) * rand() ** 2;
    const a = rand() * (Math.PI / 2);
    const x = r + 0.5 + rand() * (size - 2 * r - 1);
    const y = r + 0.5 + rand() * (size - 2 * r - 1);
    const fill = colours[Math.floor(rand() * colours.length)];
    const pts = [0, 1, 2, 3]
      .map((k) => `${p(x + r * Math.cos(a + (k * Math.PI) / 2))} ${p(y + r * Math.sin(a + (k * Math.PI) / 2))}`)
      .join(" ");
    body += `<polygon points='${pts}' fill='${fill}'/>`;
  }
  return bake(key, svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>${body}</svg>`));
}

/**
 * Baked glitter tiles by their inputs. Every tile render resolves its look,
 * and a facet tile is hundreds of polygons, so each is built once per colour
 * set. Bounded: a colour wheel can mint any number of colour sets.
 */
const baked = new Map<string, string>();
function bake(key: string, uri: string): string {
  if (baked.size >= 96) baked.clear();
  baked.set(key, uri);
  return uri;
}

/**
 * A sparse tile of star glints: a soft halo, a long four-point star, a short
 * one turned 45 degrees across it, and a white core -- the flare a facet
 * throws when it catches the light square on. Kept inside the tile.
 */
export function glintDataUri(size: number, seed: number, stars: number, colour: string): string {
  const rand = seeded(seed);
  let body =
    `<defs><radialGradient id='h'><stop offset='0' stop-color='${colour}' stop-opacity='0.5'/>` +
    `<stop offset='1' stop-color='${colour}' stop-opacity='0'/></radialGradient></defs>`;
  for (let i = 0; i < stars; i++) {
    const r = 4.5 + rand() * 4;
    const x = r + 1 + rand() * (size - 2 * r - 2);
    const y = r + 1 + rand() * (size - 2 * r - 2);
    const f = (n: number) => n.toFixed(1);
    body +=
      `<circle cx='${f(x)}' cy='${f(y)}' r='${f(r * 0.8)}' fill='url(#h)'/>` +
      `<path d='${starPath(x, y, r)}' fill='${colour}'/>` +
      `<path d='${starPath(x, y, r * 0.45)}' fill='${colour}' transform='rotate(45 ${f(x)} ${f(y)})'/>` +
      `<circle cx='${f(x)}' cy='${f(y)}' r='0.9' fill='#ffffff'/>`;
  }
  return svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>${body}</svg>`);
}

/** How see-through a heart is. Baked into the fill so opacity stays free to fade it. */
export const HEART_ALPHA = 0.4;

/**
 * A style's accent: a light colour where the seat can afford one that reads
 * against its base, the shadow where it cannot. Blue and green sit so close
 * to the lightest the white number allows that a light heart or ray would be
 * invisible on them; a deep one still reads.
 */
export function accentFor(base: string, lo: string, hi: string): string {
  const light = reachToward(hi, "#ffffff", base);
  return contrastRatio(light, base) >= 1.3 ? light : lo;
}

/** The heart's colour (see accentFor). */
export const heartInk = accentFor;

/** One heart, see-through, as a data URI every heart on the tile shares. */
export function heartDataUri(colour: string): string {
  return svgUrl(
    `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='29' viewBox='0 0 32 29'>` +
      `<path d='M16 28.5C6 21 0 15.5 0 8.6 0 3.8 3.7 0 8.4 0c3.1 0 5.9 1.7 7.6 4.3C17.7 1.7 20.5 0 23.6 0 28.3 0 32 3.8 32 8.6 32 15.5 26 21 16 28.5Z' ` +
      `fill='${colour}' fill-opacity='${HEART_ALPHA}'/></svg>`,
  );
}

/** Fissure's network lives in a square of this many units, cropped to the tile. */
const CRACK_BOX = 400;

/**
 * A crack network: a few long fractures wandering in from the edges, each
 * shedding short branches. A random walk with a jittered heading that keeps
 * pulling back toward its course, so it zigzags like a fracture rather than
 * curling like a vein; seeded so every device draws the same stone.
 *
 * Returned as width tiers -- each tier one path stroked at one relative width
 * -- because a fracture is widest where it entered and thins toward its tip.
 * A uniform stroke read as neon wire, not cracked stone.
 */
export function crackNetwork(seed: number): { d: string; w: number }[] {
  const rand = seeded(seed);
  const f = (n: number) => n.toFixed(1);
  const TIERS = [1, 0.66, 0.4, 0.24];
  const tiers = TIERS.map(() => "");
  const walk = (x0: number, y0: number, heading: number, steps: number, len: number, from: number) => {
    let x = x0;
    let y = y0;
    let a = heading;
    for (let i = 0; i < steps; i++) {
      a += (rand() - 0.5) * 1.15 + (heading - a) * 0.3;
      const l = len * (0.5 + rand());
      const nx = x + Math.cos(a) * l;
      const ny = y + Math.sin(a) * l;
      // Thins along its length: the first stretch at its own tier, the rest
      // one or two tiers finer.
      const tier = Math.min(TIERS.length - 1, from + Math.floor((i / steps) * 2.4));
      tiers[tier] += `M${f(x)} ${f(y)}L${f(nx)} ${f(ny)}`;
      x = nx;
      y = ny;
      if (from === 0 && i > 1 && rand() < 0.32) {
        const turn = (rand() < 0.5 ? -1 : 1) * (0.55 + rand() * 0.6);
        walk(x, y, a + turn, 3 + Math.floor(rand() * 4), len * 0.6, Math.min(TIERS.length - 1, tier + 1));
      }
    }
  };
  // Entry points round the edge, each aimed roughly across the stone.
  const B = CRACK_BOX;
  const entries: [number, number, number][] = [
    [0, B * 0.28, 0.25],
    [B, B * 0.12, Math.PI - 0.5],
    [B * 0.34, B, -Math.PI / 2 + 0.35],
    [B, B * 0.78, Math.PI + 0.3],
    [B * 0.12, 0, Math.PI / 2 - 0.2],
  ];
  for (const [x, y, h] of entries) walk(x, y, h, 15 + Math.floor(rand() * 6), 18, 0);
  return TIERS.map((w, i) => ({ d: tiers[i], w })).filter((t) => t.d !== "");
}

const CRACKS = crackNetwork(5);

/**
 * Fissure's two images. The cracks: a rim in the shadow colour with a thin
 * core of the glow colour, crisp. The glow: the same paths stroked wide in
 * the glow colour and blurred inside the SVG, so the blur is rasterised once
 * with the image -- never a live CSS filter -- and only its opacity moves.
 */
export function fissureDataUris(rim: string, glow: string): { cracks: string; glow: string } {
  const B = CRACK_BOX;
  const head = `<svg xmlns='http://www.w3.org/2000/svg' width='${B}' height='${B}' viewBox='0 0 ${B} ${B}'>`;
  const g = `fill='none' stroke-linecap='round' stroke-linejoin='round'`;
  const stroke = (colour: string, width: number) =>
    CRACKS.map((t) => `<path d='${t.d}' stroke='${colour}' stroke-width='${(t.w * width).toFixed(2)}'/>`).join("");
  const cracks = head + `<g ${g}>` + stroke(rim, 5) + stroke(glow, 1.7) + `</g></svg>`;
  const halo =
    head +
    `<filter id='b' x='-10%' y='-10%' width='120%' height='120%'><feGaussianBlur stdDeviation='5'/></filter>` +
    `<g ${g} filter='url(#b)'>` +
    stroke(glow, 9) +
    `</g></svg>`;
  return { cracks: svgUrl(cracks), glow: svgUrl(halo) };
}

/**
 * The stone: the base pulled toward a deep, desaturated version of itself as
 * far as the life total allows. Under white ink that is all the way, so the
 * stone is dark and the glow reads as light through cracks; under black ink
 * (gold) it stops where the black number would start to sink, which keeps the
 * same ink the base implies -- nothing has to guess a second text colour.
 */
export function stoneFor(base: string): string {
  return reachToward(base, mixOklab(base, "#121212", 0.62), base);
}

type Thread = "base" | "lo" | "hi";

/** Tartan's sett: the run of thread colours and widths (px) that repeats. */
export const TARTAN_SETT: [Thread, number][] = [
  ["lo", 14],
  ["base", 4],
  ["lo", 3],
  ["base", 20],
  ["hi", 3],
  ["base", 20],
];

/**
 * Where two threads of different colours cross, a woven cloth shows them
 * half and half. That is drawn here as one OPAQUE colour, the OKLab midpoint:
 * two translucent bands laid over each other would average through sRGB and
 * go to mud, and would show the top band's colour more than the bottom's.
 * Each blend is clamped like every other colour a look paints.
 */
export function tartanCrossing(a: string, b: string, base: string): string {
  return a === b ? a : withinInk(mixOklab(a, b, 0.5), base);
}

/**
 * One repeat of the plaid as an SVG tile: the warp runs the sett across, the
 * weft runs it down, and every cell of the grid is the crossing of the two.
 * Integer edges keep every band crisp.
 */
export function tartanDataUri(base: string, lo: string, hi: string): { uri: string; size: number; colours: string[] } {
  const thread: Record<Thread, string> = { base, lo, hi };
  const size = TARTAN_SETT.reduce((n, [, w]) => n + w, 0);
  const used = new Set<string>();
  let body = "";
  let y = 0;
  for (const [weft, h] of TARTAN_SETT) {
    let x = 0;
    for (const [warp, w] of TARTAN_SETT) {
      const c = tartanCrossing(thread[warp], thread[weft], base);
      used.add(c);
      body += `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${c}'/>`;
      x += w;
    }
    y += h;
  }
  return {
    uri: svgUrl(
      `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' shape-rendering='crispEdges'>${body}</svg>`,
    ),
    size,
    colours: [...used],
  };
}

/**
 * A look id is `<colours>` or `<colours>-<style>`, where colours is one or two
 * tokens joined by `~`, each either a named hue or a #rrggbb literal.
 *
 *   blue                  blue, solid
 *   blue-lava             blue, lava
 *   #aabbcc-lava          a custom colour
 *   blue~green-lava       two colours
 *
 * Parsing splits at the LAST dash: a style id never contains one, but a colour
 * spec can. That is also what keeps every legacy id valid unchanged.
 */
export function lookId(
  colourSpec: string,
  styleId: string,
  mixAmount = 1,
): string {
  // A mix only means something with two colours, and a full mix is the
  // default -- both are left out of the id so existing ids are unchanged.
  const spec =
    colourSpec.includes("~") && mixAmount < 1
      ? `${colourSpec}@${Math.round(mixAmount * 100)}`
      : colourSpec;
  return styleId === "solid" ? spec : `${spec}-${styleId}`;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Resolves one colour token to a hex value, or null if it is meaningless. */
function tokenToHex(token: string): string | null {
  if (HEX.test(token)) return token;
  return HUES.find((h) => h.id === token)?.base ?? null;
}

export function parseLookId(
  id: string,
): { colourSpec: string[]; styleId: string; mix: number } | null {
  const dash = id.lastIndexOf("-");
  // A trailing dash, or a dash that is part of nothing, is malformed.
  const hasStyle = dash > 0 && dash < id.length - 1;
  const spec = hasStyle ? id.slice(0, dash) : id;
  const styleId = hasStyle ? id.slice(dash + 1) : "solid";
  if (!LOOK_STYLES.some((s) => s.id === styleId)) return null;

  // The mix rides on the colour spec as @<percent>. `@` cannot appear in a hue
  // id or a hex literal, so it is unambiguous wherever it lands.
  const at = spec.indexOf("@");
  let mix = 1;
  let colours = spec;
  if (at !== -1) {
    colours = spec.slice(0, at);
    const pct = spec.slice(at + 1);
    // Reject rather than guess: a malformed mix means the id was not written
    // by this app, and silently defaulting would hide the corruption.
    if (!/^\d{1,3}$/.test(pct)) return null;
    const n = Number(pct);
    if (n > 100) return null;
    mix = n / 100;
  }

  const raw = colours.split("~").filter((t) => t !== "");
  if (raw.length === 0 || raw.length > 2) return null;
  if (raw.some((t) => tokenToHex(t) === null)) return null;
  // A hex that happens to be one of the presets is normalised back to the hue
  // id, so the preset swatch shows as selected instead of the colour wheel.
  // A seat's own colour is always a preset, which is exactly this case.
  const colourSpec = raw.map((t) => {
    const named = HUES.find((h) => h.base.toLowerCase() === t.toLowerCase());
    return named ? named.id : t.toLowerCase();
  });
  // A mix with nothing to mix into is meaningless; normalise it away so the
  // id round-trips to the same string it came from.
  return { colourSpec, styleId, mix: colourSpec.length === 2 ? mix : 1 };
}

export function allLookIds(): string[] {
  return HUES.flatMap((h) => LOOK_STYLES.map((s) => lookId(h.id, s.id)));
}

/**
 * The two derived colours every style paints with.
 *
 * Variety comes from rotating hue as well as shifting lightness. A dark hue
 * takes white text and so has almost no room to lighten; rotating it toward a
 * neighbour is just as visible and costs no contrast.
 *
 * Shared by the catalogue and the fallback deliberately. When the fallback
 * derived its own palette it skipped the contrast clamp entirely — harmless
 * only because the fallback happens to paint no layers, and invisible to the
 * catalogue test, which iterates allLookIds() and never sees it.
 */
function paletteFor(base: string): { lo: string; hi: string } {
  // `within` clamps against the ink of the colour it is handed, which after
  // the hue rotation is not always the base's ink: #ff8800 takes black text,
  // but rotated toward red it would take white, so its shadow was clamped the
  // wrong way and came out at 2.6:1. withinInk re-checks against the ink the
  // tile really uses. It leaves any colour that already passes untouched, so
  // no preset changes.
  return {
    lo: withinInk(within(rotateHue(base, -22, 0.05), LO), base),
    hi: withinInk(within(rotateHue(base, 20, 0.08), HI), base),
  };
}

function build(
  colourSpec: string[],
  style: LookStyle,
  mixAmount = 1,
): ResolvedLook {
  const colours = colourSpec.map((t) => tokenToHex(t) as string);
  const base = colours[0];
  // The second colour, when given, supplies the highlight; the shadow always
  // comes from the first so the tile still reads as that seat's colour. Both
  // are clamped against the ink chosen for the base, which is why a custom
  // colour picked from a wheel cannot break legibility.
  //
  // The mix blends the SOURCE colour before the highlight is derived, rather
  // than blending two finished highlights. That keeps the whole slider inside
  // the clamp -- every position is a real colour that has been checked -- and
  // makes mix 0 land exactly on the single-colour look rather than merely near
  // it.
  const own = paletteFor(base);
  let lo = own.lo;
  let hi = own.hi;
  if (colours[1]) {
    // The second colour keeps its OWN hue. paletteFor exists to derive a
    // variation of a single hue -- it rotates by ~20 degrees and shifts
    // lightness -- which is right for inventing a highlight out of one colour
    // and wrong for a colour somebody deliberately chose: run red through it
    // and a tile ends up tan. So the second colour is only darkened and
    // lightened, never rotated.
    //
    // It reaches BOTH ends of the palette, not just the highlight. Fade and
    // Stripes read from --look-lo, so a second colour that only touched
    // --look-hi left them looking single-coloured.
    const c = colours[1];
    // One direction for the whole look, taken from the pair the player picked,
    // so the shadow and the highlight sweep the same way round the wheel
    // instead of splitting and meeting in the middle.
    const dir = hueDirection(base, c);
    lo = mix(own.lo, shift(c, -0.16), mixAmount, dir);
    hi = mix(own.hi, shift(c, 0.1), mixAmount, dir);
    // Clamp after blending: contrast is not linear, so two colours that each
    // clear the bar can blend to one that does not.
    lo = withinInk(lo, base);
    hi = withinInk(hi, base);
  }
  const vars: Record<string, string> = {
    "--look-base": base,
    "--look-lo": lo,
    "--look-hi": hi,
  };
  if (style.id === "smoke") vars["--look-noise"] = noiseDataUri(hi, 0.022, 4, 11, 0.78);
  if (style.id === "marble") vars["--look-noise"] = noiseDataUri(hi, 0.014, 5, 3, 0.88);
  // Colours a style paints beyond base, lo and hi. Each one is derived inside
  // the contrast clamp and listed here so looks.test.ts checks it.
  const extra: string[] = [];
  // Colours painted only behind a number hole, outside the clamp.
  const flash: string[] = [];
  if (style.id === "glitter") {
    const g = glitterInks(base, lo, hi);
    vars["--look-ground"] = g.ground;
    vars["--look-sheen-lo"] = g.sheenLo;
    vars["--look-sheen-hi"] = g.sheenHi;
    // The bed: two static facet tiles at prime sizes, under everything.
    vars["--look-bed-a"] = facetDataUri(61, 5, 300, g.field, 0.4, 1.3);
    vars["--look-bed-b"] = facetDataUri(83, 12, 420, g.field, 0.35, 1.0);
    // The flashes: two winking fleck tiles and a tile of star glints.
    vars["--look-flash-a"] = facetDataUri(97, 3, 190, g.flash, 0.45, 1.8);
    vars["--look-flash-b"] = facetDataUri(127, 8, 290, g.flash, 0.35, 1.2);
    vars["--look-glints"] = glintDataUri(173, 21, 4, g.flash[0]);
    extra.push(g.ground, g.sheenLo, g.sheenHi, ...g.field);
    flash.push(...g.flash);
  }
  if (style.id === "hearts") {
    const heart = heartInk(base, lo, hi);
    vars["--look-heart"] = heartDataUri(heart);
    extra.push(heart);
  }
  if (style.id === "foil") {
    // The brightest light the seat can afford, so the sweep reads as a shine
    // rather than a tint.
    const sheen = reachToward(hi, "#ffffff", base);
    vars["--look-sheen"] = sheen;
    extra.push(sheen);
  }
  if (style.id === "fissure") {
    const stone = stoneFor(base);
    const art = fissureDataUris(lo, hi);
    vars["--look-stone"] = stone;
    // Soft mottling in the shadow colour, so the stone is not a flat fill.
    vars["--look-mottle"] = grainDataUri(lo, 0.5, 13, 260, { frequency: 0.03, octaves: 4, k: 1.3 });
    vars["--look-cracks"] = art.cracks;
    vars["--look-glow"] = art.glow;
    extra.push(stone);
  }
  if (style.id === "radiance") {
    // Three quarters of the way to the accent: full white rays on gold were a
    // shout across the table, and the blend keeps every ray inside the clamp.
    const ray = withinInk(mixOklab(base, accentFor(base, lo, hi), 0.75), base);
    vars["--look-ray"] = ray;
    extra.push(ray);
  }
  if (style.id === "tartan") {
    const plaid = tartanDataUri(base, lo, hi);
    vars["--look-tartan"] = plaid.uri;
    vars["--look-sett"] = `${plaid.size}px`;
    extra.push(...plaid.colours);
  }
  const named = HUES.find((h) => h.base === base);
  return {
    id: lookId(colourSpec.join("~"), style.id, mixAmount),
    hueId: HUES.find((h) => h.id === colourSpec[0])?.id ?? "custom",
    colourSpec,
    mix: colours[1] ? mixAmount : 1,
    styleId: style.id,
    name:
      style.id === "solid"
        ? (named?.name ?? "Custom")
        : `${named?.name ?? "Custom"} ${style.name.toLowerCase()}`,
    base,
    vars,
    animated: style.animated,
    layers: style.layers,
    directional: style.directional === true,
    numberHole: style.numberHole === true,
    paintedColours: style.id === "solid" ? [base] : [base, lo, hi, ...extra],
    flashColours: flash,
  };
}

/** The look for a seat when nothing has been chosen. */
export function defaultLookFor(seat: number): ResolvedLook {
  return build([HUES[seat % HUES.length].id], LOOK_STYLES[0]);
}

/**
 * Resolves a stored look id. Legacy ids (`blue`, `blue-fade`, `blue-stripe`)
 * are already the solid/fade/stripe cases of this scheme, so they need no
 * migration. Anything unrecognised falls back to a flat fill of the player's
 * own colour, which is how tiles rendered before looks existed.
 */
export function resolveLook(
  lookId: string | undefined | null,
  color: string,
): ResolvedLook {
  const fallback: ResolvedLook = {
    id: "custom",
    hueId: "custom",
    colourSpec: [color],
    mix: 1,
    styleId: "solid",
    name: "Custom",
    base: color,
    vars: {
      "--look-base": color,
      "--look-lo": paletteFor(color).lo,
      "--look-hi": paletteFor(color).hi,
    },
    animated: false,
    layers: 0,
    directional: false,
    numberHole: false,
    paintedColours: [color],
    flashColours: [],
  };
  if (!lookId) return fallback;
  const parsed = parseLookId(lookId);
  if (!parsed) return fallback;
  const style = LOOK_STYLES.find((s) => s.id === parsed.styleId);
  if (!style) return fallback;
  return build(parsed.colourSpec, style, parsed.mix);
}

/**
 * The flat colour a player's tile is painted from.
 *
 * `player.color` is only the seat's default and never changes when a player
 * picks a new colour -- that choice lives in `player.look`. Anything that
 * stands for a player outside their tile should paint with this, or it shows
 * the colour they had before they changed it.
 */
export function playerColour(player: {
  look?: string | null;
  color: string;
}): string {
  return resolveLook(player.look, player.color).base;
}
