/**
 * Item metadata (title, price, scan history). Mock catalog for now.
 * Kept out of diffClient.ts so that file stays a single getDiff function.
 * TODO(backend): replace with the real item source once it exists.
 */
import type { Item, ScanMeta } from "./types";
import { MOCK_ITEMS, MOCK_SCANS } from "./mock/catalog";

export function getItem(id: string): Item | undefined {
  return MOCK_ITEMS.find((i) => i.id === id);
}

export function listItems(): Item[] {
  return MOCK_ITEMS;
}

/** Scan names, times and capturers. The engine response does not include them. */
export function getScan(id: string): ScanMeta | undefined {
  return MOCK_SCANS[id];
}
