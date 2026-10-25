"use client";

import { formatPrice } from "@/lib/format";
import { useOrder } from "@/lib/orderStatus";
import { refundsOnDispute, requestRefund } from "@/lib/refund";
import type { Item } from "@/lib/types";
import LocalTime from "./LocalTime";

/** The refund for a disputed demo order: sending, failed with a retry, or the Nessie deposit. */
export default function RefundNotice({ item }: { item: Item }) {
  const order = useOrder(item.id, item.kind);
  if (!refundsOnDispute(item) || (order.status !== "disputed" && order.status !== "refunded")) return null;
  const refund = order.refund;
  const price = formatPrice(item.priceCents ?? 0);

  if (refund?.status === "sent") {
    const r = refund.receipt;
    return (
      <div className="rounded-md border border-rule bg-paper-deep p-4 text-sm">
        <h3 className="display text-2xl">Refund sent (sandbox)</h3>
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
          <div>
            <dt className="text-xs opacity-75">Amount</dt>
            <dd className="font-semibold">{formatPrice(r.amountCents)}</dd>
          </div>
          <div>
            <dt className="text-xs opacity-75">To</dt>
            <dd>Demo buyer checking ••••{r.accountLast4}</dd>
          </div>
          <div>
            <dt className="text-xs opacity-75">Nessie deposit</dt>
            <dd className="break-all font-mono text-xs font-semibold">{r.id}</dd>
          </div>
          <div>
            <dt className="text-xs opacity-75">Sent</dt>
            <dd>
              <LocalTime iso={refund.at} />
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs opacity-75">
          Recorded in Capital One&apos;s Nessie sandbox. No real money moves.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-sm" role={refund?.status === "failed" ? "alert" : undefined}>
      {refund?.status === "sending" && (
        <>
          <p>Sending the {price} refund to the buyer through the Nessie sandbox…</p>
          <div className="progress w-48" />
        </>
      )}
      {refund?.status === "failed" && <p className="text-stamp">The refund did not go through: {refund.error}</p>}
      {/* A retry is safe: the server returns the deposit already made for this dispute. */}
      {refund?.status !== "sending" && (
        <button
          type="button"
          onClick={() => void requestRefund(item)}
          className="min-h-11 key self-start bg-ink px-5 font-semibold text-paper print:hidden"
        >
          {refund ? "Retry refund" : `Refund ${price} to the buyer`}
        </button>
      )}
    </div>
  );
}
