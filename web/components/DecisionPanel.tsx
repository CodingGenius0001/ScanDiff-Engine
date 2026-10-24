"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { approve, dispute, useOrder } from "@/lib/orderStatus";
import type { Item } from "@/lib/types";
import DemoBadge from "./DemoBadge";
import StatusPill from "./StatusPill";

export default function DecisionPanel({ item }: { item: Item }) {
  const order = useOrder(item.id, item.kind);
  const router = useRouter();
  const ready = order.status === "scan_uploaded";
  const shipping = item.kind === "shipping";

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{shipping ? "Buyer decision" : "Return decision"}</h2>
        <StatusPill status={order.status} kind={item.kind} />
      </div>
      {shipping && <DemoBadge className="mt-2 w-fit" />}
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        ScanDiff provides tamper-evident evidence of condition at handoff. It does not verify that the item is as
        advertised.
      </p>
      {!ready && (order.status === "listed" || order.status === "held_scan_required") && (
        <p className="mt-2 text-sm">
          Accept and Dispute become available after the buyer&apos;s scan is uploaded.{" "}
          <Link href={`/checkout/${item.id}`} className="font-semibold underline">
            Go to checkout
          </Link>
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            if (approve(item.id, item.kind) && shipping) router.push(`/checkout/${item.id}`);
          }}
          className="min-h-11 rounded-lg bg-emerald-600 px-4 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Accept
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            if (dispute(item.id, item.kind)) router.push(`/item/${item.id}/evidence`);
          }}
          className="min-h-11 rounded-lg border-2 border-red-600 px-4 font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950"
        >
          Dispute
        </button>
        <Link
          href={`/item/${item.id}/evidence`}
          className="col-span-2 flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold underline sm:col-span-1"
        >
          Evidence page
        </Link>
      </div>
      {order.status === "released" && shipping && (
        <p className="mt-2 text-sm">
          Payment released (demo).{" "}
          <Link href={`/checkout/${item.id}`} className="font-semibold underline">
            View receipt
          </Link>
        </p>
      )}
      {order.status === "disputed" && (
        <p className="mt-2 text-sm">
          Disputed.{" "}
          <Link href={`/item/${item.id}/evidence`} className="font-semibold underline">
            Open the evidence page
          </Link>
        </p>
      )}
    </section>
  );
}
