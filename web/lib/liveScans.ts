"use client";

/**
 * Keeps a real item's page in step with the scans table while it is open:
 * a new scan from the phone refreshes the page, and a decision made on the
 * phone shows up here. Polls every few seconds (works on any Supabase
 * setup) and also listens on Supabase realtime, which is instant when the
 * scans table is in the realtime publication.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fetchItemRows, itemFromRows, type Decision } from "./scans";
import { supabase } from "./supabase";
import type { Item } from "./types";

const POLL_MS = 4000;

export interface LiveScans {
  /** Decision on the newest check scan as currently stored; undefined until first read. */
  decision: Decision | null | undefined;
  /** Record a decision this page just wrote, so a slower poll cannot undo it. */
  decided: (decision: Decision) => void;
  /** True while the page reloads after a new scan arrived. */
  updating: boolean;
}

export function useLiveScans(item: Item): LiveScans {
  const router = useRouter();
  const [decision, setDecision] = useState<Decision | null | undefined>(undefined);
  /** The scan list being shown when a refresh was requested; the refresh is done once it changes. */
  const [refreshedFrom, setRefreshedFrom] = useState<string | null>(null);
  const shown = item.versions.map((v) => v.scanId).join(",");
  const shownRef = useRef(shown);
  const lastWrite = useRef(0);

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  useEffect(() => {
    if (!supabase || item.source !== "supabase") return;
    let stopped = false;
    let busy = false;

    async function check() {
      if (stopped || busy || document.visibilityState !== "visible") return;
      busy = true;
      const started = Date.now();
      try {
        const rows = await fetchItemRows(item.id);
        // Stale if this page wrote a decision while the request was in flight.
        if (stopped || started < lastWrite.current) return;
        const latest = itemFromRows(item.id, rows);
        const ids = latest?.versions.map((v) => v.scanId).join(",") ?? "";
        const newest = latest && latest.versions.length > 1 ? rows.find((r) => r.id === latest.versions.at(-1)!.scanId) : null;
        setDecision(newest ? newest.decision : null);
        if (ids && ids !== shownRef.current) {
          setRefreshedFrom(shownRef.current);
          router.refresh();
        }
      } catch {
        // A failed poll is retried on the next tick.
      } finally {
        busy = false;
      }
    }

    void check();
    const timer = setInterval(check, POLL_MS);
    const channel = supabase
      .channel(`scans:${item.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "scans", filter: `item_id=eq.${item.id}` }, () => check())
      .subscribe();
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      void supabase!.removeChannel(channel);
    };
  }, [item.id, item.source, router]);

  return {
    decision,
    decided: (d) => {
      lastWrite.current = Date.now();
      setDecision(d);
    },
    updating: refreshedFrom === shown,
  };
}
