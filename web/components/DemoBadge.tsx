export default function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <p
      className={`rounded-md border border-amber-400 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100 ${className}`}
    >
      Demo only, no real payment.
    </p>
  );
}
