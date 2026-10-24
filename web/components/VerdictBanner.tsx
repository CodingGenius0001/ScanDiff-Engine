import { formatDistance, formatPercent, SOURCE_TEXT, VERDICT_TEXT } from "@/lib/format";
import type { DiffResult } from "@/lib/types";

const STYLE = {
  match: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
  minor_wear: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
  needs_review: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
};

const ICON = { match: "✓", minor_wear: "!", needs_review: "!!" };

export default function VerdictBanner({ diff }: { diff: DiffResult }) {
  const v = VERDICT_TEXT[diff.verdict];
  return (
    <section role="status" className={`rounded-xl border px-4 py-3 ${STYLE[diff.verdict]}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span aria-hidden className="text-lg font-black">{ICON[diff.verdict]}</span>
        <h2 className="text-lg font-bold">Verdict: {v.title}</h2>
        <span className="text-sm">{diff.verdictReason ?? v.detail}</span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <dt className="opacity-75">Largest change</dt>
          <dd className="font-semibold">{formatDistance(diff.summary.maxDistance, diff.units)}</dd>
        </div>
        <div>
          <dt className="opacity-75">Change threshold</dt>
          <dd className="font-semibold">{formatDistance(diff.noiseThreshold, diff.units)}</dd>
        </div>
        <div>
          <dt className="opacity-75">Above threshold</dt>
          <dd className="font-semibold">{formatPercent(diff.summary.fractionAboveThreshold)} of surface</dd>
        </div>
        {diff.summary.coveredFraction !== undefined ? (
          <div>
            <dt className="opacity-75">Covered by both scans</dt>
            <dd className="font-semibold">{formatPercent(diff.summary.coveredFraction)}</dd>
          </div>
        ) : (
          diff.verdictConfidence !== undefined && (
            <div>
              <dt className="opacity-75">Verdict confidence</dt>
              <dd className="font-semibold">{formatPercent(diff.verdictConfidence)}</dd>
            </div>
          )
        )}
      </dl>
      <p className="mt-2 text-[11px] opacity-75">Source: {SOURCE_TEXT[diff.source].short}</p>
    </section>
  );
}
