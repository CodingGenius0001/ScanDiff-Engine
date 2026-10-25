import { notFound } from "next/navigation";
import { Suspense } from "react";
import EvidenceView from "@/components/EvidenceView";
import SignInPrompt from "@/components/SignInPrompt";
import { getItem, listItems } from "@/lib/items";

export function generateStaticParams() {
  return listItems().map((i) => ({ id: i.id }));
}

export default function EvidencePage({ params }: PageProps<"/item/[id]/evidence">) {
  return (
    <Suspense fallback={null}>
      {params.then(async ({ id }) => {
        const item = await getItem(id);
        if (item === "sign_in") return <SignInPrompt next={`/item/${encodeURIComponent(id)}/evidence`} />;
        if (!item) notFound();
        return <EvidenceView item={item} />;
      })}
    </Suspense>
  );
}
