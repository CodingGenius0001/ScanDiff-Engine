/** Warning label on every payment screen: an orange status light and plain text. */
export default function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <p
      className={`inline-flex items-center gap-2 rounded-full border border-stamp/60 px-3 py-1 text-xs font-medium text-stamp ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-stamp" aria-hidden />
      Demo only, no real payment.
    </p>
  );
}
