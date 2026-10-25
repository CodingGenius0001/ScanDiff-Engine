import { notFound } from "next/navigation";
import { Suspense } from "react";
import CheckoutView from "@/components/CheckoutView";
import RealCheckoutView from "@/components/RealCheckoutView";
import NoAccess from "@/components/NoAccess";
import SignInPrompt from "@/components/SignInPrompt";
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
        if (item === "sign_in") return <SignInPrompt next={`/checkout/${encodeURIComponent(id)}`} />;
        if (item === "no_access") return <NoAccess itemId={id} />;
        if (!item || item.kind !== "shipping") notFound();
        // Items scanned with the iPhone app: held until their real check scan is accepted.
        if (item.source === "supabase") return <RealCheckoutView item={item} />;
        if (item.priceCents === undefined) notFound();
        return <CheckoutView item={item} />;
      })}
    </Suspense>
  );
}
