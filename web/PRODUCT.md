# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Now: Cal Hacks 13.0 judges** watching a live demo (deadline Sun Oct 25, 2026, 9 AM PDT). They see the site projected from a laptop while a teammate scans a real item with an iPhone on stage. They need to grasp the problem, the mechanism and the result in a few minutes.
- **As a product: people settling an item's condition at handoff.** Sellers and buyers in online resale and shipping/returns, and owners and renters of rented items (cameras, bikes, cars). The seller or owner scans before handing over; the buyer or renter scans on arrival or return; both read the comparison and the evidence record when they disagree.

## Product Purpose

ScanDiff replaces "trust me" in condition disputes with a measured before-and-after record of an item's shape. The website lets a seller list an item and get QR codes that open the iPhone app on it, shows the comparison of two scans (3D heat map, findings, histogram), runs a demo checkout that holds payment until the buyer accepts, and produces a printable evidence page. Success: a buyer or judge can see, without explanation, exactly where an item's shape changed and how sure the system is.

## Positioning

Tamper-evident evidence of an item's condition at handoff: LiDAR scans before and after, aligned and measured to the millimeter, with SHA-256 fingerprints on every file. It is not proof that an item is as advertised. It measures shape, not color.

## Operating Context

- Live demo flow scripted in `PITCH.md`: list an item, seller baseline scan, buyer check-in scan, comparison, accept (payment released) or dispute (payment held, evidence page).
- The iPhone app (`ios/`, Koushik) captures and uploads scans to Supabase; the engine (`engine/`, Adi, https://engine.scandiff.us) compares them; this website (`web/`, Keshav) reads both. Only `web/` is in scope for this record's owner.
- Deployed at https://scandiff.us (Vercel, root directory `web`). Real items require sign-in (Google or the demo account); the mock demos (`mug-001`, `car-001`) are public and work without phone, engine or network.

## Capabilities and Constraints

- Payments are a demo only: no card is charged, held or released; no Visa or Apple Pay integration. Every payment screen says so.
- Mock data is always labeled as mock. Comparisons from the engine are labeled as engine results.
- LiDAR measures shape, not color: scuffs and stains with no depth are not detected. Areas only one scan saw are "no data", never damage.
- Verdicts: accept, damage likely, needs review, inconclusive (with the engine's reason). Decisions are `accept` or `dispute`, written on the check scan.
- Data is read as the signed-in user through row-level security; no service-role key in the browser.
- Item IDs are lowercase and assigned automatically (`mug-002`); scan links are `scandiff://scan?item=<id>&kind=baseline|check`.

## Brand Commitments

- Name: ScanDiff.
- Voice: bold and confident, pitched to persuade, but never at the cost of the honesty above. The user rejected an "SF AI startup" feel; the site should read as professional.
- Wording to keep (from `PITCH.md`): "Tamper-evident evidence of condition at handoff." "Demo only, no real payment."

## Evidence on Hand

- Real scans in Supabase (for example `coffee-maker-1`) and live engine comparisons.
- Mock demo scenarios generated in the browser (`lib/mock/`): a ceramic mug with a dent, a missing handle piece and normal wear; a rental car with a missing mirror.
- Contract sample: `contract/diff_response.json` (a real engine response).
- No customers, testimonials, statistics, partnerships or pricing exist. Do not invent them.

## Product Principles

1. Show the measurement, not a claim: the heat map and the numbers carry the argument.
2. Never overstate: every limit (shape only, demo payment, mock data, no data ≠ damage) is stated where it matters.
3. Both sides read the same record: evidence is neutral between seller and buyer.
4. The demo must survive the stage: mock paths work offline, real paths update live.
