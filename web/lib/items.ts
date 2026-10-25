/**
 * Item metadata (title, price, scan history) for server pages: the mock
 * catalog first, then real scans from Supabase, read as the signed-in user.
 */
import type { Item } from "./types";
import { fetchInviteCode, itemAccess } from "./access";
import { MOCK_ITEMS } from "./mock/catalog";
import { fetchItem } from "./scans";
import { currentUser, serverSupabase } from "./supabaseServer";

/**
 * The item, or why it cannot be shown: "sign_in" when nobody is signed in,
 * "no_access" when it belongs to other accounts, undefined when there is no
 * such item or it has no baseline yet.
 */
export async function getItem(id: string): Promise<Item | "sign_in" | "no_access" | undefined> {
  const mock = MOCK_ITEMS.find((i) => i.id === id);
  if (mock) return mock;
  const db = await serverSupabase();
  if (!db) return undefined;
  if (!(await currentUser(db))) return "sign_in";
  const access = await itemAccess(db, id);
  if (access === "missing") return undefined;
  if (access === "none") return "no_access";
  const [item, inviteCode] = await Promise.all([fetchItem(db, id), fetchInviteCode(db, id)]);
  return item && { ...item, role: access, inviteCode: inviteCode ?? undefined };
}

/** Mock items only; real items are rendered on request. */
export function listItems(): Item[] {
  return MOCK_ITEMS;
}
