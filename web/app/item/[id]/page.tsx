import { notFound } from "next/navigation";
import { Suspense } from "react";
import ItemView from "@/components/ItemView";
import { getItem, listItems } from "@/lib/items";

export function generateStaticParams() {
  return listItems().map((i) => ({ id: i.id }));
}

export default function ItemPage({ params }: PageProps<"/item/[id]">) {
  return (
    <Suspense fallback={null}>
      {params.then(({ id }) => {
        const item = getItem(id);
        if (!item) notFound();
        return <ItemView item={item} />;
      })}
    </Suspense>
  );
}
