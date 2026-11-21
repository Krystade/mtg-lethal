import type { FreeSeat, LayoutConfig, Placement, Rotation } from "../state/types";
import { NOMINAL_H, NOMINAL_W, buildFreeLayout, seatsFromLayout, toPts } from "./freeform";
import { cellInfo, powerCells, type Pt } from "./power";
import { defaultLayoutFor } from "./presets";
import { asLayout, geomKey, swapSeats, type Grid } from "./table";

/**
 * The one Layout screen edits a draft and only touches the game on Done.
 * A draft is either a grid (tiles on rows x cols, swapped and turned) or a
 * freeform board (seats anywhere, each claiming its cell). Seat ids are the
 * players' own ids, or "new<n>" for a seat nobody sits in yet.
 */
export interface GridDraft {
  mode: "grid";
  rows: number;
  cols: number;
  placements: Placement[];
}
export interface FreeDraft {
  mode: "free";
  seats: FreeSeat[];
  /**
   * The cells to draw while they are not the seats' own power cells: a grid
   * turned freeform keeps its exact tiles (a power diagram cannot draw two
   * tiles beside one wide one) until a seat is moved, resized, added or
   * removed. Unit coordinates, one per seat.
   */
  drawn: Pt[][] | null;
}
export type Draft = GridDraft | FreeDraft;

const isNew = (id: string) => id.startsWith("new");

/** The board as a draft: the mode it is in now, exactly as drawn. */
export function draftFromLayout(layout: LayoutConfig): Draft {
  if (layout.cells && layout.cells.length === layout.placements.length) {
    const seats = seatsFromLayout(layout);
    const byId = new Map(layout.cells.map((c) => [c.playerId, toPts(c.poly)]));
    const drawn = seats.map((s) => byId.get(s.playerId) ?? []);
    return { mode: "free", seats, drawn: drawn.every((d) => d.length >= 3) ? drawn : null };
  }
  return gridDraft(layout);
}

function gridDraft(g: Grid): GridDraft {
  return { mode: "grid", rows: g.rows, cols: g.cols, placements: g.placements.map((p) => ({ ...p })) };
}

/** Seat ids in seat order: a grid's tile order, a freeform board's seat order. */
export function seatIds(d: Draft): string[] {
  return d.mode === "grid" ? d.placements.map((p) => p.playerId) : d.seats.map((s) => s.playerId);
}

/** The standard grid for these seats, in this order. */
export function standardGrid(ids: string[]): GridDraft {
  const std = defaultLayoutFor(ids.length);
  return gridDraft({ ...std, placements: std.placements.map((p, i) => ({ ...p, playerId: ids[i] })) });
}

/** Freeform -> Grid: the standard grid for the players at the table, seat order kept. */
export function freeToGrid(d: FreeDraft): GridDraft {
  return standardGrid(d.seats.map((s) => s.playerId));
}

/**
 * Grid -> Freeform: every tile drawn exactly where it was, with a seat
 * marker at its centre (same size ratio and facing) to drag from. A tile too
 * small to be a cell (a painted sliver) falls back to the seats' power cells.
 */
export function gridToFree(g: GridDraft, W = NOMINAL_W, H = NOMINAL_H): FreeDraft {
  const tiles: Pt[][] = g.placements.map((p) => {
    const x0 = (p.col - 1) / g.cols;
    const y0 = (p.row - 1) / g.rows;
    const x1 = x0 + p.colSpan / g.cols;
    const y1 = y0 + p.rowSpan / g.rows;
    return [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ];
  });
  const seats = seatsFromLayout({
    id: "draft",
    name: "draft",
    playerCount: g.placements.length,
    rows: g.rows,
    cols: g.cols,
    placements: g.placements,
    builtIn: false,
  });
  const ok = tiles.every((t) => cellInfo(t, W, H).ok);
  return { mode: "free", seats, drawn: ok ? tiles : null };
}

export function swapInGrid(g: GridDraft, a: string, b: string): GridDraft {
  return a === b ? g : swapSeats(g, a, b);
}

export function turnInGrid(g: GridDraft, pid: string): GridDraft {
  return {
    ...g,
    placements: g.placements.map((p) =>
      p.playerId === pid ? { ...p, rotation: (((p.rotation + 90) % 360) as Rotation) } : p,
    ),
  };
}

/**
 * Who Players − takes away: the newest seat -- one added on this screen,
 * else the highest-numbered player -- so − undoes a +.
 */
export function lastSeat(ids: string[]): string {
  const rank = (id: string) => (isNew(id) ? 1000 + Number(id.slice(3)) : Number(id.slice(1)));
  return ids.reduce((a, b) => (rank(b) > rank(a) ? b : a));
}

/**
 * Final ids for the seats, in seat order: a player keeps their id when it
 * still exists at the new size (so a swap or a turn renumbers nobody); the
 * rest, and new seats, take the free ids in seat order.
 */
export function finalIds(ids: string[]): string[] {
  const n = ids.length;
  const fits = (id: string) => !isNew(id) && Number(id.slice(1)) < n;
  const taken = new Set(ids.filter(fits));
  const free = Array.from({ length: n }, (_, i) => `p${i}`).filter((id) => !taken.has(id));
  return ids.map((id) => (fits(id) ? id : free.shift()!));
}

export interface Finished {
  layout: LayoutConfig;
  /** keep[i]: the player who takes seat p{i}, or null for a new player. */
  keep: (string | null)[];
}

/** A grid draft ready for the store (applyFreeform renumbers by `keep`). */
export function finishGrid(g: GridDraft): Finished {
  const ids = seatIds(g);
  const fin = finalIds(ids);
  const n = ids.length;
  const keep: (string | null)[] = new Array(n).fill(null);
  fin.forEach((f, i) => (keep[Number(f.slice(1))] = isNew(ids[i]) ? null : ids[i]));
  const placements = g.placements.map((p, i) => ({ ...p, playerId: fin[i] }));
  return { layout: asLayout({ rows: g.rows, cols: g.cols, placements }, n), keep };
}

/**
 * A freeform draft ready for the store, or null when a seat has too little
 * room. Seats are put in final-id order first, so buildFreeLayout's p{i}
 * numbering keeps everyone's id that can be kept.
 */
export function finishFree(d: FreeDraft, W: number, H: number): Finished | null {
  const fin = finalIds(d.seats.map((s) => s.playerId));
  const order = d.seats.map((_, i) => i).sort((a, b) => Number(fin[a].slice(1)) - Number(fin[b].slice(1)));
  const seats = order.map((i) => d.seats[i]);
  const drawn = d.drawn ? order.map((i) => d.drawn![i]) : null;
  const raw = drawn ?? powerCells(seats);
  if (raw.some((rp) => !cellInfo(rp, W, H).ok)) return null;
  const facings = seats.map((s, i) => s.rot ?? cellInfo(raw[i], W, H).auto);
  const layout = buildFreeLayout(seats, "Freeform", facings, drawn ?? undefined);
  return { layout, keep: seats.map((s) => (isNew(s.playerId) ? null : s.playerId)) };
}

/** Put a grid layout's tiles under the draft's players, in seat order. */
export function gridFromTemplate(tpl: Grid, ids: string[], newId: () => string): GridDraft {
  const n = tpl.placements.length;
  const kept = ids.slice(0, n);
  while (kept.length < n) kept.push(newId());
  return gridDraft({ ...tpl, placements: tpl.placements.map((p, i) => ({ ...p, playerId: kept[i] })) });
}

const place = (seat: number, row: number, col: number, rotation: Rotation, rowSpan = 1, colSpan = 1): Placement => ({
  playerId: `p${seat}`,
  row,
  col,
  rowSpan,
  colSpan,
  rotation,
});

/** Other common grids beside each count's standard one. */
const VARIANTS: Record<number, { name: string; rows: number; cols: number; placements: Placement[] }[]> = {
  2: [{ name: "Side by side", rows: 1, cols: 2, placements: [place(0, 1, 1, 90), place(1, 1, 2, 270)] }],
  3: [{ name: "Wide top", rows: 2, cols: 2, placements: [place(0, 1, 1, 180, 1, 2), place(1, 2, 1, 90), place(2, 2, 2, 270)] }],
  4: [
    {
      name: "Ends",
      rows: 3,
      cols: 2,
      placements: [place(0, 1, 1, 180, 1, 2), place(1, 2, 1, 90), place(2, 2, 2, 270), place(3, 3, 1, 0, 1, 2)],
    },
  ],
  5: [
    {
      name: "Wide top",
      rows: 3,
      cols: 2,
      placements: [place(0, 1, 1, 180, 1, 2), place(1, 2, 1, 90), place(2, 2, 2, 270), place(3, 3, 1, 90), place(4, 3, 2, 270)],
    },
  ],
  6: [
    {
      name: "Ends",
      rows: 4,
      cols: 2,
      placements: [
        place(0, 1, 1, 180, 1, 2),
        place(1, 2, 1, 90),
        place(2, 2, 2, 270),
        place(3, 3, 1, 90),
        place(4, 3, 2, 270),
        place(5, 4, 1, 0, 1, 2),
      ],
    },
  ],
};

/** Built-in grids for n players: the standard one first. */
export function gridPresetsFor(n: number): LayoutConfig[] {
  const std = { ...defaultLayoutFor(n), name: "Standard" };
  return [
    std,
    ...(VARIANTS[n] ?? []).map((v, i) => ({ id: `grid-${n}-${i}`, playerCount: n, builtIn: true, ...v })),
  ];
}

/** Same tiles, same facings, whoever sits where. */
export function sameGrid(a: Grid, b: Grid): boolean {
  const anon = (g: Grid): Grid => ({ ...g, placements: g.placements.map((p, i) => ({ ...p, playerId: `s${i}` })) });
  const sorted = (g: Grid): Grid => ({
    ...g,
    placements: [...g.placements].sort((p, q) => p.row - q.row || p.col - q.col),
  });
  return geomKey(anon(sorted(a)), true) === geomKey(anon(sorted(b)), true);
}
