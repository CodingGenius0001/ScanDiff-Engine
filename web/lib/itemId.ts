/**
 * Item ids for the links and QR codes this site generates. The iOS app files
 * a scan under `scans/<item id>/`, so "Coffee-Maker" and "coffee-maker"
 * would be two items. Every id the site hands out is lowercased and checked
 * here first.
 */

export type ScanKind = "baseline" | "check";

/** Lowercase letters, digits, "-" and "_": a strict subset of what the iOS app accepts (ItemID.isValid). */
const PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const MAX_LENGTH = 64;

/** Trim, lowercase, and turn spaces into "-". */
export function normalizeItemId(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Why an (already normalized) id cannot be used, or null if it can. */
export function itemIdProblem(id: string): string | null {
  if (id === "") return "Enter an item ID.";
  if (id.length > MAX_LENGTH) return `Keep the item ID under ${MAX_LENGTH} characters.`;
  if (id.startsWith("_")) return "IDs starting with _ are reserved for setup checks.";
  if (!PATTERN.test(id)) return "Use only lowercase letters, numbers, - and _.";
  return null;
}

/** "Coffee Maker!" → "coffee-maker": lowercase letters and digits, joined by single "-". */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH - 4);
}

/**
 * The next free id for an item name: "Mug" with mug-001 taken → "mug-002".
 * Null when the name has no letters or digits to build an id from.
 */
export function nextItemId(name: string, taken: Iterable<string>): string | null {
  const slug = slugifyName(name);
  if (!slug) return null;
  const pattern = new RegExp(`^${slug}-(\\d+)$`);
  let highest = 0;
  for (const id of taken) {
    const m = pattern.exec(id.toLowerCase());
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  const id = `${slug}-${String(highest + 1).padStart(3, "0")}`;
  return itemIdProblem(id) ? null : id;
}

/**
 * The closest existing id, to catch typos such as coffe-maker-3 for
 * coffee-maker-3. Same rule as the iOS app's "did you mean"
 * (ItemsService.closest): an edit distance up to max(2, length / 4).
 */
export function closestItemId(id: string, known: string[]): string | undefined {
  let best: { id: string; d: number } | undefined;
  for (const k of known) {
    if (k === id) return undefined;
    const d = editDistance(id, k.toLowerCase());
    if (d <= Math.max(2, Math.floor(id.length / 4)) && (!best || d < best.d)) best = { id: k, d };
  }
  return best?.id;
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** What the iOS app accepts (ItemID.isValid), limited to ASCII: letters, digits, "-" and "_". */
const APP_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * The deep link that opens the iOS app straight into a scan. New ids must pass
 * the strict lowercase rules. An item that already has scans keeps its id
 * exactly as stored (lowercasing it would file the next scan under another
 * item), as long as the app accepts it. Throws on an id that cannot be used.
 */
export function scanLink(itemId: string, kind: ScanKind, { existing = false } = {}): string {
  if (existing) {
    if (!APP_PATTERN.test(itemId)) throw new Error(`The item ID "${itemId}" has characters a scan link cannot carry.`);
  } else {
    const problem = itemIdProblem(itemId);
    if (problem || itemId !== normalizeItemId(itemId)) throw new Error(`Bad item ID "${itemId}": ${problem ?? "not lowercase"}`);
  }
  return `scandiff://scan?item=${encodeURIComponent(itemId)}&kind=${kind}`;
}
