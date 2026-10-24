/**
 * Item metadata (title, price, scan history): the mock catalog first, then
 * real scans from Supabase. Kept out of diffClient.ts so that file stays a
 * single getDiff function.
 */
import type { Item, ScanMeta } from "./types";
import { MOCK_ITEMS, MOCK_SCANS } from "./mock/catalog";
import { fetchItem, fetchScan } from "./scans";

export async function getItem(id: string): Promise<Item | undefined> {
  return MOCK_ITEMS.find((i) => i.id === id) ?? fetchItem(id);
}

/** Mock items only; real items are rendered on request. */
export function listItems(): Item[] {
  return MOCK_ITEMS;
}

/** Scan names, times and capturers. The engine response does not include them. */
export async function getScan(id: string): Promise<ScanMeta | undefined> {
  return MOCK_SCANS[id] ?? fetchScan(id);
}
