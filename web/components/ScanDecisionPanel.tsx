"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { writeDecision, type Decision } from "@/lib/scans";
import type { Item } from "@/lib/types";

const DECISION_TEXT: Record<Decision, string> = { accept: "Accepted", dispute: "Disputed" };

/**
 * Accept or Dispute for real scans. The decision is stored on the newest
 * check scan's row, where the iOS app also writes it, so both always agree.
 */
interface Props {
  item: Item;
  /** Stored decision from live updates (including ones made on the phone); undefined until first read. */
  decision: Decision | null | undefined;
  onDecided: (decision: Decision) => void;
}

export default function ScanDecisionPanel({ item, decision, onDecided }: Props) {
  const router = useRouter();
  const checkScanId = item.versions.length > 1 ? item.versions[item.versions.length - 1].scanId : null;
  const loaded = decision !== undefined;
  const [saving, setSaving] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(next: Decision) {
    if (!checkScanId) return;
    setSaving(next);
    setError(null);
    try {
      await writeDecision(checkScanId, next);
      onDecided(next);
      if (next === "dispute") router.push(`/item/${encodeURIComponent(item.id)}/evidence`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Decision on the latest check scan</h2>
        {decision && (
          <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 font-mono text-[11px] font-semibold">
            {DECISION_TEXT[decision]}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        ScanDiff provides tamper-evident evidence of condition at handoff. It does not verify that the item is as
        advertised. The decision is saved on the scan, where the iPhone app sees it too. No payment is involved.
      </p>
      {!checkScanId ? (
        <p className="mt-2 text-sm">Accept and Dispute become available after a check scan is uploaded.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
          <button
            type="button"
            disabled={!loaded || saving !== null || decision === "accept"}
            onClick={() => decide("accept")}
            className="min-h-11 rounded-full bg-emerald-500 px-5 font-semibold text-emerald-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving === "accept" ? "Saving…" : "Accept"}
          </button>
          <button
            type="button"
            disabled={!loaded || saving !== null || decision === "dispute"}
            onClick={() => decide("dispute")}
            className="min-h-11 rounded-full border border-red-500/60 px-5 font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300 dark:hover:bg-red-500/10"
          >
            {saving === "dispute" ? "Saving…" : "Dispute"}
          </button>
          <Link
            href={`/item/${encodeURIComponent(item.id)}/evidence`}
            className="col-span-2 flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold underline sm:col-span-1"
          >
            Evidence page
          </Link>
        </div>
      )}
      {error && (
        <p className="mt-2 text-sm text-red-700 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
