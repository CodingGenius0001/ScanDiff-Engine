/**
 * Order and handoff status flow, in one small module.
 *
 *   listed -> held_scan_required -> scan_uploaded -> released
 *                                                 -> disputed -> refunded
 *
 * Now: kept in memory and mirrored to localStorage.
 * Later: call `applyServerStatus` from real database updates instead of
 * (or as well as) the local transitions below.
 *
 * DEMO ONLY: no real payment is taken, held or released. A refund is a
 * deposit in Capital One's Nessie sandbox (lib/refund.ts), not real money.
 */
"use client";

import { useSyncExternalStore } from "react";
import type { ItemKind } from "./types";
import { readJSON, writeJSON } from "./storage";

export type OrderStatus = "listed" | "held_scan_required" | "scan_uploaded" | "released" | "disputed" | "refunded";

/** The deposit Nessie recorded for a refund (see app/api/refunds/route.ts). */
export interface RefundReceipt {
  id: string;
  amountCents: number;
  description: string;
  status: string;
  accountLast4: string;
}

export type RefundState =
  | { status: "sending"; at: string }
  | { status: "failed"; at: string; error: string }
  | { status: "sent"; at: string; receipt: RefundReceipt };

export interface OrderState {
  itemId: string;
  status: OrderStatus;
  history: { status: OrderStatus; at: string }[];
  refund?: RefundState;
}

const STORAGE_KEY = "scandiff.orders.v1";

const NEXT: Record<string, { from: OrderStatus; to: OrderStatus }> = {
  pay: { from: "listed", to: "held_scan_required" },
  uploadScan: { from: "held_scan_required", to: "scan_uploaded" },
  approve: { from: "scan_uploaded", to: "released" },
  dispute: { from: "scan_uploaded", to: "disputed" },
  refund: { from: "disputed", to: "refunded" },
};

/** A rental car return already has its return scan, so it starts at review. */
export function initialStatus(kind: ItemKind): OrderStatus {
  return kind === "rental" ? "scan_uploaded" : "listed";
}

let orders: Record<string, OrderState> | null = null;
const listeners = new Set<() => void>();

function all(): Record<string, OrderState> {
  if (!orders) orders = readJSON<Record<string, OrderState>>(STORAGE_KEY) ?? {};
  return orders;
}

function commit(next: OrderState) {
  orders = { ...all(), [next.itemId]: next };
  writeJSON(STORAGE_KEY, orders);
  listeners.forEach((l) => l());
}

function fresh(itemId: string, kind: ItemKind): OrderState {
  return { itemId, status: initialStatus(kind), history: [] };
}

export function getOrder(itemId: string, kind: ItemKind): OrderState {
  return all()[itemId] ?? fresh(itemId, kind);
}

function transition(itemId: string, kind: ItemKind, action: keyof typeof NEXT): boolean {
  const cur = getOrder(itemId, kind);
  const step = NEXT[action];
  if (cur.status !== step.from) return false;
  commit({
    ...cur,
    itemId,
    status: step.to,
    history: [...cur.history, { status: step.to, at: new Date().toISOString() }],
  });
  return true;
}

export const pay = (itemId: string, kind: ItemKind) => transition(itemId, kind, "pay");
export const uploadScan = (itemId: string, kind: ItemKind) => transition(itemId, kind, "uploadScan");
export const approve = (itemId: string, kind: ItemKind) => transition(itemId, kind, "approve");
export const dispute = (itemId: string, kind: ItemKind) => transition(itemId, kind, "dispute");

/** Records a refund attempt; a sent refund moves a disputed order to refunded. */
export function setRefund(itemId: string, kind: ItemKind, refund: RefundState) {
  commit({ ...getOrder(itemId, kind), refund });
  if (refund.status === "sent") transition(itemId, kind, "refund");
}

export function resetOrder(itemId: string, kind: ItemKind) {
  commit(fresh(itemId, kind));
}

/** Entry point for real status updates later (for example a database subscription). */
export function applyServerStatus(itemId: string, status: OrderStatus, at: string) {
  const cur = all()[itemId];
  commit({ itemId, status, history: [...(cur?.history ?? []), { status, at }] });
}

export function statusAt(order: OrderState, status: OrderStatus): string | undefined {
  return [...order.history].reverse().find((h) => h.status === status)?.at;
}

export function statusLabel(status: OrderStatus, kind: ItemKind): string {
  if (kind === "rental") {
    return {
      listed: "Awaiting pickup",
      held_scan_required: "Awaiting return scan",
      scan_uploaded: "Return scan ready for review",
      released: "Return accepted",
      disputed: "Return disputed",
      refunded: "Refunded",
    }[status];
  }
  return {
    listed: "Listed",
    held_scan_required: "Held: scan required",
    scan_uploaded: "Scan uploaded: awaiting buyer review",
    released: "Released",
    disputed: "Disputed",
    refunded: "Refunded",
  }[status];
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    orders = null;
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

const serverSnapshots = new Map<string, OrderState>();

export function useOrder(itemId: string, kind: ItemKind): OrderState {
  return useSyncExternalStore(
    subscribe,
    () => all()[itemId] ?? serverSnapshot(itemId, kind),
    () => serverSnapshot(itemId, kind),
  );
}

/** Stable object per item so useSyncExternalStore does not loop. */
function serverSnapshot(itemId: string, kind: ItemKind): OrderState {
  let s = serverSnapshots.get(itemId);
  if (!s) serverSnapshots.set(itemId, (s = fresh(itemId, kind)));
  return s;
}
