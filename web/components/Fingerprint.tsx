/** SHA-256 fingerprint field. Placeholder until scans are hashed and anchored. */
export default function Fingerprint({ sha256 }: { sha256: string | null }) {
  if (sha256) return <code className="break-all font-mono text-xs">{sha256}</code>;
  return (
    <span className="text-xs text-ink-soft">
      <code className="font-mono">sha256: pending</code> (placeholder, not yet computed or anchored)
    </span>
  );
}
