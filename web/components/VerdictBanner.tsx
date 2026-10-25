import { formatDistance, formatPercent, SOURCE_TEXT, VERDICT_TEXT } from "@/lib/format";
import type { DiffResult } from "@/lib/types";

/** Ink for a clean result, the red stamp for anything a person should look at. */
const TONE = { accept: "text-ink", damage_likely: "text-stamp", needs_review: "text-stamp", inconclusive: "text-ink" };

export default function VerdictBanner({ diff }: { diff: DiffResult }) {
  const v = VERDICT_TEXT[diff.verdict];
  const stats: [string, string][] = [
    ["Largest change", formatDistance(diff.summary.maxDistance, diff.units)],
    ["Change threshold", formatDistance(diff.noiseThreshold, diff.units)],
    ["Above threshold", `${formatPercent(diff.summary.fractionAboveThreshold)} of surface`],
  ];
  if (diff.summary.coveredFraction !== undefined) {
    stats.push(["Covered by both scans", formatPercent(diff.summary.coveredFraction)]);
  } else if (diff.verdictConfidence !== undefined) {
    stats.push(["Verdict confidence", formatPercent(diff.verdictConfidence)]);
  }

  return (
    <section role="status" className="grid gap-6 md:grid-cols-[1fr_22rem]">
      <div>
        <p className="caption">Finding</p>
        <h2 className={`display text-5xl ${TONE[diff.verdict]}`}>
          <span className="sr-only">Verdict: </span>
          {v.title}
        </h2>
        <p className="mt-2 max-w-xl text-ink-soft">{diff.verdictReason ?? v.detail}</p>
        <p className="caption mt-3">Source: {SOURCE_TEXT[diff.source].short}</p>
      </div>
      <dl className="self-end border-t border-ink">
        {stats.map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-2 border-b border-rule py-2 text-sm">
            <dt className="text-ink-soft">{label}</dt>
            <span className="leader" aria-hidden />
            <dd className="font-mono tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
