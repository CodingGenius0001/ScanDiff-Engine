/**
 * POST /api/refunds { itemId, disputedAt }: refunds a disputed demo order in
 * the Nessie sandbox. Only the mock mug for now; the amount is the item's
 * listed price, never a number from the browser.
 */
import { MOCK_ITEMS } from "@/lib/mock/catalog";
import { NessieError, nessieConfigured, refundBuyer } from "@/lib/nessie";

/** Items whose disputes refund the buyer. */
const REFUNDABLE = new Set(["mug-001"]);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { itemId?: unknown; disputedAt?: unknown } | null;
  const item = MOCK_ITEMS.find((i) => i.id === body?.itemId);
  if (!item || !REFUNDABLE.has(item.id) || item.priceCents === undefined) {
    return Response.json({ error: "This item cannot be refunded" }, { status: 404 });
  }
  const disputedAt = typeof body?.disputedAt === "string" ? new Date(body.disputedAt) : null;
  if (!disputedAt || Number.isNaN(disputedAt.getTime())) {
    return Response.json({ error: "disputedAt must be an ISO timestamp" }, { status: 400 });
  }
  if (!nessieConfigured()) {
    return Response.json({ error: "Refunds are not set up on this server (NESSIE_API_KEY)" }, { status: 503 });
  }

  // One refund per dispute: the description doubles as the idempotency key.
  const description = `ScanDiff refund: ${item.title} (${item.id}), disputed ${disputedAt.toISOString()}`;
  try {
    return Response.json(await refundBuyer(item.priceCents, description));
  } catch (e) {
    if (!(e instanceof NessieError)) throw e;
    console.error(e.message);
    return Response.json({ error: "The Nessie sandbox did not accept the refund" }, { status: 502 });
  }
}
