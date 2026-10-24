import { statusLabel, type OrderStatus } from "@/lib/orderStatus";
import type { ItemKind } from "@/lib/types";

const STYLE: Record<OrderStatus, string> = {
  listed: "bg-zinc-100 text-zinc-800 dark:border-white/15 dark:bg-white/5 dark:text-zinc-300",
  held_scan_required: "bg-amber-100 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300",
  scan_uploaded: "bg-sky-100 text-sky-900 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-300",
  released: "bg-emerald-100 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  disputed: "bg-red-100 text-red-900 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-300",
};

export default function StatusPill({ status, kind }: { status: OrderStatus; kind: ItemKind }) {
  return (
    <span className={`inline-block rounded-full border border-transparent px-2.5 py-0.5 font-mono text-[11px] font-semibold ${STYLE[status]}`}>
      {statusLabel(status, kind)}
    </span>
  );
}
