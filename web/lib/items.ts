/**
 * Item metadata (title, price, scan history) for server pages: the mock
 * catalog first, then real scans from Supabase, read as the signed-in user.
 */
import type { Item } from "./types";
import { MOCK_ITEMS } from "./mock/catalog";
import { fetchItem } from "./scans";
import { currentUser, serverSupabase } from "./supabaseServer";

/** "sign_in" when the id is not a mock item and nobody is signed in, so real scans cannot be read. */
export async function getItem(id: string): Promise<Item | "sign_in" | undefined> {
  const mock = MOCK_ITEMS.find((i) => i.id === id);
  if (mock) return mock;
  const db = await serverSupabase();
  if (!db) return undefined;
  if (!(await currentUser(db))) return "sign_in";
  return fetchItem(db, id);
}

/** Mock items only; real items are rendered on request. */
export function listItems(): Item[] {
  return MOCK_ITEMS;
}
