import { formatDistance, formatPercent, SOURCE_TEXT, VERDICT_TEXT } from "@/lib/format";
import type { DiffResult } from "@/lib/types";

const TONE = {
  match: { ring: "border-emerald-400/30", glow: "from-emerald-500/15", text: "text-emerald-300", dot: "bg-emerald-400" },
  minor_wear: { ring: "border-amber-400/30", glow: "from-amber-500/15", text: "text-amber-300", dot: "bg-amber-400" },
  needs_review: { ring: "border-red-400/30", glow: "from-red-500/15", text: "text-red-300", dot: "bg-red-400" },
};

const ICON = { match: "✓", minor_wear: "!", needs_review: "!!" };

export default function VerdictBanner({ diff }: { diff: DiffResult }) {
  const v = VERDICT_TEXT[diff.verdict];
  const t = TONE[diff.verdict];
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
    <section role="status" className={`relative overflow-hidden rounded-2xl border ${t.ring} bg-white/[0.02] p-1.5`}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${t.glow} to-transparent`} />
      <div className="relative flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 pb-3 pt-2.5">
        <span aria-hidden className={`font-mono text-sm font-black ${t.text}`}>
          {ICON[diff.verdict]}
        </span>
        <h2 className="text-xl font-bold tracking-tight">
          Verdict: <span className={t.text}>{v.title}</span>
        </h2>
        <span className="text-sm text-zinc-300">{diff.verdictReason ?? v.detail}</span>
      </div>
      <dl className="relative grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2.5">
            <dt className="label text-[10px]">{label}</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-white">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="relative flex items-center gap-1.5 px-3 pb-1 pt-2 font-mono text-[11px] text-zinc-500">
        <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
        Source: {SOURCE_TEXT[diff.source].short}
      </p>
    </section>
  );
}
