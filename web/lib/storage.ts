/**
 * localStorage wrapped in try/catch. Storage can be missing or throw
 * (private windows, blocked site data), and the app must still work.
 */
export function readJSON<T>(key: string): T | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: state stays in memory for this page view.
  }
}
