import Link from "next/link";

/** Floating pill navigation shared by every page. */
export default function SiteNav() {
  return (
    <nav className="sticky top-0 z-20 px-4 pt-3 print:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2">
        <Link
          href="/"
          className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-zinc-950/80 px-4 text-sm font-semibold backdrop-blur"
        >
          <Logo />
          ScanDiff
        </Link>
        <div className="flex h-10 items-center rounded-full border border-white/10 bg-zinc-950/80 px-1 text-sm text-zinc-400 backdrop-blur">
          <Link href="/checkout/mug-001" className="rounded-full px-3 py-1.5 hover:text-white">
            Checkout
          </Link>
          <span className="h-4 w-px bg-white/10" aria-hidden />
          <Link href="/item/car-001" className="rounded-full px-3 py-1.5 hover:text-white">
            Rental
          </Link>
        </div>
      </div>
    </nav>
  );
}

/** Concentric scan rings. */
function Logo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="text-accent">
      <circle cx="9" cy="9" r="7.5" fill="none" stroke="currentColor" strokeOpacity="0.45" />
      <circle cx="9" cy="9" r="4.5" fill="none" stroke="currentColor" strokeOpacity="0.8" />
      <circle cx="9" cy="9" r="1.75" fill="currentColor" />
    </svg>
  );
}
