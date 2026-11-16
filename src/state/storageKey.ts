/** The one localStorage key the saved game lives under. */
export const STORAGE_KEY = "mtg-lethal";

/** The key from before the app was renamed. Only ever read, to move it. */
export const LEGACY_STORAGE_KEY = "lotus-tracker";

/**
 * One-time move of a save written under the old name. Must run before the
 * store is created, because persist reads storage synchronously as it starts.
 *
 * A save already under the new key always wins: it is the newer one, and the
 * old key is then left exactly as found.
 */
export function migrateStorageKey(): void {
  try {
    const old = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (old === null || localStorage.getItem(STORAGE_KEY) !== null) return;
    localStorage.setItem(STORAGE_KEY, old);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* storage unavailable or full: start clean, the old save stays put */
  }
}
