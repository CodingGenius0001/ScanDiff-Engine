import { statusLabel, type OrderStatus } from "@/lib/orderStatus";
import type { ItemKind } from "@/lib/types";

const STYLE: Record<OrderStatus, string> = {
  listed: "bg-zinc-100 text-zinc-800",
  held_scan_required: "bg-amber-100 text-amber-900",
  scan_uploaded: "bg-sky-100 text-sky-900",
  released: "bg-emerald-100 text-emerald-900",
  disputed: "bg-red-100 text-red-900",
};

export default function StatusPill({ status, kind }: { status: OrderStatus; kind: ItemKind }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLE[status]}`}>
      {statusLabel(status, kind)}
    </span>
  );
}
