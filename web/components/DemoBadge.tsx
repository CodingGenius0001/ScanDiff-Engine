/** Rubber-stamp label on every payment screen. */
export default function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <p
      className={`-rotate-1 border-2 border-stamp px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-stamp ${className}`}
    >
      Demo only, no real payment.
    </p>
  );
}
