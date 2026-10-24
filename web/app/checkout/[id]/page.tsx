import { notFound } from "next/navigation";
import { Suspense } from "react";
import CheckoutView from "@/components/CheckoutView";
import { getItem, listItems } from "@/lib/items";

export function generateStaticParams() {
  return listItems()
    .filter((i) => i.kind === "shipping")
    .map((i) => ({ id: i.id }));
}

export default function CheckoutPage({ params }: PageProps<"/checkout/[id]">) {
  return (
    <Suspense fallback={null}>
      {params.then(async ({ id }) => {
        const item = await getItem(id);
        // Real Supabase items have no price yet, so they have no demo checkout.
        if (!item || item.kind !== "shipping" || item.priceCents === undefined) notFound();
        return <CheckoutView item={item} />;
      })}
    </Suspense>
  );
}
