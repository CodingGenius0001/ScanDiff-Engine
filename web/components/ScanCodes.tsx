"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/format";
import { deleteCheckScan } from "@/lib/scans";
import { browserSupabase } from "@/lib/supabase";
import type { Item } from "@/lib/types";
import LocalTime from "./LocalTime";
import ScanQR from "./ScanQR";
import ShareLink from "./ShareLink";

/**
 * For items scanned with the iPhone app: the item's share link, the baseline
 * (owner only) and check-in QR codes, and a button that deletes the latest
 * check-in so it can be redone live.
 */
export default function ScanCodes({ item }: { item: Item }) {
  const router = useRouter();
  const latestCheck = item.versions.length > 1 ? item.versions[item.versions.length - 1] : null;
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteLatest() {
    const db = browserSupabase();
    if (!latestCheck || !db) return;
    const when = formatDate(latestCheck.capturedAt);
    if (!window.confirm(`Delete ${latestCheck.label} from ${when}? The comparison goes back to the baseline only. This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteCheckScan(db, latestCheck.scanId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="sheet">
      <h2 className="display text-3xl">Scan with the iPhone</h2>
      <div className={`mt-4 grid gap-6 ${item.role === "member" ? "" : "sm:grid-cols-2"}`}>
        {item.role !== "member" && <ScanQR itemId={item.id} kind="baseline" existing />}
        <ScanQR itemId={item.id} kind="check" existing invite={item.inviteCode} />
      </div>
      {item.inviteCode && (
        <div className="mt-5 border-t border-rule pt-4">
          <ShareLink
            itemId={item.id}
            code={item.inviteCode}
            to="item"
            title="Share this case file"
            note="Whoever opens it signed in can see both scans and the comparison, scan a check-in, and accept or dispute. Send it only to the other party."
          />
        </div>
      )}
      {latestCheck && (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
          <button
            type="button"
            onClick={deleteLatest}
            disabled={deleting}
            className="min-h-11 rounded-md border border-stamp px-4 text-sm font-semibold text-stamp transition-colors hover:bg-stamp hover:text-paper disabled:opacity-40"
          >
            {deleting ? "Deleting…" : "Delete latest check-in"}
          </button>
          <span className="caption">
            Removes {latestCheck.label} (<LocalTime iso={latestCheck.capturedAt} />) so the check-in can be scanned again live.
          </span>
          {error && (
            <p role="alert" className="w-full text-sm text-stamp">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
