/**
 * Who may see an item. Each item scanned with the iPhone app has an owner
 * (who listed it or scanned its first baseline) and members (who joined
 * through its share link). Row-level security in ios/supabase/setup.sql
 * only returns scans of items the signed-in user is a member of; these calls
 * wrap the database functions that create and join items.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** The signed-in user's relation to an item. "none": it exists but belongs to others. */
export type ItemAccess = "owner" | "member" | "none" | "missing";
export type ItemRole = "owner" | "member";

export async function itemAccess(db: SupabaseClient, itemId: string): Promise<ItemAccess> {
  const { data, error } = await db.rpc("item_access", { p_item_id: itemId });
  if (error) throw new Error(`Could not check access to ${itemId}: ${error.message}`);
  return data as ItemAccess;
}

/** The item's invite code, readable by its members; null for everyone else. */
export async function fetchInviteCode(db: SupabaseClient, itemId: string): Promise<string | null> {
  const { data, error } = await db.from("items").select("invite_code").eq("id", itemId).maybeSingle<{ invite_code: string }>();
  if (error) throw new Error(`Could not read the share link for ${itemId}: ${error.message}`);
  return data?.invite_code ?? null;
}

/** Joins the item with the code from its share link. Throws with the database's reason when the code is wrong. */
export async function joinItem(db: SupabaseClient, itemId: string, code: string): Promise<ItemRole> {
  const { data, error } = await db.rpc("join_item", { p_item_id: itemId, p_invite_code: code });
  if (error) throw new Error(error.message);
  return data as ItemRole;
}

/** Creates a new item named <slug>-NNN with the next free number, owned by the signed-in user. */
export async function createItem(db: SupabaseClient, slug: string): Promise<string> {
  const { data, error } = await db.rpc("create_item", { p_slug: slug });
  if (error) throw new Error(`Could not list the item: ${error.message}`);
  return data as string;
}

/** Where a share link lands: the checkout for buyers, the comparison page otherwise. */
export type ShareTarget = "checkout" | "item";

/** The link that adds whoever opens it (once signed in) to the item, then opens `to`. */
export function shareUrl(origin: string, itemId: string, code: string, to: ShareTarget): string {
  const url = new URL(`/join/${encodeURIComponent(itemId)}`, origin);
  url.searchParams.set("code", code);
  url.searchParams.set("to", to);
  return url.toString();
}
