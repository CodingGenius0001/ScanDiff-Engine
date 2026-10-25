/**
 * Demo checkout for real items scanned with the iPhone app.
 *
 * The listing (title, price) and the payment hold live in this browser,
 * because the database has no table for them. Everything after the hold
 * comes from the scans table, live:
 *
 *   listed -> held_scan_required   Pay (demo) in the browser
 *          -> scan_uploaded        the buyer's check scan arrives
 *          -> released             decision = accept on that scan
 *          -> disputed             decision = dispute on that scan
 *
 * The payment is released only on an accepted check scan uploaded after the
 * hold, so an earlier scan's decision can never release a new order.
 *
 * DEMO ONLY: no real payment is taken, held or released.
 */
"use client";

import { useSyncExternalStore } from "react";
import { newestCheck } from "./liveScans";
import type { OrderStatus } from "./orderStatus";
import type { Decision, ScanRow } from "./scans";
import { readJSON, writeJSON } from "./storage";

export const DEFAULT_PRICE_CENTS = 4800;

export interface Listing {
  title: string;
  priceCents: number;
  listedAt: string;
}

export interface Hold {
  at: string;
  /** Highest scan version when the payment was held; only newer check scans count. */
  afterVersion: number;
}

export interface RealOrderRecord {
  listing?: Listing;
  hold?: Hold;
  /** When this browser first saw the decision, per check scan. */
  decided?: { scanId: string; decision: Decision; at: string };
}

const STORAGE_KEY = "scandiff.realOrders.v1";
const EMPTY: RealOrderRecord = {};

let records: Record<string, RealOrderRecord> | null = null;
const listeners = new Set<() => void>();

function all(): Record<string, RealOrderRecord> {
  if (!records) records = readJSON<Record<string, RealOrderRecord>>(STORAGE_KEY) ?? {};
  return records;
}

function update(itemId: string, change: (cur: RealOrderRecord) => RealOrderRecord) {
  records = { ...all(), [itemId]: change(all()[itemId] ?? EMPTY) };
  writeJSON(STORAGE_KEY, records);
  listeners.forEach((l) => l());
}

export function saveListing(itemId: string, listing: Listing) {
  update(itemId, (cur) => ({ ...cur, listing }));
}

/** Pay (demo): hold the payment until a check scan newer than every current scan is accepted. */
export function placeHold(itemId: string, rows: ScanRow[]) {
  const afterVersion = Math.max(0, ...rows.map((r) => r.version));
  update(itemId, (cur) => ({ ...cur, hold: { at: new Date().toISOString(), afterVersion }, decided: undefined }));
}

/** Back to listed. Scans and decisions in the database are not touched. */
export function resetHold(itemId: string) {
  update(itemId, (cur) => ({ listing: cur.listing }));
}

/** Remember when the decision on this check scan was first seen, for the receipt. */
export function noteDecision(itemId: string, check: ScanRow) {
  const cur = all()[itemId]?.decided;
  if (!check.decision || (cur?.scanId === check.id && cur.decision === check.decision)) return;
  update(itemId, (r) => ({ ...r, decided: { scanId: check.id, decision: check.decision!, at: new Date().toISOString() } }));
}

export interface RealOrder {
  status: OrderStatus;
  /** The buyer's check scan that counts for this order, once uploaded. */
  check?: ScanRow;
  baseline?: ScanRow;
}

export function realOrderStatus(itemId: string, record: RealOrderRecord, rows: ScanRow[]): RealOrder {
  const baseline = rows.filter((r) => r.kind === "baseline").at(-1);
  if (!record.hold) return { status: "listed", baseline };
  const latest = newestCheck(itemId, rows);
  const check = latest && latest.version > record.hold.afterVersion ? latest : undefined;
  if (!check) return { status: "held_scan_required", baseline };
  const status = check.decision === "accept" ? "released" : check.decision === "dispute" ? "disputed" : "scan_uploaded";
  return { status, check, baseline };
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    records = null;
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useRealOrderRecord(itemId: string): RealOrderRecord {
  return useSyncExternalStore(
    subscribe,
    () => all()[itemId] ?? EMPTY,
    () => EMPTY,
  );
}
