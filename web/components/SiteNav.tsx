import Link from "next/link";

/** Masthead shared by every page. */
export default function SiteNav() {
  return (
    <nav className="border-b border-ink px-4 print:hidden">
      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between gap-4 text-sm">
        <Link href="/" className="display text-2xl">
          ScanDiff
        </Link>
        <div className="flex items-center gap-5 text-ink-soft">
          <Link href="/checkout/mug-001" className="hover:text-ink hover:underline">
            Checkout
          </Link>
          <Link href="/item/car-001" className="hover:text-ink hover:underline">
            Rental
          </Link>
        </div>
      </div>
    </nav>
  );
}
