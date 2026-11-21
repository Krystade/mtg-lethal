import { useEffect, useReducer, useRef, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { useStore } from "../state/store";
import { useLayoutEdit } from "./layoutEdit";
import { colorForSeat, freeSeatColour, textOn } from "../layout/colors";
import { playerColour } from "../layout/looks";
import { cellInfo, powerCells, roundPoly, type CellInfo, type Pt, type Rect } from "../layout/power";
import {
  BUILTIN_TEMPLATES,
  MAX_SEATS,
  seatsFromLayout,
  shrinkToMarkers,
  templateSeats,
} from "../layout/freeform";
import {
  draftFromLayout,
  finishFree,
  finishGrid,
  freeToGrid,
  gridFromTemplate,
  gridPresetsFor,
  gridToFree,
  lastSeat,
  sameGrid,
  standardGrid,
  swapInGrid,
  turnInGrid,
  type Draft,
  type GridDraft,
} from "../layout/arrange";
import { pxRects } from "../layout/table";
import type { FreeSeat, FreeTemplate, LayoutConfig, Rotation } from "../state/types";
import { MIN_TILE, SEAT_GAP as GAP, fillSpot as fillSpotPx, overlap, padded } from "../layout/seatFill";

/**
 * The one Layout screen, over the live board: a Grid | Freeform switch,
 * Players − N +, a strip of templates for the mode, Undo, Save, Cancel and
 * Done. Grid: drag a tile onto another to swap seats, ⟳ turns a tile. Freeform:
 * drag seats, resize them (pinch, wheel, edge and corner grips), turn them
 * (twist, Shift+wheel, ⟳), remove (−) and add seats, with a live
 * power-diagram preview. Everything is a draft until Done. Life buttons
 * underneath are covered, so inert.
 */

const SNAP = 8;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const normDeg = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const snapQuad = (a: number) => ((((Math.round(a / 90) * 90) % 360) + 360) % 360) as Rotation;
const polyCss = (poly: Pt[]) => "polygon(" + poly.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(",") + ")";

interface Guide {
  ax: "x" | "y";
  pos: number;
}

interface Gesture {
  multi: boolean;
  pointers: Map<number, Pt>;
  br: DOMRect;
  move: () => void;
  end: () => void;
  rebase?: () => void;
}

interface EdState {
  mode: "grid" | "free";
  /** Freeform seats; also kept (stale) in grid mode, and unused there. */
  seats: FreeSeat[];
  /** Cells to draw instead of the seats' power cells, while drawnKey still matches the seats. */
  drawn: Pt[][] | null;
  drawnKey: string;
  grid: GridDraft;
  /** The tile being dragged in grid mode, and where it is over. */
  gridDrag: { pid: string; dx: number; dy: number; over: string | null } | null;
  /** Freeform -> Grid remembers the freeform board, to put back if the grid is not touched. */
  lastFree: { grid: string; free: string } | null;
  /** The draft as it opened, so Done with nothing changed leaves the game alone. */
  opened: string;
  history: string[];
  held: string | null;
  guides: Guide[];
  previewRot: number | null;
  wheel: boolean;
  seq: number;
  auto: Map<string, Rotation>;
  gest: Gesture | null;
  toast: string;
  toastTimer: number;
}

interface Props {
  W: number;
  H: number;
  /** The board's gap between grid tiles, px. */
  gap?: number;
}

const geomOf = (seats: FreeSeat[]) => JSON.stringify(seats.map((s) => [s.playerId, s.x, s.y, s.w, s.h]));
const FACE_SIDE = { 0: "bottom", 90: "left", 180: "top", 270: "right" } as const;

export function LayoutEditor({ W, H, gap = 8 }: Props) {
  const layout = useStore((s) => s.game.layout);
  const players = useStore((s) => s.game.players);
  const templates = useStore((s) => s.freeTemplates);
  const customLayouts = useStore((s) => s.customLayouts);
  const applyFreeform = useStore((s) => s.applyFreeform);
  const saveFreeTemplate = useStore((s) => s.saveFreeTemplate);
  const deleteFreeTemplate = useStore((s) => s.deleteFreeTemplate);
  const saveCustomLayout = useStore((s) => s.saveCustomLayout);
  const deleteCustomLayout = useStore((s) => s.deleteCustomLayout);
  const stop = useLayoutEdit((s) => s.stop);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const rootRef = useRef<HTMLDivElement>(null);
  const dims = useRef({ W, H });
  dims.current = { W, H };

  const stRef = useRef<EdState | null>(null);
  if (!stRef.current) {
    const d: Draft = draftFromLayout(layout);
    const seats = d.mode === "free" ? d.seats : seatsFromLayout(layout);
    const init: EdState = {
      mode: d.mode,
      seats,
      drawn: d.mode === "free" ? d.drawn : null,
      drawnKey: geomOf(seats),
      grid: d.mode === "grid" ? d : freeToGrid({ mode: "free", seats, drawn: null }),
      gridDrag: null,
      lastFree: null,
      opened: "",
      history: [],
      held: null,
      guides: [],
      previewRot: null,
      wheel: false,
      seq: 0,
      auto: new Map(),
      gest: null,
      toast: "",
      toastTimer: 0,
    };
    stRef.current = init;
  }
  const st = stRef.current;

  // ---- identity: existing players keep theirs, new seats get a free colour ----
  // Both read the colour a player's tile shows, not their seat default, so a
  // recoloured player looks right here and a new seat never copies them. The
  // choice for a new seat mirrors applyFreeform's, so Confirm keeps it.
  const byId = new Map(players.map((p) => [p.id, p]));
  const colorOf = (() => {
    const seatIdsNow = st.mode === "grid" ? st.grid.placements.map((p) => p.playerId) : st.seats.map((s) => s.playerId);
    const used = new Set(seatIdsNow.filter((id) => byId.has(id)).map((id) => playerColour(byId.get(id)!)));
    const out = new Map<string, string>();
    for (const id of seatIdsNow) {
      const p = byId.get(id);
      if (p) out.set(id, playerColour(p));
      else {
        const c = freeSeatColour(used, out.size);
        used.add(c);
        out.set(id, c);
      }
    }
    return out;
  })();

  // ---- helpers over unit seats, in board px ----
  const pxOf = (t: FreeSeat): Rect => ({ x: t.x * dims.current.W, y: t.y * dims.current.H, w: t.w * dims.current.W, h: t.h * dims.current.H });
  const setPx = (t: FreeSeat, r: Rect) => {
    t.x = r.x / dims.current.W;
    t.y = r.y / dims.current.H;
    t.w = r.w / dims.current.W;
    t.h = r.h / dims.current.H;
  };
  // The whole draft, for undo: mode, seats (and the cells they draw) and grid.
  const snap = () =>
    JSON.stringify({ mode: st.mode, seats: st.seats, drawn: st.drawn, drawnKey: st.drawnKey, grid: st.grid, lastFree: st.lastFree });
  const restore = (s: string) => {
    const v = JSON.parse(s);
    st.mode = v.mode;
    st.seats = v.seats;
    st.drawn = v.drawn;
    st.drawnKey = v.drawnKey;
    st.grid = v.grid;
    st.lastFree = v.lastFree;
  };
  const commit = (before: string) => {
    // A seat moved, resized, added or removed: its cell follows it from now on.
    if (st.drawn && geomOf(st.seats) !== st.drawnKey) st.drawn = null;
    if (snap() !== before) st.history.push(before);
  };
  if (!st.opened) st.opened = snap();
  const toast = (msg: string) => {
    st.toast = msg;
    window.clearTimeout(st.toastTimer);
    st.toastTimer = window.setTimeout(() => {
      st.toast = "";
      force();
    }, 1700);
    force();
  };
  const effRot = (t: FreeSeat): number => t.rot ?? st.auto.get(t.playerId) ?? 0;
  const setRot = (t: FreeSeat, rot: number) => {
    const r = (((rot % 360) + 360) % 360) as Rotation;
    t.rot = st.auto.get(t.playerId) === r ? null : r;
  };

  function snapTargets(pid: string) {
    const { W: SW, H: SH } = dims.current;
    type C = { v: number; g: number };
    const xs: { lo: C[]; hi: C[]; mid: C[] } = { lo: [{ v: 0, g: 0 }], hi: [{ v: SW, g: SW }], mid: [{ v: SW / 2, g: SW / 2 }] };
    const ys: { lo: C[]; hi: C[]; mid: C[] } = { lo: [{ v: 0, g: 0 }], hi: [{ v: SH, g: SH }], mid: [{ v: SH / 2, g: SH / 2 }] };
    for (const t of st.seats) {
      if (t.playerId === pid) continue;
      const o = pxOf(t);
      xs.lo.push({ v: o.x, g: o.x }, { v: o.x + o.w + GAP, g: o.x + o.w + GAP / 2 });
      xs.hi.push({ v: o.x + o.w, g: o.x + o.w }, { v: o.x - GAP, g: o.x - GAP / 2 });
      ys.lo.push({ v: o.y, g: o.y }, { v: o.y + o.h + GAP, g: o.y + o.h + GAP / 2 });
      ys.hi.push({ v: o.y + o.h, g: o.y + o.h }, { v: o.y - GAP, g: o.y - GAP / 2 });
      // A seat's centre is its site, so line centres up too.
      xs.mid.push({ v: o.x + o.w / 2, g: o.x + o.w / 2 });
      ys.mid.push({ v: o.y + o.h / 2, g: o.y + o.h / 2 });
    }
    return { xs, ys };
  }
  function nearestSnap(val: number, list: { v: number; g: number }[]) {
    let best: { d: number; g: number } | null = null;
    for (const c of list) {
      const d = c.v - val;
      if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, g: c.g };
    }
    return best;
  }
  function snapRect(r: Rect, pid: string, kind: "move" | "edges", edges = "") {
    const { W: SW, H: SH } = dims.current;
    const { xs, ys } = snapTargets(pid);
    const guides: Guide[] = [];
    r = { ...r };
    if (kind === "move") {
      for (const ax of ["x", "y"] as const) {
        const T = ax === "x" ? xs : ys;
        const size = ax === "x" ? r.w : r.h;
        const opts = [nearestSnap(r[ax], T.lo), nearestSnap(r[ax] + size, T.hi), nearestSnap(r[ax] + size / 2, T.mid)].filter(
          (o): o is { d: number; g: number } => !!o,
        );
        if (!opts.length) continue;
        opts.sort((p, q) => Math.abs(p.d) - Math.abs(q.d));
        const pick = opts[0];
        r[ax] += pick.d;
        for (const o of opts) if (Math.abs(o.d - pick.d) < 0.6) guides.push({ ax, pos: o.g });
      }
    } else {
      let L = r.x;
      let R = r.x + r.w;
      let T = r.y;
      let B = r.y + r.h;
      const take = (val: number, list: { v: number; g: number }[], ax: "x" | "y") => {
        const s = nearestSnap(val, list);
        if (s) {
          guides.push({ ax, pos: s.g });
          return val + s.d;
        }
        return val;
      };
      if (edges.includes("l")) L = take(L, xs.lo, "x");
      if (edges.includes("r")) R = take(R, xs.hi, "x");
      if (edges.includes("t")) T = take(T, ys.lo, "y");
      if (edges.includes("b")) B = take(B, ys.hi, "y");
      if (R - L >= MIN_TILE && B - T >= MIN_TILE) r = { x: L, y: T, w: R - L, h: B - T };
    }
    r.w = Math.min(r.w, SW);
    r.h = Math.min(r.h, SH);
    r.x = clamp(r.x, 0, SW - r.w);
    r.y = clamp(r.y, 0, SH - r.h);
    return { r, guides };
  }
  /** After a drop: slide off any seat it landed on, else go back. */
  function settle(t: FreeSeat, fallback: Rect) {
    const { W: SW, H: SH } = dims.current;
    const r = pxOf(t);
    const others = st.seats.filter((o) => o !== t).map(pxOf);
    if (!others.some((o) => overlap(r, o))) return;
    const cands: Rect[] = [];
    for (const o of others)
      if (overlap(r, o))
        cands.push({ ...r, x: o.x - GAP - r.w }, { ...r, x: o.x + o.w + GAP }, { ...r, y: o.y - GAP - r.h }, { ...r, y: o.y + o.h + GAP });
    const ok = cands.filter(
      (c) => c.x >= -0.5 && c.y >= -0.5 && c.x + c.w <= SW + 0.5 && c.y + c.h <= SH + 0.5 && !others.some((o) => overlap(c, o)),
    );
    ok.sort((a, b) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y));
    if (ok.length) setPx(t, ok[0]);
    else {
      setPx(t, fallback);
      toast("No room there — put it back");
    }
  }

  function beginGesture(g: Gesture, e: PointerEvent) {
    g.pointers = new Map([[e.pointerId, { x: e.clientX, y: e.clientY }]]);
    g.br = rootRef.current!.getBoundingClientRect();
    st.gest = g;
    g.rebase?.();
  }
  const local = (g: Gesture, p: Pt) => ({ x: p.x - g.br.left, y: p.y - g.br.top });

  function startDrag(t: FreeSeat, e: PointerEvent) {
    const before = snap();
    const start = pxOf(t);
    let base = { rect: start, rot: effRot(t), pts: [] as Pt[] };
    let twisting = false;
    const g: Gesture = {
      multi: true,
      pointers: new Map(),
      br: new DOMRect(),
      rebase: () => {
        if (st.previewRot != null) {
          setRot(t, snapQuad(st.previewRot));
          st.previewRot = null;
        }
        twisting = false;
        base = { rect: pxOf(t), rot: effRot(t), pts: [...g.pointers.values()].map((p) => local(g, p)) };
      },
      move: () => {
        const { W: SW, H: SH } = dims.current;
        const pts = [...g.pointers.values()].map((p) => local(g, p));
        let res;
        if (pts.length === 1 || base.pts.length < 2) {
          const dx = pts[0].x - base.pts[0].x;
          const dy = pts[0].y - base.pts[0].y;
          res = snapRect({ ...base.rect, x: base.rect.x + dx, y: base.rect.y + dy }, t.playerId, "move");
        } else {
          const [p0, p1] = base.pts;
          const [q0, q1] = pts;
          const s = Math.max(0.05, dist(q0, q1)) / Math.max(1, dist(p0, p1));
          const m0 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
          const m1 = { x: (q0.x + q1.x) / 2, y: (q0.y + q1.y) / 2 };
          const c0 = { x: base.rect.x + base.rect.w / 2, y: base.rect.y + base.rect.h / 2 };
          const c = { x: m1.x + (c0.x - m0.x) * s, y: m1.y + (c0.y - m0.y) * s };
          const w = clamp(base.rect.w * s, MIN_TILE, SW);
          const hh = clamp(base.rect.h * s, MIN_TILE, SH);
          res = snapRect({ x: c.x - w / 2, y: c.y - hh / 2, w, h: hh }, t.playerId, "edges", "lrtb");
          const da = normDeg(
            ((Math.atan2(q1.y - q0.y, q1.x - q0.x) - Math.atan2(p1.y - p0.y, p1.x - p0.x)) * 180) / Math.PI,
          );
          if (twisting || Math.abs(da) > 18) {
            twisting = true;
            st.previewRot = base.rot + da;
          }
        }
        setPx(t, res.r);
        st.guides = res.guides;
        st.held = t.playerId;
        force();
      },
      end: () => {
        if (st.previewRot != null) {
          setRot(t, snapQuad(st.previewRot));
          st.previewRot = null;
        }
        settle(t, start);
        st.guides = [];
        st.held = null;
        commit(before);
        force();
      },
    };
    beginGesture(g, e);
  }

  /** Drag one or more edges: "t", "r", "b", "l" or the corner "rb". */
  function startGrip(t: FreeSeat, e: PointerEvent, edges: string) {
    const before = snap();
    const start = pxOf(t);
    let base = { rect: start, p: { x: 0, y: 0 } };
    const g: Gesture = {
      multi: false,
      pointers: new Map(),
      br: new DOMRect(),
      rebase: () => {
        base = { rect: pxOf(t), p: local(g, [...g.pointers.values()][0]) };
      },
      move: () => {
        const { W: SW, H: SH } = dims.current;
        const p = local(g, [...g.pointers.values()][0]);
        const dx = p.x - base.p.x;
        const dy = p.y - base.p.y;
        let L = base.rect.x;
        let T = base.rect.y;
        let R = L + base.rect.w;
        let B = T + base.rect.h;
        if (edges.includes("l")) L = clamp(L + dx, 0, R - MIN_TILE);
        if (edges.includes("r")) R = clamp(R + dx, L + MIN_TILE, SW);
        if (edges.includes("t")) T = clamp(T + dy, 0, B - MIN_TILE);
        if (edges.includes("b")) B = clamp(B + dy, T + MIN_TILE, SH);
        const res = snapRect({ x: L, y: T, w: R - L, h: B - T }, t.playerId, "edges", edges);
        setPx(t, res.r);
        st.guides = res.guides;
        st.held = t.playerId;
        force();
      },
      end: () => {
        settle(t, start);
        st.guides = [];
        st.held = null;
        commit(before);
        force();
      },
    };
    beginGesture(g, e);
  }

  function seatDown(pid: string, e: RPointerEvent) {
    if (st.gest || e.button > 0) return;
    if ((e.target as HTMLElement).closest(".fe-badge")) return;
    const t = st.seats.find((q) => q.playerId === pid);
    if (!t) return;
    e.preventDefault();
    const grip = (e.target as HTMLElement).closest<HTMLElement>("[data-edges]");
    if (grip) startGrip(t, e.nativeEvent, grip.dataset.edges!);
    else startDrag(t, e.nativeEvent);
  }

  /** Grow or shrink a seat about its centre, never into a neighbour or off the board. */
  function resizeAbout(t: FreeSeat, f: number) {
    const { W: SW, H: SH } = dims.current;
    const r = pxOf(t);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    f = clamp(f, Math.min(1, Math.max(MIN_TILE / r.w, MIN_TILE / r.h)), Math.max(1, Math.min(SW / r.w, SH / r.h)));
    const others = st.seats.filter((o) => o !== t).map(pxOf);
    const at = (k: number): Rect => {
      const w = r.w * k;
      const hh = r.h * k;
      return { x: clamp(cx - w / 2, 0, SW - w), y: clamp(cy - hh / 2, 0, SH - hh), w, h: hh };
    };
    const clear = (c: Rect) => !others.some((o) => overlap(c, padded(o)));
    let c = at(f);
    if (f > 1 && !clear(c)) {
      let lo = 1;
      let hi = f;
      for (let i = 0; i < 14; i++) {
        const m = (lo + hi) / 2;
        if (clear(at(m))) lo = m;
        else hi = m;
      }
      c = at(lo);
    }
    setPx(t, c);
  }

  /** Where a new seat goes: see layout/seatFill. */
  const fillSpot = () => fillSpotPx(st.seats.map(pxOf), dims.current.W, dims.current.H);

  // ---- actions ----
  const addSeat = () => {
    if (st.seats.length >= MAX_SEATS) return;
    const before = snap();
    const fs = fillSpot();
    if (!fs) {
      toast("No room for another seat");
      return;
    }
    st.seats.forEach((t, i) => setPx(t, fs.rects[i]));
    const t: FreeSeat = { playerId: `new${++st.seq}`, x: 0, y: 0, w: 0, h: 0, rot: null };
    setPx(t, fs.spot);
    st.seats.push(t);
    commit(before);
    force();
  };
  const removeSeat = (pid: string) => {
    if (st.mode === "grid") {
      const ids = st.grid.placements.map((p) => p.playerId);
      if (ids.length <= 1) return;
      const before = snap();
      st.grid = standardGrid(ids.filter((id) => id !== pid));
      commit(before);
      force();
      return;
    }
    if (st.seats.length <= 1) return;
    const before = snap();
    st.seats = st.seats.filter((t) => t.playerId !== pid);
    commit(before);
    force();
  };
  const rotateSeat = (pid: string) => {
    const before = snap();
    if (st.mode === "grid") st.grid = turnInGrid(st.grid, pid);
    else {
      const t = st.seats.find((q) => q.playerId === pid);
      if (!t) return;
      setRot(t, effRot(t) + 90);
    }
    commit(before);
    force();
  };
  const undo = () => {
    const s = st.history.pop();
    if (s) {
      restore(s);
      force();
    }
  };
  const ids = () => (st.mode === "grid" ? st.grid.placements.map((p) => p.playerId) : st.seats.map((s) => s.playerId));
  /** Players − / +: a grid goes to the standard grid for the new count; freeform fills a gap. */
  const stepPlayers = (delta: 1 | -1) => {
    const cur = ids();
    const n = cur.length + delta;
    if (n < 1 || n > MAX_SEATS) return;
    if (delta < 0) return removeSeat(lastSeat(cur));
    if (st.mode === "free") return addSeat();
    const before = snap();
    st.grid = standardGrid([...cur, `new${++st.seq}`]);
    commit(before);
    force();
  };
  /** The Grid | Freeform switch. */
  const setMode = (mode: "grid" | "free") => {
    if (mode === st.mode) return;
    const before = snap();
    if (mode === "grid") {
      const free = JSON.stringify({ seats: st.seats, drawn: st.drawn, drawnKey: st.drawnKey });
      st.grid = freeToGrid({ mode: "free", seats: st.seats, drawn: st.drawn });
      st.lastFree = { grid: JSON.stringify(st.grid), free };
    } else {
      const back = st.lastFree && st.lastFree.grid === JSON.stringify(st.grid) ? JSON.parse(st.lastFree.free) : null;
      if (back) {
        // Straight back from the standard grid: the freeform board it replaced.
        st.seats = back.seats;
        st.drawn = back.drawn;
        st.drawnKey = back.drawnKey;
      } else {
        const d = gridToFree(st.grid, dims.current.W, dims.current.H);
        st.seats = d.seats;
        st.drawn = d.drawn;
        st.drawnKey = geomOf(d.seats);
      }
      st.lastFree = null;
    }
    st.mode = mode;
    st.gridDrag = null;
    commit(before);
    force();
  };
  const applyTemplate = (t: FreeTemplate) => {
    const before = snap();
    const next = templateSeats(t);
    const cur = ids();
    st.seats = next.map((s, i) => ({ ...s, playerId: cur[i] ?? `new${++st.seq}` }));
    commit(before);
    toast(`Applied “${t.name}”`);
  };
  const applyGrid = (l: LayoutConfig) => {
    const before = snap();
    st.grid = gridFromTemplate(l, ids(), () => `new${++st.seq}`);
    commit(before);
    toast(`Applied “${l.name}”`);
  };
  const save = () => {
    if (st.mode === "grid") {
      const r = saveCustomLayout(finishGrid(st.grid).layout);
      toast(r.fresh ? `Saved as “${r.name}”` : `Already saved as “${r.name}”`);
      return;
    }
    const r = saveFreeTemplate(st.seats);
    toast(r.fresh ? `Saved as “${r.name}”` : `Already saved as “${r.name}”`);
  };
  const confirm = () => {
    if (snap() === st.opened) return stop();
    if (st.mode === "grid") {
      const f = finishGrid(st.grid);
      applyFreeform(f.layout, f.keep);
      return stop();
    }
    const live = st.drawn && geomOf(st.seats) === st.drawnKey ? st.drawn : null;
    const f = finishFree({ mode: "free", seats: st.seats, drawn: live }, W, H);
    if (!f) {
      toast("A seat has too little room — grow it or move it");
      return;
    }
    applyFreeform(f.layout, f.keep);
    stop();
  };

  /** Grid mode: hold a tile and drop it on another to swap the two seats. */
  function gridDown(pid: string, e: RPointerEvent) {
    if (st.gest || e.button > 0) return;
    if ((e.target as HTMLElement).closest(".fe-badge")) return;
    e.preventDefault();
    const before = snap();
    let start: Pt = { x: 0, y: 0 };
    const g: Gesture = {
      multi: false,
      pointers: new Map(),
      br: new DOMRect(),
      rebase: () => {
        start = local(g, [...g.pointers.values()][0]);
      },
      move: () => {
        const p = local(g, [...g.pointers.values()][0]);
        const rects = pxRects(st.grid, dims.current.W, dims.current.H, gap);
        const over = Object.entries(rects).find(([, r]) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)?.[0] ?? null;
        st.gridDrag = { pid, dx: p.x - start.x, dy: p.y - start.y, over: over === pid ? null : over };
        force();
      },
      end: () => {
        const d = st.gridDrag;
        st.gridDrag = null;
        if (d?.over) st.grid = swapInGrid(st.grid, pid, d.over);
        commit(before);
        force();
      },
    };
    beginGesture(g, e.nativeEvent);
  }

  // ---- window-level pointer tracking, so re-renders never drop a gesture ----
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const g = st.gest;
      if (!g || !g.pointers.has(e.pointerId)) return;
      if (e.cancelable) e.preventDefault();
      g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      g.move();
    };
    const onEnd = (e: PointerEvent) => {
      const g = st.gest;
      if (!g || !g.pointers.has(e.pointerId)) return;
      g.pointers.delete(e.pointerId);
      if (!g.pointers.size) {
        st.gest = null;
        g.end();
      } else g.rebase?.();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (st.gest && e.cancelable) e.preventDefault();
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      window.removeEventListener("touchmove", onTouchMove, { capture: true });
      window.clearTimeout(st.toastTimer);
    };
  }, [st]);

  // A second finger anywhere on the board joins the gesture holding a seat;
  // mouse wheel resizes (Shift: turns) the seat under the pointer.
  const wheelRef = useRef({ pid: null as string | null, kind: "", before: "", acc: 0, rotAt: 0, timer: 0 });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onDownCapture = (e: PointerEvent) => {
      const g = st.gest;
      if (g && g.multi && g.pointers.size === 1 && !g.pointers.has(e.pointerId)) {
        e.preventDefault();
        e.stopPropagation();
        g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        g.rebase?.();
      }
    };
    const endWheel = () => {
      const w = wheelRef.current;
      window.clearTimeout(w.timer);
      if (w.before) commit(w.before);
      w.before = "";
      w.pid = null;
      if (st.wheel) {
        st.wheel = false;
        force();
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (st.gest) return;
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-pid]");
      const t = el && st.seats.find((q) => q.playerId === el.dataset.pid);
      if (!t) return;
      e.preventDefault();
      // Chromium on Windows turns Shift+wheel into horizontal scrolling.
      let d = e.deltaY || e.deltaX;
      if (e.deltaMode === 1) d *= 33;
      else if (e.deltaMode === 2) d *= 400;
      if (!d) return;
      const w = wheelRef.current;
      const kind = e.shiftKey ? "rot" : "size";
      const now = performance.now();
      if (w.pid !== t.playerId || w.kind !== kind) {
        endWheel();
        w.pid = t.playerId;
        w.kind = kind;
        w.before = snap();
        w.acc = 0;
      }
      if (kind === "rot") {
        w.acc += d;
        if (Math.abs(w.acc) >= 40 && now - w.rotAt > 140) {
          setRot(t, effRot(t) + (w.acc > 0 ? 90 : -90));
          w.acc = 0;
          w.rotAt = now;
        }
      } else resizeAbout(t, Math.exp(-d * 0.0012));
      st.wheel = true;
      window.clearTimeout(w.timer);
      w.timer = window.setTimeout(endWheel, 280);
      force();
    };
    root.addEventListener("pointerdown", onDownCapture, true);
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      root.removeEventListener("pointerdown", onDownCapture, true);
      root.removeEventListener("wheel", onWheel);
    };
    // The handlers read everything through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st]);

  // ---- render ----
  const grid = st.mode === "grid";
  const seats = grid ? [] : st.seats;
  const drawnNow = st.drawn && geomOf(st.seats) === st.drawnKey ? st.drawn : null;
  const raw = W > 0 ? drawnNow ?? powerCells(seats) : [];
  const cells: CellInfo[] = raw.map((rp) => cellInfo(rp, W, H));
  seats.forEach((t, i) => st.auto.set(t.playerId, cells[i]?.auto ?? 0));
  const rects = seats.map(pxOf);
  const bad = new Set<string>();
  rects.forEach((a, i) =>
    rects.forEach((b, j) => {
      if (i < j && overlap(a, b)) {
        bad.add(seats[i].playerId);
        bad.add(seats[j].playerId);
      }
    }),
  );
  cells.forEach((c, i) => {
    if (!c.ok) bad.add(seats[i].playerId);
  });
  const live = !!st.held || st.wheel || !!st.gridDrag;
  const n = grid ? st.grid.placements.length : st.seats.length;
  const builtins = BUILTIN_TEMPLATES;
  // Templates for the mode: this many players first.
  const byCount = <T,>(xs: T[], count: (x: T) => number) => [
    ...xs.filter((x) => count(x) === n),
    ...xs.filter((x) => count(x) !== n),
  ];
  const savedGrids = byCount(
    customLayouts.filter((l) => !l.cells),
    (l) => l.placements.length,
  );
  const savedFree = customLayouts.filter((l) => l.cells?.length);
  const freeChips: { t: FreeTemplate; del?: () => void }[] = byCount(
    [
      ...builtins.map((t) => ({ t })),
      ...templates.map((t) => ({ t, del: () => deleteFreeTemplate(t.id) })),
      ...savedFree.map((l) => ({
        t: { id: l.id, name: l.name, seats: seatsFromLayout(l).map(({ playerId: _p, ...s }) => s) },
        del: () => deleteCustomLayout(l.id),
      })),
    ],
    (c) => c.t.seats.length,
  );
  const gridRects = grid && W > 0 ? pxRects(st.grid, W, H, gap) : {};

  return (
    <div className={`fe fe--${st.mode}${live ? " is-live" : ""}`} ref={rootRef}>
      <div className="fe-top">
        <div className="fe-seg" role="radiogroup" aria-label="Layout mode">
          {(["grid", "free"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={st.mode === m}
              className={`fe-seg__opt${st.mode === m ? " is-on" : ""}`}
              onClick={() => setMode(m)}
            >
              {m === "grid" ? "▦ Grid" : "✥ Freeform"}
            </button>
          ))}
        </div>
        <div className="fe-step" aria-label="Players">
          <button type="button" className="fe-btn fe-btn--icon" aria-label="remove player" disabled={n <= 1} onClick={() => stepPlayers(-1)}>
            −
          </button>
          <span className="fe-step__n" aria-label="player count">
            {n}
            <small>players</small>
          </span>
          <button type="button" className="fe-btn fe-btn--icon" aria-label="add player" disabled={n >= MAX_SEATS} onClick={() => stepPlayers(1)}>
            +
          </button>
        </div>
      </div>

      {grid &&
        st.grid.placements.map((p) => {
          const r = gridRects[p.playerId];
          if (!r) return null;
          const color = colorOf.get(p.playerId) ?? "#888";
          const player = byId.get(p.playerId);
          const held = st.gridDrag?.pid === p.playerId ? st.gridDrag : null;
          const fw = p.rotation % 180 ? r.h : r.w;
          const fh = p.rotation % 180 ? r.w : r.h;
          return (
            <div
              key={`g-${p.playerId}`}
              className={`ge-tile${held ? " is-held" : ""}${st.gridDrag?.over === p.playerId ? " is-target" : ""}`}
              data-pid={p.playerId}
              data-face={FACE_SIDE[p.rotation]}
              style={
                {
                  left: r.x,
                  top: r.y,
                  width: r.w,
                  height: r.h,
                  background: color,
                  color: textOn(color),
                  transform: held ? `translate(${held.dx}px, ${held.dy}px) scale(0.82)` : undefined,
                } as CSSProperties
              }
              onPointerDown={(e) => gridDown(p.playerId, e)}
            >
              <div className="fe-face" style={{ left: r.w / 2, top: r.h / 2 }}>
                <div
                  className="fe-face__in"
                  style={
                    {
                      width: fw,
                      height: fh,
                      transform: `translate(-50%, -50%) rotate(${p.rotation}deg)`,
                      "--fs": `${clamp(0.3 * Math.min(fw, fh), 22, 120)}px`,
                    } as CSSProperties
                  }
                >
                  <span className="fe-face__life">{player ? player.life : "new"}</span>
                  <span className="fe-face__name">{player ? player.name : "New player"}</span>
                </div>
              </div>
              {n > 1 && (
                <button
                  type="button"
                  className="fe-badge fe-badge--del"
                  aria-label={`remove ${player?.name ?? "new player"}`}
                  onClick={() => removeSeat(p.playerId)}
                >
                  −
                </button>
              )}
              <button
                type="button"
                className="fe-badge fe-badge--rot"
                aria-label={`turn ${player?.name ?? "new player"} to face the next side`}
                onClick={() => rotateSeat(p.playerId)}
              >
                ⟳
              </button>
            </div>
          );
        })}

      {seats.map((t, i) => {
        const c = cells[i];
        if (!c || c.poly.length < 3) return null;
        const xs = c.poly.map((p) => p.x);
        const ys = c.poly.map((p) => p.y);
        const bx = Math.min(...xs);
        const by = Math.min(...ys);
        const color = colorOf.get(t.playerId) ?? "#888";
        const player = byId.get(t.playerId);
        const preview = st.held === t.playerId && st.previewRot != null ? st.previewRot : null;
        const rot = preview ?? effRot(t);
        const q = snapQuad(rot);
        const fw = q % 180 ? c.rect.h : c.rect.w;
        const fh = q % 180 ? c.rect.w : c.rect.h;
        return (
          <div
            key={`c-${t.playerId}`}
            className={`fe-cell${bad.has(t.playerId) ? " is-bad" : ""}`}
            data-pid={t.playerId}
            style={
              {
                left: bx,
                top: by,
                width: Math.max(...xs) - bx,
                height: Math.max(...ys) - by,
                background: color,
                color: textOn(color),
                clipPath: polyCss(roundPoly(c.poly, 20).map((p) => ({ x: p.x - bx, y: p.y - by }))),
              } as CSSProperties
            }
            onPointerDown={(e) => seatDown(t.playerId, e)}
          >
            <div
              className="fe-face"
              style={{ left: c.rect.x - bx + c.rect.w / 2, top: c.rect.y - by + c.rect.h / 2 }}
            >
              <div
                className="fe-face__in"
                style={
                  {
                    width: fw,
                    height: fh,
                    transform: `translate(-50%, -50%) rotate(${rot}deg)`,
                    "--fs": `${clamp(0.38 * Math.min(fw, fh), 22, 160)}px`,
                  } as CSSProperties
                }
              >
                <span className="fe-face__life">{player ? player.life : "new"}</span>
                <span className="fe-face__name">{player ? player.name : "New player"}</span>
              </div>
            </div>
          </div>
        );
      })}
      {seats.map((t, i) => {
        const r = rects[i];
        const color = colorOf.get(t.playerId) ?? "#888";
        const preview = st.held === t.playerId && st.previewRot != null ? st.previewRot : null;
        const face = preview != null ? FACE_SIDE[snapQuad(preview)] : undefined;
        return (
          <div
            key={`s-${t.playerId}`}
            className={`fe-seat${st.held === t.playerId ? " is-held" : ""}${bad.has(t.playerId) ? " is-bad" : ""}`}
            data-pid={t.playerId}
            data-face={face}
            style={{ left: r.x, top: r.y, width: r.w, height: r.h, "--c": color } as CSSProperties}
            onPointerDown={(e) => seatDown(t.playerId, e)}
          >
            <span className="fe-dot" />
            {seats.length > 1 && (
              <button
                type="button"
                className="fe-badge fe-badge--del"
                aria-label={`remove ${byId.get(t.playerId)?.name ?? "new player"}`}
                onClick={() => removeSeat(t.playerId)}
              >
                −
              </button>
            )}
            <button
              type="button"
              className="fe-badge fe-badge--rot"
              aria-label={`turn ${byId.get(t.playerId)?.name ?? "new player"} to face the next side`}
              onClick={() => rotateSeat(t.playerId)}
            >
              ⟳
            </button>
            <div className="fe-grip" data-edges="rb" aria-label="resize from the corner" />
            {(["t", "r", "b", "l"] as const).map((s) => (
              <div key={s} className={`fe-edge fe-edge--${s}`} data-edges={s} aria-label="resize this side" />
            ))}
          </div>
        );
      })}
      {st.guides.map((g, i) => (
        <div key={i} className={`fe-guide fe-guide--${g.ax}`} style={g.ax === "x" ? { left: g.pos } : { top: g.pos }} />
      ))}
      {st.toast && (
        <div className="fe-toast" role="status">
          {st.toast}
        </div>
      )}
      <div className="fe-bottom">
        <div className="fe-chips" aria-label={grid ? "Grid templates" : "Freeform templates"}>
          <button type="button" className="fe-chip fe-chip--save" onClick={save} aria-label="save as template">
            <span aria-hidden="true">＋</span>Save
          </button>
          {grid
            ? [
                ...gridPresetsFor(n).map((l) => ({ l, del: undefined as (() => void) | undefined })),
                ...savedGrids.map((l) => ({ l, del: () => deleteCustomLayout(l.id) })),
              ].map(({ l, del }) => (
                <span key={l.id} className="fe-chip-wrap">
                  <button
                    type="button"
                    className={`fe-chip${sameGrid(l, st.grid) ? " is-on" : ""}`}
                    onClick={() => applyGrid(l)}
                    aria-label={`template ${l.name}`}
                  >
                    <GridThumb layout={l} />
                    {l.name}
                  </button>
                  {del && (
                    <button type="button" className="fe-chip__del" aria-label={`delete template ${l.name}`} onClick={del}>
                      ✕
                    </button>
                  )}
                </span>
              ))
            : freeChips.map(({ t, del }) => (
                <span key={t.id} className="fe-chip-wrap">
                  <button type="button" className="fe-chip" onClick={() => applyTemplate(t)} aria-label={`template ${t.name}`}>
                    <Thumb tpl={t} />
                    {t.name}
                  </button>
                  {del && (
                    <button type="button" className="fe-chip__del" aria-label={`delete template ${t.name}`} onClick={del}>
                      ✕
                    </button>
                  )}
                </span>
              ))}
        </div>
        <div className="fe-actions">
          <button type="button" className="fe-btn fe-btn--undo" aria-label="undo" disabled={!st.history.length} onClick={undo}>
            ↶ Undo
          </button>
          <button type="button" className="fe-btn" aria-label="cancel" onClick={stop}>
            Cancel
          </button>
          <button type="button" className="fe-btn fe-btn--go" aria-label="done" onClick={confirm}>
            ✓ Done
          </button>
        </div>
      </div>
    </div>
  );
}

/** A tiny picture of a grid layout, tiles in seat colours. */
export function GridThumb({ layout, w = 22, h = 34 }: { layout: LayoutConfig; w?: number; h?: number }) {
  const g = 1.2;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true" className="fe-thumb">
      {layout.placements.map((p, i) => {
        const x = ((p.col - 1) / layout.cols) * w;
        const y = ((p.row - 1) / layout.rows) * h;
        const pw = (p.colSpan / layout.cols) * w;
        const ph = (p.rowSpan / layout.rows) * h;
        return <rect key={i} x={x + g / 2} y={y + g / 2} width={pw - g} height={ph - g} rx={2} fill={colorForSeat(i)} />;
      })}
    </svg>
  );
}

/** A tiny picture of a template's cells. */
export function Thumb({ tpl, w = 22, h = 34 }: { tpl: FreeTemplate; w?: number; h?: number }) {
  const raw = powerCells(shrinkToMarkers(tpl.seats));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true" className="fe-thumb">
      {raw.map((c, i) =>
        c.length >= 3 ? (
          <polygon
            key={i}
            points={c.map((p) => `${(p.x * w).toFixed(2)},${(p.y * h).toFixed(2)}`).join(" ")}
            fill={colorForSeat(i)}
            stroke="#000"
            strokeWidth="0.7"
            strokeLinejoin="round"
          />
        ) : null,
      )}
    </svg>
  );
}
