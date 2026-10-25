import { Suspense } from "react";
import SellView from "@/components/SellView";
import SignInPrompt from "@/components/SignInPrompt";
import { currentUser, serverSupabase } from "@/lib/supabaseServer";

export default function SellPage() {
  return (
    <Suspense fallback={null}>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  const db = await serverSupabase();
  if (!db || !(await currentUser(db))) return <SignInPrompt next="/sell" />;
  return <SellView />;
}
