import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-3xl font-bold">ScanDiff</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Compares a baseline 3D scan with a later scan and shows where the shape changed. ScanDiff provides
          tamper-evident evidence of condition at handoff. It does not verify that an item is as advertised.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Phone LiDAR measures shape, not color, so scuffs and stains are not detected. All data on this site is mock
          data.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/checkout/mug-001"
          className="rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Shipping and returns</div>
          <div className="mt-1 text-lg font-semibold">Demo checkout: ceramic mug</div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Payment held until the buyer approves the comparison. Demo only, no real payment.
          </p>
        </Link>
        <Link
          href="/item/car-001"
          className="rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Rental car</div>
          <div className="mt-1 text-lg font-semibold">Pickup and return timeline</div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Compare the pickup scan with the return scan.</p>
        </Link>
        <Link
          href="/item/mug-001"
          className="rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-400 sm:col-span-2 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="text-lg font-semibold">Open the mug comparison directly</div>
        </Link>
      </div>
    </main>
  );
}
