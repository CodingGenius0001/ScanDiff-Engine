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
                  className={`h-3 w-3 shrink-0 rounded-full border-2 ${
                    role ? "border-zinc-900 bg-zinc-900 dark:border-white dark:bg-white" : "border-zinc-400"
                  }`}
                />
                <span className="text-sm font-semibold">{v.label}</span>
              </div>
              <span className="pl-5 text-xs text-zinc-500 dark:text-zinc-400">{formatDate(v.capturedAt)}</span>
              {role && <span className="pl-5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{role}</span>}
            </div>
            {i < versions.length - 1 && <div className="mx-3 h-0.5 min-w-6 flex-1 bg-zinc-300 dark:bg-zinc-700" />}
          </li>
        );
      })}
    </ol>
  );
}
