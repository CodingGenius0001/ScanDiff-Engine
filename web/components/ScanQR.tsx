import QRCode from "qrcode";
import { scanLink, type ScanKind } from "@/lib/itemId";

const TEXT: Record<ScanKind, string> = {
  baseline: "Seller: scan before packing",
  check: "Buyer: scan on arrival",
};

/**
 * A QR code for the scandiff:// link. The iPhone Camera app reads it and
 * offers to open ScanDiff, which starts the scan for this item. Drawn as
 * one SVG path, so it renders on the server and prints sharply.
 */
export default function ScanQR({ itemId, kind, existing = false }: { itemId: string; kind: ScanKind; existing?: boolean }) {
  let link: string;
  try {
    link = scanLink(itemId, kind, { existing });
  } catch (e) {
    // Never take the page down over a QR code: say why there is none.
    return (
      <figure className="flex flex-col items-center gap-2 text-center">
        <span className="display block text-xl">{TEXT[kind]}</span>
        <figcaption className="caption max-w-56">
          No QR code: {e instanceof Error ? e.message : String(e)} Start the scan in the iPhone app instead.
        </figcaption>
      </figure>
    );
  }
  const { modules } = QRCode.create(link, { errorCorrectionLevel: "M" });
  const quiet = 4;
  const size = modules.size + quiet * 2;
  let path = "";
  for (let y = 0; y < modules.size; y++) {
    for (let x = 0; x < modules.size; x++) {
      if (modules.get(y, x)) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }
  }
  return (
    <figure className="flex flex-col items-center gap-2">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-52 w-52 bg-white"
        shapeRendering="crispEdges"
        role="img"
        aria-label={`QR code for ${link}`}
      >
        <path d={path} fill="#141413" />
      </svg>
      <figcaption className="text-center">
        <span className="display block text-xl">{TEXT[kind]}</span>
        <span className="caption block">Point the iPhone Camera at the code, then tap Open in ScanDiff.</span>
        <a href={link} className="mt-1 block break-all font-mono text-[11px] text-ink-soft underline">
          {link}
        </a>
      </figcaption>
    </figure>
  );
}
