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
  { id: "glitter", name: "Glitter", animated: true, layers: 2 },
  { id: "hearts", name: "Hearts", animated: true, layers: 7, directional: true },
  { id: "foil", name: "Foil", animated: true, layers: 1 },
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
  /** Every colour this look actually paints, for the contrast test. */
  paintedColours: string[];
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
 * Glitter's colours: the ground it is scattered on, the speck of the static
 * grain, and the glint of the winking sparkles.
 *
 * The glint is the brightest the seat can afford. On a dark-ink hue that is
 * white, and the ground stays the base. On a white-ink hue the base already
 * sits near the lightest the white number tolerates, so a glint can barely
 * outshine it -- glitter on plain blue all but vanished. There the ground
 * deepens instead, which only gains contrast, and the glint stands out from
 * it. The speck is whichever of the shadow and the glint stands further from
 * the ground: dark on gold, where light specks would melt into the base;
 * light on a deepened blue. Measured, not listed, so a custom colour gets the
 * same choice.
 */
export function glitterInks(
  base: string,
  lo: string,
  hi: string,
): { ground: string; speck: string; glint: string } {
  const glint = reachToward(hi, "#ffffff", base);
  const ground = textOn(base) === "#ffffff" ? shift(base, -0.24) : base;
  const speck = contrastRatio(lo, ground) > contrastRatio(glint, ground) ? lo : glint;
  return { ground, speck, glint };
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
export function grainDataUri(colour: string, cut: number, seed: number, size = 180): string {
  const [r, g, b] = channels(colour);
  const k = 30;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>` +
    `<filter id='g' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>` +
    `<feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='1' seed='${seed}' stitchTiles='stitch'/>` +
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
 * A sparse tile of sparkles: mostly 1-2px dots, plus a few four-point stars.
 *
 * Two of these at prime sizes (97px and 131px) repeat on a common period of
 * 12707px, so the eye never finds the grid. Positions are snapped to the pixel
 * centre so a 1px dot stays one crisp pixel rather than a grey smudge across
 * four.
 */
export function sparkleDataUri(
  size: number,
  seed: number,
  dots: number,
  stars: number,
  speck: string,
  glint: string,
): string {
  const rand = seeded(seed);
  let body = "";
  for (let i = 0; i < dots; i++) {
    const r = rand() < 0.65 ? 0.5 : 1;
    const x = Math.floor(2 + rand() * (size - 4)) + 0.5;
    const y = Math.floor(2 + rand() * (size - 4)) + 0.5;
    body += `<circle cx='${x}' cy='${y}' r='${r}' fill='${rand() < 0.55 ? glint : speck}'/>`;
  }
  for (let i = 0; i < stars; i++) {
    const r = 3 + rand() * 2;
    const x = r + 1 + rand() * (size - 2 * r - 2);
    const y = r + 1 + rand() * (size - 2 * r - 2);
    body += `<path d='${starPath(x, y, r)}' fill='${glint}'/>`;
  }
  return svgUrl(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>${body}</svg>`,
  );
}

/** How see-through a heart is. Baked into the fill so opacity stays free to fade it. */
export const HEART_ALPHA = 0.4;

/**
 * The heart's colour: a light one where the seat can afford a light colour
 * that reads against its base, the shadow where it cannot. Blue and green sit
 * so close to the lightest the white number allows that a light heart would
 * be invisible on them; a deep translucent one still reads.
 */
export function heartInk(base: string, lo: string, hi: string): string {
  const light = reachToward(hi, "#ffffff", base);
  return contrastRatio(light, base) >= 1.3 ? light : lo;
}

/** One heart, see-through, as a data URI every heart on the tile shares. */
export function heartDataUri(colour: string): string {
  return svgUrl(
    `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='29' viewBox='0 0 32 29'>` +
      `<path d='M16 28.5C6 21 0 15.5 0 8.6 0 3.8 3.7 0 8.4 0c3.1 0 5.9 1.7 7.6 4.3C17.7 1.7 20.5 0 23.6 0 28.3 0 32 3.8 32 8.6 32 15.5 26 21 16 28.5Z' ` +
      `fill='${colour}' fill-opacity='${HEART_ALPHA}'/></svg>`,
  );
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
  if (style.id === "glitter") {
    const { ground, speck, glint } = glitterInks(base, lo, hi);
    vars["--look-ground"] = ground;
    vars["--look-grain"] = grainDataUri(speck, 0.7, 7);
    vars["--look-spark-a"] = sparkleDataUri(97, 3, 11, 3, speck, glint);
    vars["--look-spark-b"] = sparkleDataUri(131, 8, 17, 3, speck, glint);
    extra.push(ground, speck, glint);
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
    paintedColours: style.id === "solid" ? [base] : [base, lo, hi, ...extra],
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
    paintedColours: [color],
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
