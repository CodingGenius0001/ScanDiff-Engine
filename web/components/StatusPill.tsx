import { statusLabel, type OrderStatus } from "@/lib/orderStatus";
import type { ItemKind } from "@/lib/types";

/** Held and disputed carry the red stamp; everything else is ink. */
const STYLE: Record<OrderStatus, string> = {
  listed: "border-ink-faint text-ink-soft",
  held_scan_required: "border-stamp text-stamp",
  scan_uploaded: "border-ink text-ink",
  released: "border-ink bg-ink text-paper",
  disputed: "border-stamp bg-stamp text-paper",
};

export default function StatusPill({ status, kind }: { status: OrderStatus; kind: ItemKind }) {
  return (
    <span className={`inline-block border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${STYLE[status]}`}>
      {statusLabel(status, kind)}
    </span>
  );
}
