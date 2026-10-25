import { statusLabel, type OrderStatus } from "@/lib/orderStatus";
import type { ItemKind } from "@/lib/types";

/** Held and disputed light up orange; released is a lit key; everything else is a plain outline. */
const STYLE: Record<OrderStatus, string> = {
  listed: "border-rule text-ink-soft",
  held_scan_required: "border-stamp/60 text-stamp",
  scan_uploaded: "border-ink-faint text-ink",
  released: "border-ink bg-ink text-paper",
  disputed: "border-stamp bg-stamp text-black",
  refunded: "border-ink bg-ink text-paper",
};

export default function StatusPill({ status, kind }: { status: OrderStatus; kind: ItemKind }) {
  const lit = status === "held_scan_required" || status === "scan_uploaded";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STYLE[status]}`}>
      {lit && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-stamp" aria-hidden />}
      {statusLabel(status, kind)}
    </span>
  );
}
