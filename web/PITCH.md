# Pitch run sheet

One scripted path: list an item, seller baseline, buyer check scan, comparison, accept, payment released. Then the dispute branch. About four minutes, plus the engine's comparison time.

## Before going on stage

- Laptop: open the site, sign in (**Use the demo account** on `/login`). Projector mirrors the laptop.
- iPhone (LiDAR): ScanDiff app installed and signed in, with the same account or any account.
- Pick a fresh item ID nobody has scanned, for example `coffee-maker-7`. The page warns if it is one letter off an existing ID.
- Supabase: the scans table must be in the realtime publication for instant updates (see README). Without it, the page still updates within about 4 seconds.
- Engine: `NEXT_PUBLIC_DIFF_API_URL` set to Adi's public engine. A real comparison takes up to about a minute.
- Fallback: the recorded run, and the mock demos on the home page (`/checkout/mug-001`), which need no phone, engine or network.

## Main path: accept, payment released

| # | Laptop | Phone | Say |
|---|---|---|---|
| 1 | **List an item** in the masthead. Enter the ID, a title and a price. **List item**. A QR code appears. | | "A seller lists a coffee maker." |
| 2 | Waiting for the seller's baseline scan. | Camera app → QR → **Open in ScanDiff**. Scan the item, upload. | "Before packing, the seller scans it. The scan is fingerprinted with SHA-256." |
| 3 | "Seller baseline received". **Open the checkout →**. **Pay with Visa (demo)**. Status: **Held: scan required**. A second QR appears. | | "The buyer pays. With Visa, the money is held, not sent." |
| 4 | Waiting for the buyer's check scan. | Camera → second QR → scan on arrival, upload. | "On arrival the buyer scans it again." |
| 5 | "The buyer's check scan arrived". **Open comparison**. Heat map, findings, histogram. Click a numbered marker. | | "ScanDiff aligns both scans and shows exactly where the shape changed." |
| 6 | Back to the checkout tab. | Tap **Accept** (or click Accept on the comparison page). | "The buyer accepts…" |
| 7 | The checkout flips to **Released** with the receipt and both fingerprints. | | "…and the payment is released the moment the decision lands." |

## Dispute branch

1. On the checkout, **Reset demo** (clears the hold in this browser only), then **Pay with Visa (demo)** again.
2. Scan the second QR again on the phone (a new check scan; an earlier accepted scan never releases a new order).
3. Tap **Dispute** on the phone (or on the comparison page).
4. The checkout shows **Disputed: payment stays held (demo)**. **Open the evidence page**: both scans, fingerprints, every region. Print or save as PDF.

Say: "If something changed in transit, the payment stays held, and both sides get the same tamper-evident record."

## Wording to keep

- "Tamper-evident evidence of condition at handoff." Not proof that the item is as advertised.
- "Demo only, no real payment." There is no Visa or Apple Pay integration.
- LiDAR measures shape, not color: scuffs and stains are not detected.
- Areas only one scan saw are "no data", never damage.

## Rehearsal

`pitch.mjs` in the session scratchpad replays this whole path against a local fake Supabase, with the script playing the phone. Last run: every step passed; each update reached the checkout 3–4 s after the phone's write (polling, no realtime).
