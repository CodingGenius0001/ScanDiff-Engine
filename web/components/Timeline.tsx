import { formatDate } from "@/lib/format";
import type { ScanVersion } from "@/lib/types";

interface Props {
  versions: ScanVersion[];
  baseId: string;
  newId: string;
}

/** Scan history in time order. The compared pair is highlighted. */
export default function Timeline({ versions, baseId, newId }: Props) {
  return (
    <ol className="flex items-stretch gap-0 overflow-x-auto">
      {versions.map((v, i) => {
        const role = v.scanId === baseId ? "Baseline" : v.scanId === newId ? "Compared" : null;
        return (
          <li key={v.scanId} className="flex min-w-0 flex-1 items-center">
            <div className="flex min-w-0 flex-col items-start">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    role ? "bg-accent shadow-[0_0_10px_var(--color-accent)]" : "border border-zinc-500"
                  }`}
                />
                <span className="text-sm font-semibold">{v.label}</span>
              </div>
              <span className="pl-[18px] font-mono text-[11px] text-zinc-400">{formatDate(v.capturedAt)}</span>
              {role && <span className="label pl-[18px] text-[10px] text-accent">{role}</span>}
            </div>
            {i < versions.length - 1 && <div className="mx-3 h-px min-w-6 flex-1 bg-gradient-to-r from-accent/60 via-white/15 to-accent/60" />}
          </li>
        );
      })}
    </ol>
  );
}
