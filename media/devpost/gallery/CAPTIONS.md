# Devpost gallery

Upload in this order. Every image is 3:2 or 16:10 and under 5 MB. Use `00-cover-home.png` as the thumbnail.

| File | Caption |
|---|---|
| `00-cover-home.png` | ScanDiff: measured, not argued. Settle "it arrived broken" with millimeters, not photos. |
| `01-problem-and-how-it-works.png` | Photos can't settle a condition dispute. ScanDiff measures it instead: baseline, check-in, comparison, decision. |
| `02-architecture.png` | The iPhone app uploads fingerprinted scans to Supabase; the engine on AWS compares them; the website and the app show the result. |
| `03-app-guided-capture.png` | Guided LiDAR capture: a setup checklist, automatic object detection, guided orbits and an optional bottom pass. |
| `04-app-textured-model-sha256.png` | A textured 3D model built on the phone (note the embossed logo), with every file sealed by SHA-256 before upload. |
| `05-app-case-files-and-qr.png` | Every item is a case file. QR codes from the website or the phone open the app on the right item. |
| `06-web-comparison-verdict.png` | The comparison on scandiff.us: verdict with confidence and reason, both scans side by side. |
| `07-web-heat-map.png` | The heat map on the 3D model: where the shape changed, region by region. |
| `08-app-heat-map-3d.png` | The same heat map in 3D on the phone, with the legend: blue is a dent, red is added material, gray is unchanged. |
| `09-engine-pipeline.png` | Inside the engine: fingerprints, FPFH + RANSAC then ICP alignment, signed distances, noise floor, coverage, DBSCAN regions, Claude vision, verdict. |
| `10-web-findings-histogram.png` | Numbered findings with depth and confidence, and the distribution of change across the surface. |
| `11-web-checkout-test-card.png` | Demo checkout with a test Visa card. The payment is held until the buyer's check-in scan is accepted. |
| `12-web-buyer-decision.png` | The buyer reviews the comparison and accepts or disputes. |
| `13-web-payment-released.png` | Accept releases the held payment, live through Supabase Realtime. Demo only, no real money. |
| `14-app-accept-or-dispute.png` | The decision from the phone: accepted releases the payment, disputed keeps it held with the evidence. |
| `15-web-dispute-nessie-refund.png` | A dispute records a refund in Capital One's Nessie sandbox and opens the printable evidence page. |
| `16-web-evidence-page.png` | The evidence page: both exhibits, their SHA-256 fingerprints and every flagged region, for both sides. |
| `17-web-rental-car.png` | The same engine on a rental car: pickup scan against return scan. |
| `18-engine-api.png` | The diff engine's API at engine.scandiff.us. |

Source images: app frames are full-resolution stills from the iPhone screen recording (`media/VDMJ2492.MP4`); website shots are 1440×900 at 2× from the live site; the diagrams are rendered in the website's style.
