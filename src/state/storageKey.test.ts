import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultLayoutFor } from "../layout/presets";
import { LEGACY_STORAGE_KEY, STORAGE_KEY, migrateStorageKey } from "./storageKey";

// The app was renamed, and its localStorage key with it. Everyone who already
// had a game saved has it under the old key; these pin that it follows them.

/** A saved game, recognisable by its life totals. */
function save(life: number) {
  return JSON.stringify({
    state: {
      game: {
        players: Array.from({ length: 4 }, (_, i) => ({
          id: `p${i}`,
          name: `P${i + 1}`,
          color: "#e4b33d",
          life: life + i,
          counters: { tax: 0, poison: 0, energy: 0, experience: 0, storm: 0, charge: 0, custom: [] },
          commanderDamage: {},
          eliminated: false,
        })),
        startingLife: 40,
        layout: { ...defaultLayoutFor(4) },
        turn: { activePlayerId: "p2", turnNumber: 3, budgetSec: 300, remainingSec: 120, running: false, expired: false },
        gameElapsedSec: 10,
        gameTimerRunning: false,
        stickers: [],
        log: [],
      },
      settings: {},
      customLayouts: [],
      profiles: [],
      setups: [],
    },
    version: 2,
  });
}

/** The store as a fresh page load builds it, from whatever storage holds now. */
async function boot() {
  vi.resetModules();
  const { useStore } = await import("./store");
  return useStore;
}

const lives = (raw: string | null) =>
  (JSON.parse(raw ?? "null")?.state.game.players ?? []).map((p: { life: number }) => p.life);

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("the saved game follows the rename", () => {
  it("names the keys", () => {
    expect(STORAGE_KEY).toBe("mtg-lethal");
    expect(LEGACY_STORAGE_KEY).toBe("lotus-tracker");
  });

  it("old key only: the game is carried over and the old key is removed", async () => {
    const old = save(11);
    localStorage.setItem(LEGACY_STORAGE_KEY, old);

    const useStore = await boot();

    expect(useStore.getState().game.players.map((p) => p.life)).toEqual([11, 12, 13, 14]);
    expect(useStore.getState().game.turn.activePlayerId).toBe("p2");
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    expect(lives(localStorage.getItem(STORAGE_KEY))).toEqual([11, 12, 13, 14]);
  });

  it("both keys: the new one wins and is not overwritten", async () => {
    const current = save(25);
    const old = save(11);
    localStorage.setItem(STORAGE_KEY, current);
    localStorage.setItem(LEGACY_STORAGE_KEY, old);

    const useStore = await boot();

    expect(useStore.getState().game.players.map((p) => p.life)).toEqual([25, 26, 27, 28]);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(current);
    // Left exactly as found, not folded in and not deleted.
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(old);
  });

  it("neither key: a clean start, and nothing appears under the old key", async () => {
    const useStore = await boot();

    expect(useStore.getState().game.players.map((p) => p.life)).toEqual([40, 40, 40, 40]);
    expect(useStore.getState().game.turn.turnNumber).toBe(1);
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("saves under the new key from then on", async () => {
    const useStore = await boot();
    useStore.getState().adjustLife("p0", -7);

    expect(lives(localStorage.getItem(STORAGE_KEY))).toEqual([33, 40, 40, 40]);
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("a carried-over game keeps saving under the new key only", async () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, save(11));

    const useStore = await boot();
    useStore.getState().adjustLife("p0", -1);

    expect(lives(localStorage.getItem(STORAGE_KEY))).toEqual([10, 12, 13, 14]);
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });
});

describe("migrateStorageKey", () => {
  it("moves the value across byte for byte", () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, "anything at all");
    migrateStorageKey();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("anything at all");
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("does nothing the second time", () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, "first");
    migrateStorageKey();
    localStorage.setItem(STORAGE_KEY, "played since");
    migrateStorageKey();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("played since");
  });

  it("keeps the old save when the copy cannot be written", () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, "precious");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => migrateStorageKey()).not.toThrow();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe("precious");
  });

  it("does not throw when storage is unreadable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(() => migrateStorageKey()).not.toThrow();
  });
});
