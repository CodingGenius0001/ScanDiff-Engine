# ScanDiff

**Tamper-evident 3D evidence of an item's condition at handoff.** Built at Cal Hacks 13.0.

Live site: [scandiff.us](https://scandiff.us)

## The problem

Every time a physical item changes hands, someone has to trust the other side about its condition:

- **Online resale.** A buyer says the item arrived broken. The seller says it left in perfect shape. Both have a few photos, and neither can prove when the damage happened.
- **Rentals.** A rented camera, bike or car comes back, and the owner finds a dent. Was it there before? The check-out photos were taken quickly, from a few angles, in different light.
- **Shipping and returns.** A returned item comes back damaged, or the wrong item comes back. The platform has to settle the claim from two stories and a handful of pictures.

Photos are the usual evidence, and they are weak evidence. They only show the angles someone chose, they flatten depth, so a 3 mm dent can vanish under the wrong light, and two sets of photos can't be compared objectively. Nothing ties a photo to the moment of handoff either. So disputes come down to one person's word against another's, and the platform, the seller or the buyer eats the loss.

## What ScanDiff does

ScanDiff replaces "trust me" with a measured, before-and-after record of the item's shape.

1. **Baseline at handoff.** Before packing or lending the item, the seller scans it with a LiDAR iPhone in the ScanDiff app. The app builds a 3D model and saves key photos with their camera poses. It fingerprints every file with SHA-256 and uploads the scan.
2. **Check-in on arrival.** The buyer or renter scans the same item when it arrives or comes back. A QR code from the website opens the app straight on the right item.
3. **Comparison.** The engine aligns the two 3D scans and measures, point by point, how far the surface moved, down to a few millimetres. It groups the changes into regions. A vision model (Claude) then looks at before and after photo crops of each one and says whether it's a dent, a missing part, a scuff or normal wear.
4. **Evidence.** The website shows a heat map of the change on the 3D model, a histogram, and numbered findings. A printable evidence page lists both scans' fingerprints, so anyone can check that the files haven't changed since upload.
5. **Decision.** The buyer accepts or disputes. In the demo checkout, the payment is held until the check-in scan is accepted, and a dispute keeps it held, with the evidence page attached.

What it is and isn't:

- It is **tamper-evident evidence of condition at handoff**. It does not prove that an item is as advertised.
- LiDAR measures **shape, not color**: scuffs and stains with no depth are not detected from the geometry.
- Only surface that **both scans saw** is compared. Areas only one scan saw are reported as "no data", never as damage.
- Payments are a **demo**. No real money is held or moved.

## How it fits together

```
iPhone app (ios/)  ──upload──▶  Supabase (scans table + Storage)  ◀──read──  Website (web/)
        │                                   ▲                                   │
        └──────────── POST /diff ──▶  Engine (engine/)  ◀──── POST /diff ───────┘
```

| Folder | What it is |
|---|---|
| [`ios/`](ios/README.md) | SwiftUI capture app: guided LiDAR capture, on-device reconstruction, key photos with poses, SHA-256 fingerprints, upload, Accept / Dispute. |
| `engine/` | Python diff engine (FastAPI, Open3D): alignment, signed point-to-surface distances, coverage, change regions, vision classification, heat map and verdict. Upload format: [`engine/UPLOAD_FORMAT.md`](engine/UPLOAD_FORMAT.md). |
| [`web/`](web/README.md) | Next.js site at scandiff.us: list an item, QR codes for the app, comparison viewer, live demo checkout, printable evidence page. |
| [`contract/`](contract/README.md) | The `POST /diff` response contract shared by the engine, the app and the website. |

## Team

- Adithya Sripada: diff engine
- Koushik Jandhyala: iPhone app and Supabase
- Keshav Pillarisetti: website
