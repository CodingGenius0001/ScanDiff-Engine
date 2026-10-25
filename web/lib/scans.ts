/**
 * Real scans from the Supabase `scans` table (ios/supabase/setup.sql),
 * written by the iOS app on upload. Every function takes the client to read
 * with: serverSupabase() on the server, browserSupabase() in the browser.
 * Both carry the signed-in user, so row-level security applies.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { scanName } from "./scanMetadata";
import type { Item, ScanMeta, ScanVersion } from "./types";

/** One row of `public.scans`. */
export interface ScanRow {
  id: string;
  item_id: string;
  version: number;
  kind: "baseline" | "check";
  /** Public URL of the uploaded USDZ. The viewer gets GLBs from the engine instead. */
  model_url: string | null;
  sha256: string | null;
  created_by: string | null;
  created_at: string;
  decision: "accept" | "dispute" | null;
}

const COLUMNS = "id,item_id,version,kind,model_url,sha256,created_by,created_at,decision";

export function rowToScanMeta(row: ScanRow): ScanMeta {
  return {
    id: row.id,
    name: scanName(row.kind),
    capturedAt: row.created_at,
    capturedBy: row.created_by ?? "Unknown",
    kind: row.kind,
    modelUrl: row.model_url ?? "",
    // USDZ cannot be drawn; the engine's /diff response replaces this with a GLB.
    format: "glb",
    sha256: row.sha256,
  };
}

export async function fetchScan(db: SupabaseClient, id: string): Promise<ScanMeta | undefined> {
  const { data, error } = await db.from("scans").select(COLUMNS).eq("id", id).maybeSingle<ScanRow>();
  if (error) throw new Error(`Could not read scan ${id}: ${error.message}`);
  return data ? rowToScanMeta(data) : undefined;
}

/**
 * An item built from its scans: the newest baseline, then every check scan
 * uploaded after it. The page compares the baseline with the newest check.
 */
export async function fetchItem(db: SupabaseClient, itemId: string): Promise<Item | undefined> {
  return itemFromRows(itemId, await fetchItemRows(db, itemId));
}

/** Every scan row for an item, oldest version first. */
export async function fetchItemRows(db: SupabaseClient, itemId: string): Promise<ScanRow[]> {
  const { data, error } = await db
    .from("scans")
    .select(COLUMNS)
    .eq("item_id", itemId)
    .order("version", { ascending: true })
    .returns<ScanRow[]>();
  if (error) throw new Error(`Could not read scans for ${itemId}: ${error.message}`);
  return data;
}

export function itemFromRows(itemId: string, rows: ScanRow[]): Item | undefined {
  const baseline = rows.filter((r) => r.kind === "baseline").at(-1);
  if (!baseline) return undefined;
  const checks = rows.filter((r) => r.kind === "check" && r.version > baseline.version);
  const version = (r: ScanRow, label: string): ScanVersion => ({ scanId: r.id, label, capturedAt: r.created_at });
  return {
    id: itemId,
    // TODO(team): the table has no item kind, title or price. Real items show as shipping, without checkout.
    kind: "shipping",
    title: itemId,
    source: "supabase",
    versions: [version(baseline, "Baseline"), ...checks.map((r, i) => version(r, `Check ${i + 1}`))],
  };
}

/** Item ids that have a baseline scan, newest first. Hides setup test rows (ids starting with "_"). */
export async function fetchItemIds(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db
    .from("scans")
    .select("item_id,created_at")
    .eq("kind", "baseline")
    .order("created_at", { ascending: false })
    .returns<{ item_id: string }[]>();
  if (error) throw new Error(`Could not list scanned items: ${error.message}`);
  return [...new Set(data.map((r) => r.item_id))].filter((id) => !id.startsWith("_"));
}

export type Decision = "accept" | "dispute";

/** The decision on a check scan, as written by this page or the iOS app. */
export async function fetchDecision(db: SupabaseClient, scanId: string): Promise<Decision | null> {
  const { data, error } = await db.from("scans").select("decision").eq("id", scanId).maybeSingle<Pick<ScanRow, "decision">>();
  if (error) throw new Error(`Could not read the decision: ${error.message}`);
  return data?.decision ?? null;
}

/** Writes `decision` on the check scan's row, the same field the iOS app writes. */
export async function writeDecision(db: SupabaseClient, scanId: string, decision: Decision): Promise<void> {
  // select() returns the changed rows, so a write that matched nothing is not mistaken for success.
  const { data, error } = await db.from("scans").update({ decision }).eq("id", scanId).select("id");
  if (error) throw new Error(`Could not save the decision: ${error.message}`);
  if (!data?.length) throw new Error("Could not save the decision: the scan was not found");
}
