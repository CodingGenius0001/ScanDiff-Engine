"use client";

import { useState, useSyncExternalStore } from "react";
import { shareUrl, type ShareTarget } from "@/lib/access";

const noSubscribe = () => () => {};

/**
 * The item's share link, with a copy button. Whoever opens it joins the item
 * once signed in, and can then see its scans and scan a check-in.
 */
export default function ShareLink({ itemId, code, to, title, note }: { itemId: string; code: string; to: ShareTarget; title: string; note: string }) {
  // The page's own origin, so a link copied from a preview deployment points back to it.
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => null);
  const [copied, setCopied] = useState(false);
  const link = origin && shareUrl(origin, itemId, code, to);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the field is selectable instead.
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{title}</p>
      <div className="flex gap-2">
        <input
          readOnly
          value={link ?? ""}
          aria-label={title}
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-11 min-w-0 flex-1 rounded-md border border-rule bg-paper px-3 font-mono text-xs"
        />
        <button
          type="button"
          onClick={copy}
          disabled={!link}
          className="min-h-11 rounded-md border border-ink px-4 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper disabled:opacity-40"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="caption">{note}</p>
    </div>
  );
}
