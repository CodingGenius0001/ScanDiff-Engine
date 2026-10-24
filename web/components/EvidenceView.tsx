"use client";

import Link from "next/link";
import { formatDistance, formatPercent, LABEL_TEXT, SOURCE_TEXT, VERDICT_TEXT } from "@/lib/format";
import { statusAt, useOrder } from "@/lib/orderStatus";
import type { DiffResult, Item, ScanMeta } from "@/lib/types";
import { fetchDecision, type Decision } from "@/lib/scans";
import { browserSupabase } from "@/lib/supabase";
import { useComparison } from "@/lib/useComparison";
import { useEffect, useState } from "react";
import Fingerprint from "./Fingerprint";
import Histogram from "./Histogram";
import LocalTime from "./LocalTime";
import StatusPill from "./StatusPill";

export default function EvidenceView({ item }: { item: Item }) {
  const state = useComparison(item, false);
  const order = useOrder(item.id, item.kind);
  const disputedAt = statusAt(order, "disputed");

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 print:max-w-none print:px-0 print:py-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/item/${item.id}`} className="text-sm font-semibold underline">
          Back to comparison
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-11 bg-ink px-5 text-sm font-semibold text-paper"
        >
          Print or save as PDF
        </button>
      </div>

      <header className="border-b border-ink pb-4">
        <p className="caption">ScanDiff dispute evidence</p>
        <h1 className="display text-5xl">{item.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span>Item ID: {item.id}</span>
          {item.source === "supabase" ? <ScanDecision item={item} /> : <StatusPill status={order.status} kind={item.kind} />}
          {disputedAt && <span>
              Disputed <LocalTime iso={disputedAt} />
            </span>}
        </div>
        <p className="mt-2 text-sm">
          This page is tamper-evident evidence of the item&apos;s shape at each handoff. It does not verify that the
          item is as advertised. LiDAR measures shape, not color, so marks and stains are not covered.
        </p>
        {state.status === "ready" && (
          <p className="mt-1 text-xs text-ink-soft">{SOURCE_TEXT[state.data.diff.source].note}</p>
        )}
      </header>

      {state.status === "loading" && <p className="text-sm text-ink-soft">Loading comparison…</p>}
      {state.status === "waiting" && (
        <p className="text-sm text-ink-soft">Only a baseline scan exists, so there is no comparison yet.</p>
      )}
      {state.status === "error" && (
        <p className="text-sm text-stamp" role="alert">
          Could not load the comparison: {state.message}
        </p>
      )}
      {state.status === "ready" && <Evidence diff={state.data.diff} />}
    </main>
  );
}

function Evidence({ diff }: { diff: DiffResult }) {
  const v = VERDICT_TEXT[diff.verdict];
  return (
    <>
      <Section title="Scans compared">
        <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
          <ScanCard exhibit="A" role="Baseline" scan={diff.baseScan} />
          <ScanCard exhibit="B" role="New" scan={diff.newScan} />
        </div>
      </Section>

      <Section title="Diff summary">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 print:grid-cols-3">
          <Field label="Verdict" value={`${v.title}: ${diff.verdictReason ?? v.detail}`} wide />
          {diff.verdictConfidence !== undefined && (
            <Field label="Verdict confidence" value={formatPercent(diff.verdictConfidence)} />
          )}
          <Field label="Largest change" value={formatDistance(diff.summary.maxDistance, diff.units)} />
          {diff.summary.meanDistance !== undefined && (
            <Field label="Mean distance" value={formatDistance(diff.summary.meanDistance, diff.units)} />
          )}
          <Field label="Change threshold" value={formatDistance(diff.noiseThreshold, diff.units)} />
          <Field label="Surface above threshold" value={formatPercent(diff.summary.fractionAboveThreshold)} />
          {diff.summary.coveredFraction !== undefined && (
            <Field label="Covered by both scans" value={formatPercent(diff.summary.coveredFraction)} />
          )}
          {diff.quality && (
            <>
              <Field label="Estimated sensor noise" value={formatDistance(diff.quality.noiseFloor, diff.units)} />
              <Field label="Alignment fit (ICP inliers)" value={formatPercent(diff.quality.icpFitness)} />
              <Field label="Alignment error (ICP RMSE)" value={formatDistance(diff.quality.icpRmse, diff.units)} />
            </>
          )}
          <Field label="Units / up axis" value={`${diff.units} / ${diff.upAxis} up`} />
          <Field label={diff.source === "browser_mock" ? "Computed" : "Received"} value={<LocalTime iso={diff.computedAt} />} />
          {diff.diffId && <Field label="Diff ID" value={diff.diffId} />}
        </dl>
      </Section>

      <Section title="Flagged regions">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink text-xs text-ink-soft">
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">Description</th>
                <th className="py-1 pr-2">Label</th>
                <th className="py-1 pr-2">Confidence</th>
                <th className="py-1 pr-2">Largest change</th>
                <th className="py-1">Seen on</th>
              </tr>
            </thead>
            <tbody>
              {diff.flaggedRegions.map((r, i) => (
                <tr key={r.id} className="border-b border-rule align-top">
                  <td className="py-1.5 pr-2">{i + 1}</td>
                  <td className="py-1.5 pr-2">{r.description}</td>
                  <td className="py-1.5 pr-2">{LABEL_TEXT[r.label]}</td>
                  <td className="py-1.5 pr-2">{Math.round(r.confidence * 100)}%</td>
                  <td className="py-1.5 pr-2">{formatDistance(r.maxDistance, diff.units)}</td>
                  <td className="py-1.5">{r.seenOn === "new" ? "New scan" : "Baseline scan"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {diff.uncoveredRegions.length > 0 && (
        <Section title="No data (not compared, not counted as damage)">
          <ul className="list-disc pl-5 text-sm">
            {diff.uncoveredRegions.map((u) => (
              <li key={u.id}>
                {u.description} Covered by {u.coveredBy === "baseline_only" ? "the baseline scan only" : "the new scan only"}.
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={diff.heatmap ? "Change from the baseline surface" : "Distance per vertex, both scans"}>
        <Histogram histogram={diff.histogram} threshold={diff.noiseThreshold} units={diff.units} signedScale={!!diff.heatmap} />
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="display mb-3 border-b border-ink pb-1 text-2xl">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 sm:col-span-3 print:col-span-3" : ""}>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function ScanCard({ exhibit, role, scan }: { exhibit: string; role: string; scan: ScanMeta }) {
  return (
    <div className="border border-rule p-3 text-sm">
      <div className="flex items-baseline gap-2">
        <span className="display text-xl">Exhibit {exhibit}</span>
        <span className="caption">{role}</span>
      </div>
      <div className="font-semibold">{scan.name}</div>
      <div>
        Captured <LocalTime iso={scan.capturedAt} />
      </div>
      <div>
        By {scan.capturedBy}
        {scan.device && <> on {scan.device}</>}
      </div>
      <div className="text-xs text-ink-soft">Scan ID: {scan.id}</div>
      <div className="mt-1">
        <span className="text-xs text-ink-soft">SHA-256 fingerprint: </span>
        <Fingerprint sha256={scan.sha256} />
      </div>
    </div>
  );
}

/** The decision saved on a real item's newest check scan. */
function ScanDecision({ item }: { item: Item }) {
  const checkScanId = item.versions.length > 1 ? item.versions[item.versions.length - 1].scanId : null;
  const [decision, setDecision] = useState<Decision | null>(null);
  useEffect(() => {
    const db = browserSupabase();
    if (!checkScanId || !db) return;
    fetchDecision(db, checkScanId).then(setDecision, () => setDecision(null));
  }, [checkScanId]);
  if (!decision) return null;
  return (
    <span className="border border-ink px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">
      {decision === "accept" ? "Accepted" : "Disputed"}
    </span>
  );
}
