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
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                selected
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                  : "border-zinc-200 bg-white hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-current text-[11px] font-bold">
                  {i + 1}
                </span>
                <span className="text-sm font-semibold">{r.description}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-8 text-xs opacity-80">
                <span
                  className={`rounded px-1.5 font-semibold ${
                    r.label === "needs_review" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {LABEL_TEXT[r.label]}
                </span>
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
              className={`w-full rounded-lg border border-dashed px-3 py-2 text-left ${
                selected
                  ? "border-zinc-900 bg-zinc-100 dark:border-white dark:bg-zinc-800"
                  : "border-zinc-300 bg-zinc-50 hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-zinc-500 text-[11px] font-bold">
                  –
                </span>
                <span className="text-sm font-semibold">No data</span>
              </div>
              <div className="mt-1 pl-8 text-xs text-zinc-600 dark:text-zinc-400">
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
