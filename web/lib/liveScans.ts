"use client";

/**
 * Keeps a page in step with an item's rows in the scans table while it is
 * open: a scan or a decision written by the phone shows up here. Listens on
 * Supabase realtime, which is instant once the scans table is in the
 * realtime publication, and also polls every few seconds, so it works on any
 * Supabase setup. Reads go through the signed-in browser client, so
 * row-level security applies.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchItemRows, itemFromRows, type Decision, type ScanRow } from "./scans";
import { browserSupabase } from "./supabase";
import type { Item } from "./types";

const POLL_MS = 4000;

export interface ScanRows {
  /** The item's rows, oldest version first; undefined until the first read. */
  rows: ScanRow[] | undefined;
  /** The last read failed (it is retried on the next tick). */
  error: string | null;
  /** Apply a write this page just made, so a slower read that started earlier cannot undo it. */
  patch: (scanId: string, fields: Partial<ScanRow>) => void;
}

export function useScanRows(itemId: string, enabled = true): ScanRows {
  const [rows, setRows] = useState<ScanRow[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const lastWrite = useRef(0);

  useEffect(() => {
    const db = browserSupabase();
    if (!db || !enabled) return;
    let stopped = false;
    let busy = false;

    async function read() {
      if (stopped || busy || document.visibilityState !== "visible") return;
      busy = true;
      const started = Date.now();
      try {
        const next = await fetchItemRows(db!, itemId);
        // Stale if this page wrote while the request was in flight.
        if (stopped || started < lastWrite.current) return;
        setRows(next);
        setError(null);
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : String(e));
      } finally {
        busy = false;
      }
    }

    void read();
    const timer = setInterval(read, POLL_MS);
    const channel = db
      .channel(`scans:${itemId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "scans", filter: `item_id=eq.${itemId}` }, () => read())
      .subscribe();
    document.addEventListener("visibilitychange", read);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", read);
      void db.removeChannel(channel);
    };
  }, [itemId, enabled]);

  const patch = useCallback((scanId: string, fields: Partial<ScanRow>) => {
    lastWrite.current = Date.now();
    setRows((cur) => cur?.map((r) => (r.id === scanId ? { ...r, ...fields } : r)));
  }, []);

  return { rows, error, patch };
}

/** The newest check scan after the current baseline, if any. */
export function newestCheck(itemId: string, rows: ScanRow[]): ScanRow | undefined {
  const item = itemFromRows(itemId, rows);
  if (!item || item.versions.length < 2) return undefined;
  const id = item.versions.at(-1)!.scanId;
  return rows.find((r) => r.id === id);
}

export interface LiveScans {
  /** Decision on the newest check scan as currently stored; undefined until first read. */
  decision: Decision | null | undefined;
  /** Record a decision this page just wrote, so a slower poll cannot undo it. */
  decided: (decision: Decision) => void;
  /** True while the page reloads after a new scan arrived. */
  updating: boolean;
}

/** For the item page: the live decision, and a page refresh when the phone uploads a new scan. */
export function useLiveScans(item: Item): LiveScans {
  const router = useRouter();
  const { rows, patch } = useScanRows(item.id, item.source === "supabase");
  const shown = item.versions.map((v) => v.scanId).join(",");
  const latest = rows && itemFromRows(item.id, rows);
  const ids = latest?.versions.map((v) => v.scanId).join(",") ?? "";
  const check = rows && newestCheck(item.id, rows);
  // The phone uploaded a scan this page was not rendered with: reload the server data.
  const stale = ids !== "" && ids !== shown;

  useEffect(() => {
    if (stale) router.refresh();
  }, [stale, ids, router]);

  return {
    decision: rows === undefined ? undefined : (check?.decision ?? null),
    decided: (d) => {
      if (check) patch(check.id, { decision: d });
    },
    updating: stale,
  };
}
