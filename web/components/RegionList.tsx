"use client";

import { formatDistance, LABEL_TEXT } from "@/lib/format";
import type { DiffResult } from "@/lib/types";

interface Props {
  diff: DiffResult;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function RegionList({ diff, selectedId, onSelect }: Props) {
  return (
    <ol className="flex flex-col gap-2">
      {diff.flaggedRegions.map((r, i) => {
        const selected = r.id === selectedId;
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              aria-pressed={selected}
              className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                selected
                  ? "border-accent/50 bg-accent/10"
                  : "border-white/[0.07] bg-black/20 hover:border-white/20"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-6 shrink-0 font-mono text-xs ${selected ? "text-accent" : "text-zinc-500"}`}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-semibold">{r.description}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-8 font-mono text-[11px] text-zinc-400">
                <span
                  className={`rounded-full border px-2 py-0.5 font-semibold ${
                    r.label === "needs_review"
                      ? "border-red-400/30 bg-red-500/10 text-red-300"
                      : "border-amber-400/30 bg-amber-500/10 text-amber-300"
                  }`}
                >
                  {LABEL_TEXT[r.label]}
                </span>
                {r.kind === "missing" && (
                  <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 font-semibold text-rose-300">
                    × Missing part
                  </span>
                )}
                <span>Confidence {Math.round(r.confidence * 100)}%</span>
                <span>Up to {formatDistance(r.maxDistance, diff.units)}</span>
                <span>Seen on {r.seenOn === "new" ? "new scan" : "baseline scan"}</span>
              </div>
              {(r.beforeCropUrl || r.afterCropUrl) && (
                <div className="mt-2 flex gap-2 pl-8">
                  {[
                    ["Before", r.beforeCropUrl],
                    ["After", r.afterCropUrl],
                  ].map(([name, url]) =>
                    url ? (
                      <figure key={name} className="w-24">
                        {/* eslint-disable-next-line @next/next/no-img-element -- engine-hosted crops, any origin */}
                        <img src={url} alt={`${name} photo of region ${i + 1}`} className="aspect-square w-full rounded object-cover" />
                        <figcaption className="text-[11px] opacity-80">{name}</figcaption>
                      </figure>
                    ) : null,
                  )}
                </div>
              )}
            </button>
          </li>
        );
      })}
      {diff.uncoveredRegions.map((u) => {
        const selected = u.id === selectedId;
        return (
          <li key={u.id}>
            <button
              type="button"
              onClick={() => onSelect(u.id)}
              aria-pressed={selected}
              className={`w-full rounded-xl border border-dashed px-3 py-2.5 text-left transition-colors ${
                selected ? "border-zinc-300 bg-white/[0.06]" : "border-white/15 bg-transparent hover:border-white/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-6 shrink-0 font-mono text-xs text-zinc-500">—</span>
                <span className="text-sm font-semibold">No data</span>
              </div>
              <div className="mt-1 pl-8 text-xs text-zinc-400">
                {u.description} Covered by {u.coveredBy === "baseline_only" ? "the baseline scan only" : "the new scan only"},
                so it is not compared and not counted as damage.
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
