"use client";

import { coverageText, formatDistance, LABEL_TEXT } from "@/lib/format";
import type { DiffResult } from "@/lib/types";

interface Props {
  diff: DiffResult;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function RegionList({ diff, selectedId, onSelect }: Props) {
  return (
    <ol>
      {diff.flaggedRegions.map((r, i) => {
        const selected = r.id === selectedId;
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              aria-pressed={selected}
              className={`w-full border-b border-rule py-3 text-left transition-colors ${selected ? "bg-paper-deep" : "hover:bg-paper-deep/60"}`}
            >
              <div className="flex items-baseline gap-3 px-1">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                    selected ? "border-ink bg-ink text-paper" : r.kind === "missing" ? "border-2 border-stamp text-stamp" : "border-ink"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-snug">{r.description}</span>
                  <span className="mt-1 flex items-baseline gap-2 text-xs text-ink-soft">
                    <span className={r.label === "needs_review" ? "font-semibold text-stamp" : "font-semibold text-ink"}>
                      {LABEL_TEXT[r.label]}
                    </span>
                    {r.kind === "missing" && <span className="font-semibold text-stamp">· Missing part</span>}
                    <span className="leader" aria-hidden />
                    <span className="font-mono tabular-nums text-ink">{formatDistance(r.maxDistance, diff.units)}</span>
                    <span className="font-mono tabular-nums">confidence {Math.round(r.confidence * 100)}%</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-faint">
                    Seen on the {r.seenOn === "new" ? "new scan" : "baseline scan"}
                  </span>
                </span>
              </div>
              {(r.beforeCropUrl || r.afterCropUrl) && (
                <div className="mt-2 flex gap-3 pl-10">
                  {[
                    ["Before", r.beforeCropUrl],
                    ["After", r.afterCropUrl],
                  ].map(([name, url]) =>
                    url ? (
                      <figure key={name} className="w-24">
                        {/* eslint-disable-next-line @next/next/no-img-element -- engine-hosted crops, any origin */}
                        <img src={url} alt={`${name} photo of region ${i + 1}`} className="aspect-square w-full border border-rule object-cover" />
                        <figcaption className="display text-sm text-ink-soft">{name}</figcaption>
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
              className={`w-full border-b border-rule py-3 text-left transition-colors ${selected ? "bg-paper-deep" : "hover:bg-paper-deep/60"}`}
            >
              <div className="flex items-baseline gap-3 px-1">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-ink text-[11px]">
                  –
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">No data</span>
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    {u.description} {coverageText(u.coveredBy)},
                    so it is not compared and not counted as damage.
                  </span>
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
