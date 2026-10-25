/**
 * Asks the server to refund a disputed demo order through the Nessie sandbox
 * and records the outcome on the order. Safe to call again: the server
 * returns the deposit already made for the same dispute.
 */
"use client";

import type { Item } from "./types";
import { getOrder, setRefund, statusAt, type RefundReceipt } from "./orderStatus";

/** Items whose disputes refund the buyer. Matches REFUNDABLE in app/api/refunds/route.ts. */
export const refundsOnDispute = (item: Item) => item.id === "mug-001";

export async function requestRefund(item: Item): Promise<void> {
  const disputedAt = statusAt(getOrder(item.id, item.kind), "disputed");
  if (!disputedAt) return;
  setRefund(item.id, item.kind, { status: "sending", at: new Date().toISOString() });
  try {
    const res = await fetch("/api/refunds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, disputedAt }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? `Refund failed with ${res.status}`);
    setRefund(item.id, item.kind, { status: "sent", at: new Date().toISOString(), receipt: data as RefundReceipt });
  } catch (e) {
    setRefund(item.id, item.kind, {
      status: "failed",
      at: new Date().toISOString(),
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
