"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AccountLink from "./AccountLink";

const REPO = "https://github.com/CodingGenius0001/ScanDiff-Engine";

/** Thin line icons, drawn on a 24 px grid like the labels on a hardware panel. */
const ICONS = {
  checkout: (
    <>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
    </>
  ),
  list: (
    <>
      <path d="M3 12.6V4h8.6l9 9-8.6 8.6z" />
      <circle cx="7.5" cy="8.5" r="1.5" />
    </>
  ),
  rental: (
    <>
      <path d="M3 15.5v-3l2.2-4.6A2 2 0 0 1 7 6.8h10a2 2 0 0 1 1.8 1.1l2.2 4.6v3z" />
      <path d="M3 12.5h18" />
      <circle cx="7.5" cy="17.5" r="1.8" />
      <circle cx="16.5" cy="17.5" r="1.8" />
    </>
  ),
};

const LINKS = [
  { href: "/checkout/mug-001", match: "/checkout", label: "checkout", sub: "demo order", icon: ICONS.checkout },
  { href: "/sell", match: "/sell", label: "list an item", sub: "seller baseline", icon: ICONS.list },
  { href: "/item/car-001", match: "/item/car-001", label: "rental", sub: "pickup and return", icon: ICONS.rental, wide: true },
];

/** Masthead shared by every page. */
export default function SiteNav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-rule px-4 print:hidden">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="ScanDiff home">
          <Mark />
          <span className="display text-[22px] tracking-tight">scandiff</span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          {LINKS.map((l) => {
            const active = pathname.startsWith(l.match);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-label={l.label}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-ink-soft transition-colors hover:text-ink lg:px-3 ${l.wide ? "hidden md:flex" : ""} ${active ? "text-ink" : ""}`}
              >
                <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" aria-hidden>
                  {l.icon}
                </svg>
                <span className="hidden flex-col leading-tight sm:flex">
                  <span className="text-[15px]">{l.label}</span>
                  <span className="text-[11px] text-ink-faint">{l.sub}</span>
                </span>
                {active && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-signal sm:static sm:self-start" aria-hidden />}
              </Link>
            );
          })}
          <span className="mx-1 hidden h-7 border-l border-rule sm:block" aria-hidden />
          <span className="px-1 text-sm text-ink-soft">
            <AccountLink />
          </span>
          <a
            href={REPO}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="ScanDiff on GitHub"
            title="ScanDiff on GitHub"
            className="rounded-md p-2 text-ink-soft transition-colors hover:text-ink"
          >
            <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
        </div>
      </div>
    </nav>
  );
}

/** The mark: two outlines of one object, the second offset, where they differ is the finding. */
function Mark() {
  return (
    <svg viewBox="0 0 28 28" className="h-7 w-7" fill="none" strokeWidth="1.25" aria-hidden>
      <circle cx="12" cy="14" r="8" stroke="currentColor" />
      <circle cx="16" cy="14" r="8" stroke="currentColor" strokeDasharray="2 2" opacity="0.6" />
      <circle cx="21.6" cy="8.4" r="1.6" fill="var(--stamp)" stroke="none" />
    </svg>
  );
}
