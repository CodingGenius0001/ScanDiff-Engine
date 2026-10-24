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
      {params.then(({ id }) => {
        const item = getItem(id);
        if (!item || item.kind !== "shipping") notFound();
        return <CheckoutView item={item} />;
      })}
    </Suspense>
  );
}
