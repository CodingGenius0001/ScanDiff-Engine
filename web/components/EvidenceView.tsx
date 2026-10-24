"use client";

import Link from "next/link";
import { formatDate, formatDistance, formatPercent, LABEL_TEXT, SOURCE_TEXT, VERDICT_TEXT } from "@/lib/format";
import { statusAt, useOrder } from "@/lib/orderStatus";
import type { DiffResult, Item, ScanMeta } from "@/lib/types";
import { useComparison } from "@/lib/useComparison";
import Fingerprint from "./Fingerprint";
import Histogram from "./Histogram";
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
          className="min-h-11 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900"
        >
          Print or save as PDF
        </button>
      </div>

      <header className="border-b border-zinc-300 pb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">ScanDiff dispute evidence</p>
        <h1 className="text-2xl font-bold">{item.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span>Item ID: {item.id}</span>
          <StatusPill status={order.status} kind={item.kind} />
          {disputedAt && <span>Disputed {formatDate(disputedAt)}</span>}
        </div>
        <p className="mt-2 text-sm">
          This page is tamper-evident evidence of the item&apos;s shape at each handoff. It does not verify that the
          item is as advertised. LiDAR measures shape, not color, so marks and stains are not covered.
        </p>
        {state.status === "ready" && (
          <p className="mt-1 text-xs text-zinc-500">{SOURCE_TEXT[state.data.diff.source].note}</p>
        )}
      </header>

      {state.status === "loading" && <p className="text-sm text-zinc-500">Loading comparison…</p>}
      {state.status === "error" && (
        <p className="text-sm text-red-700" role="alert">
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
          <ScanCard role="Baseline" scan={diff.baseScan} />
          <ScanCard role="New" scan={diff.newScan} />
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
          <Field label={diff.source === "browser_mock" ? "Computed" : "Received"} value={formatDate(diff.computedAt)} />
          {diff.diffId && <Field label="Diff ID" value={diff.diffId} />}
        </dl>
      </Section>

      <Section title="Flagged regions">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-300 text-xs text-zinc-500">
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
                <tr key={r.id} className="border-b border-zinc-200 align-top">
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
      <h2 className="mb-2 text-base font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 sm:col-span-3 print:col-span-3" : ""}>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function ScanCard({ role, scan }: { role: string; scan: ScanMeta }) {
  return (
    <div className="rounded-lg border border-zinc-300 p-3 text-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{role}</div>
      <div className="font-semibold">{scan.name}</div>
      <div>Captured {formatDate(scan.capturedAt)}</div>
      <div>
        By {scan.capturedBy}
        {scan.device && <> on {scan.device}</>}
      </div>
      <div className="text-xs text-zinc-500">Scan ID: {scan.id}</div>
      <div className="mt-1">
        <span className="text-xs text-zinc-500">SHA-256 fingerprint: </span>
        <Fingerprint sha256={scan.sha256} />
      </div>
    </div>
  );
}
