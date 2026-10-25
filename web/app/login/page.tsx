import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";
import { safeNext } from "@/lib/safeNext";

export default function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16">
      <div>
        <p className="caption">ScanDiff</p>
        <h1 className="display text-5xl">Sign in</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Use the same account as the iPhone app. Case files are read as you, through the database&apos;s row-level
          security.
        </p>
      </div>
      <Suspense fallback={null}>
        {searchParams.then((p) => {
          const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
          return <LoginForm next={safeNext(one(p.next))} error={one(p.error_description) ?? one(p.error)} />;
        })}
      </Suspense>
    </main>
  );
}
