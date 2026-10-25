# ScanDiff demo video: shot list

Source of truth: `VIDEO_SCRIPT.md` (order and wording). Assets: `media/INVENTORY.md`. Status: **approved with the decisions below**; in build.

## Decisions (answered 2026-10-25)

1. **Runtime: keep every recorded line, ≈ 4:20.** Pauses are tightened (never sped up); no recorded line is cut. Option B below is kept for reference only.
2. **Mug on web, charger on phone.** The VO says "mug", so captions say "mug". Website shots use the demo mug (`mug-001`: checkout, heat map, evidence). iPhone capture shots show the Belkin charger, with a lower-third the first time: "Capture shown on a wireless charger".
3. **VO:** `media/Presidio Parkway Inn-1.m4a` (4:18, the whole script except one paragraph) + the WhatsApp take ("Today anyone can generate…", used as-is: no re-records possible). Selection and edits: `media/vo/TAKES.md`.
4. **No background music** for now. VO plus very quiet UI foley so gaps are never dead silent. Music can be added later without re-cutting.

## Look and feel

| | |
|---|---|
| Canvas | 1920×1080, 30 fps, H.264, 90 px safe margins |
| Palette (from `web/app/globals.css`) | Background `#0b0b0b`, panels `#111111`/`#161616`, hairlines `#2a2a29`, ink `#ededeb`, soft ink `#a2a29e`, **one accent: signal orange `#ff6a1a`** (also the iOS app's accent). The heat map's blue/gray/red stays the only other color, as on the site |
| Type | **Geist Sans** (site font), light 300 for display at −0.035 em tracking; **Geist Mono** for IDs, hashes, mm values |
| Logo | The site's mark (`web/components/SiteNav.tsx`): a solid circle and a dashed circle overlapping (before/after), plus an orange dot, with the wordmark "scandiff". Animated: the dashed circle slides onto the solid one, then the dot lands |
| iPhone footage | Inside a minimal titanium-black iPhone frame with Dynamic Island, drop shadow on `#0b0b0b`. Status bar masked to a clean bar (hides the red recording pill) |
| Web footage | Minimal dark browser frame: three dots, URL pill `scandiff.us/…`, no tabs, no bookmarks |
| Camera b-roll | HLG BT.2020 ProRes tone-mapped to Rec.709 with one LUT for every clip, then a gentle shared grade (slight desaturation of the red counter so it doesn't fight the orange). IMG_6526 rotated 180°. Cut tight, never more than 2.5 s per b-roll shot |
| Motion | Spring/ease-out (no overshoot past 2%), 8–12-frame cross-dissolves or hard cuts on the beat; Ken Burns of 3–5% on stills; push-ins on UI to the element being discussed |
| Screen-rec treatment | Cropped and zoomed into the action; a soft orange touch ripple on each tap (tap times read from the recording); waits speed-ramped (reconstruction 8% → 74% in ≤ 2 s, "Uploading…" ≤ 0.5 s) |
| Lower-thirds | Bottom-left: orange step number + label in Geist, e.g. `02  Seller baseline`; hairline rule animates in from the left |
| Captions | Burned in, bottom-center, Geist Sans 44 px, ink on an 70% black rounded scrim, ≤ 2 lines, ≤ 42 chars/line, synced to whisper word timestamps (placeholder lines timed by word count) |
| Persistent badge | **"Demo only, no real payment."** (the site's own `DemoBadge` text) pinned top-right whenever any checkout, payment, release, dispute or refund is on screen |
| Audio | VO only (no music for now); ~150 ms of air around each line; quiet UI foley; mix at −16 LUFS integrated, −1.5 dBTP; all clip audio muted. If music is added later: ducked 10 dB under speech with 300 ms ramps |

## Engine and contract facts used in graphics (from the code; nothing invented)

- Pipeline stages (`engine/scandiff/`): **clean** (downsample, outliers, table plane) → **align** (global registration, RANSAC or FGR, then ICP) → **distance** (signed point-to-surface, noise via MAD × 1.4826) → **coverage** (compare only where key photos from both scans see the surface; else "no data") → **regions** (dent / added / missing) → **classify** (Claude: `missing_part`, `dent_damage`, `scratch_scuff`, `normal_wear`) → **verdict** (`accept`, `damage_likely`, `needs_review`) → **ledger** (SHA-256 fingerprints, version history).
- Histogram and stats for the measurement graphic come from `contract/diff_response.json`: 1 mm bins 0–15 mm, real counts, `noise_floor_mm 1.0`, `threshold_mm 3.0`, legend ±15 mm.
- Ledger fields as shown in the app: Version, Scan, SHA-256 (`c7a6fcb628b…` from the recording, truncated as the app does).

## Web recordings needed (not in `media/`)

Recorded with Playwright (webapp-testing skill) at 2560×1440 on **localhost in mock mode** (no Supabase, engine or Nessie keys; `.env.local` is not loaded), unless decision 2 says otherwise:
`/checkout/mug-001` (Pay with Visa (demo) → Held: scan required → Released receipt with fingerprints; reset → Disputed: payment stays held), `/item/mug-001` (heat map, numbered markers, region list, histogram, a "no data" area), `/item/mug-001/evidence` (scroll), `/item/car-001` (rental timeline, for the use-case beat). For the Nessie refund I show only the real "Sending the $48 refund through the Nessie sandbox…" state, because a deposit ID would have to be faked. No live API calls.

## Shot list

Times are for **Option A** (full script). VO source: **REC** = recorded take, **PH** = placeholder (not recorded yet, timed at 150 wpm).

### Act 1: Problem (Adithya)

| # | Time | VO | Asset (in → out) | Motion / treatment | Caption |
|---|---|---|---|---|---|
| 01 | 0:00–0:07 | REC Presidio 0:00.0–0:07.0 | Motion graphic: black, three words fade in staggered on the beat: *sale · return · rental*, then the question line | Kinetic type, Geist light 96 px; "condition" highlighted orange | Every time an item changes hands, whether it's a marketplace sale, a return, or a rental… / …there's one big question: what condition was it in? |
| 02 | 0:07–0:15 | REC Presidio 0:07.0–0:15.0 | Stills pulled from VDMJ 0:24, 0:46, 1:30 (the charger through the camera) as a loose "photo stack" | Cards drop in; the light shifts on one card (exposure animation); a "3 mm" mono callout appears and fades with the light; two cards side by side + "?" | Usually, all we have are a few photos. A tiny three-millimeter dent can disappear under the wrong lighting. / And comparing photos taken at different times? That's mostly guesswork. |
| 03 | 0:15–0:18 | REC Presidio 0:15.0–0:18.0 ("And now," trimmed) | Logo animation | Dashed circle slides onto solid circle, orange dot lands, wordmark types in | That's where ScanDiff comes in. |
| 04 | 0:18–0:22 | REC Presidio 0:18.0–0:22.0 | Kinetic type | "trust me" in quotes, struck through with an orange rule, then "measurable evidence" springs in | We're turning "trust me" into measurable evidence. |
| 05 | 0:22–0:29 | REC Presidio 0:22.0–0:28.7 | VDMJ 7:59–8:06 (baseline 3D model spinning) in iPhone frame, left; web `/item/mug-001` heat map (or the charger item) in browser frame, right; checkout flashes in at "checkout" | Split screen slides apart from center; push-in 4% | ScanDiff compares 3D scans of physical items to detect changes in their condition, / with a marketplace checkout built right in. |

### Act 2: Seller side (Koushik)

| # | Time | VO | Asset (in → out) | Motion / treatment | Caption |
|---|---|---|---|---|---|
| 06 | 0:29–0:33 | PH "Let's start with a simple example: a mug." | IMG_6526 1:44–1:47 (charger on red counter, rotated 180°, graded) | Slow push-in; title card "A simple example" fades over | Let's start with a simple example: a mug.* |
| 07 | 0:33–0:45 | PH "The seller lists the mug…two QR codes…" | IMG_6525 0:01–0:04 (typing "List an item") → VDMJ 8:14 (Check-in QR "Buyer: scan on arrival", belkincharger-003) → VDMJ 8:17–8:20 (same item's QR sheet with Check-in / Baseline tabs). VDMJ 9:29 ("Seller: scan before packing") belongs to charger-002, so it's a backup only, to keep one item ID on screen | b-roll hard cut to device frame; the two QR screens slide side by side with mono labels `baseline` / `check-in`; item ID `belkincharger-003` typed in mono. Lower-third `01  List an item` | The seller lists the mug, and ScanDiff generates a unique item ID and two QR codes. / One is for the original scan, and the other is for the buyer's check-in. |
| 08 | 0:45–0:50 | PH "Before shipping…LiDAR-equipped iPhone." | IMG_6526 0:30–0:33 (hand orbiting) → VDMJ 0:20–0:24 (Orbit 1 of 2, point sparkle) | Cut on the word "scans"; device frame scales up from b-roll. Lower-third `02  Seller baseline` | Before shipping, the seller scans the mug / using a LiDAR-equipped iPhone. |
| 09 | 0:50–1:05 | PH "The app guides the capture…SHA-256 fingerprint…" | VDMJ 0:10–0:12 (Before you scan checklist) → 1:08–1:11 (Orbit 1 done toast) → 3:08–3:11 (Capture the bottom?) → 5:06–6:55 ramped to 1.5 s (Reconstructing 8% → 74%) → 7:08–7:14 (textured model, "10 key photos · 81 captured") → 7:41–7:46 (Saved: Version, Scan, SHA-256) | Fast montage on the beat. On "SHA-256": zoom into the SHA-256 row, then a **hash graphic**: file chips (`model.usdz`, `photos/…`, `metadata.json`) flow into a mono hash that resolves to `c7a6fcb628b…` with an orange lock tick | The app guides the capture, builds a textured 3D model, / and saves photos along with their camera positions. / Before uploading, every file gets a unique SHA-256 fingerprint / to help detect whether the evidence has been altered. |
| 10 | 1:05–1:10 | PH "Now, the buyer checks out…demo Visa payment flow." | Web `/checkout/mug-001`: click **Pay with Visa (demo)** | Browser frame, cursor highlight + click ripple, crop to the payment card. Badge "Demo only, no real payment." Lower-third `03  Pay and hold` | Now, the buyer checks out using our demo Visa payment flow. |
| 11 | 1:10–1:17 | PH "But the money isn't released yet…" | Web: status pill **Held: scan required**, second QR appears | Push-in to the status pill; pill pulses once in orange | But the money isn't released yet. / It's held until the buyer checks the item's condition on arrival. |

### Act 3: Comparison (Adithya)

| # | Time | VO | Asset (in → out) | Motion / treatment | Caption |
|---|---|---|---|---|---|
| 12 | 1:17–1:21 | PH "Once the mug arrives…" | VDMJ 9:41 (Scan a QR code) → VDMJ 9:26 (Before you scan: Check scan of charger-002) → IMG_6525 0:14–0:16 ("Object found") | Lower-third `04  Buyer check-in` | Once the mug arrives, the buyer scans it again. |
| 13 | 1:21–1:28 | PH "aligns both 3D models…ICP" | **Motion graphic**: two point clouds (gray = baseline, orange = check-in) start misaligned; a coarse snap labeled `global · RANSAC / FGR`, then fine iterations labeled `ICP` with an RMSE counter easing down; then VDMJ 9:05 (check scan aligned to baseline) | A pipeline tracker strip appears at top (`clean · align · distance · coverage · regions · classify · verdict · ledger`), lighting the current stage. Lower-third `05  Align` | ScanDiff aligns both 3D models, first globally / and then using a technique called ICP to refine the match. |
| 14 | 1:28–1:43 | PH "measures how much the surface has changed…noise level…" | VDMJ 8:56–9:01 (heat map on the phone) → **histogram graphic** from `contract/diff_response.json`; a shaded noise band at 1 mm and an orange threshold line at 3 mm; bars beyond 3 mm light up | Heat-map legend animates (blue dent · gray unchanged · red added). Lower-third `06  Measure` | Then, it measures how much the surface has changed, down to a few millimeters. / Instead of guessing what counts as damage, we estimate the scan's own noise level, / helping distinguish real changes from measurement noise. |
| 15 | 1:43–1:46 | PH "Next, we group the changes into individual regions." | Web `/item/mug-001` heat map: numbered markers pop in 1-2-3 | Cursor clicks marker 1 | Next, we group the changes into individual regions. |
| 16 | 1:46–1:57 | PH "For each region, Claude compares…" | **Motion graphic**: before/after crop cards (from the web region list) slide together; a label chip cycles `dent` → `missing part` → `scuff` → `normal wear` and settles on the region's real label; then VDMJ 9:17 (3 flagged regions list) | Lower-third `07  Classify` | For each region, Claude compares the before-and-after photo crops and classifies the change. / It might be a dent, a missing part, a scuff, or just normal wear. |
| 17 | 1:57–2:06 | PH "if one scan can't see a particular surface…'no data'" | Web mock's uncovered area (hatched "no data") + VDMJ 9:35 zoom on **"Covered by both scans 72%"** | Hatch pattern wipes over the unseen patch; mono label `no data` (never red) | And if one scan can't see a particular surface, / we mark it as "no data" rather than incorrectly calling it damage. |

### Act 4: Decision (Koushik)

| # | Time | VO | Asset (in → out) | Motion / treatment | Caption |
|---|---|---|---|---|---|
| 18 | 2:06–2:08 | PH "So, what happens next?" | Black beat with a one-word kinetic "Next." | Hard cut on the beat | So, what happens next? |
| 19 | 2:08–2:18 | PH "accepts…Supabase Realtime…payment is released." | Split: VDMJ 9:17–9:20 (**Accepted: payment released (demo)**) in iPhone frame + web checkout flipping to **Released** with receipt and both fingerprints | A thin orange "realtime" pulse travels from phone to browser at the tap. Badge on. Lower-third `08  Accept` | The buyer reviews the results and accepts the item. / Through Supabase Realtime, that decision immediately updates the checkout, / and the held payment is released. |
| 20 | 2:18–2:21 | PH "But what if something went wrong during shipping?" | IMG_6526 cutaway (1 s) → VDMJ 9:23 | Quick cut | But what if something went wrong during shipping? |
| 21 | 2:21–2:30 | PH "dispute…Capital One's Nessie sandbox." | VDMJ 9:23–9:24 (**Disputed: payment stays held (demo)**) + web checkout **Disputed** → RefundNotice "Sending the $48 refund to the buyer through the Nessie sandbox…" | Badge on. Lower-third `09  Dispute` | The buyer can dispute the transaction. The payment stays held, / and the refund process runs through Capital One's Nessie sandbox. |
| 22 | 2:30–2:38 | PH "printable evidence page…" | Web `/item/mug-001/evidence`: smooth scroll past exhibits, fingerprints, flagged regions | Flat browser frame, slow scroll, hairline highlight on the SHA-256 rows. Lower-third `10  Evidence` | Both sides also get the same printable evidence page, / complete with the original exhibits, file fingerprints, and flagged regions. |

### Act 5: Why it matters (Adithya)

| # | Time | VO | Asset (in → out) | Motion / treatment | Caption |
|---|---|---|---|---|---|
| 23 | 2:38–2:53 | PH "important distinction…" | Kinetic type on black: **"Tamper-evident evidence of condition at handoff."** then smaller ink-soft lines: "Not proof an item was advertised accurately." · "Demo payments only." | Calm; lines stack | That brings us to an important distinction: / ScanDiff provides tamper-evident evidence of an item's condition at handoff. / It doesn't prove that the item was originally advertised accurately, / and our payment flow is for demonstration purposes only. |
| 24a | 2:53–3:01 | REC WhatsApp 0:00.0–0:08.0 | Kinetic: a photo card glitches/dissolves → **"A photo is no longer proof."** | Orange strike | Today anyone can generate a photo of damage that never happened, / so a photo is no longer proof. |
| 24b | 3:01–3:12 | REC WhatsApp 0:08.0–0:18.7 | Kinetic: **"2FA for physical goods"**, then two scan chips `scan in` / `scan out` joining with a ✓ and `$` unlocking | Big type, spring in; the logo's two circles reused as the two scans | ScanDiff works like two-factor authentication for physical things: / one scan when you take something, one scan when you hand it back, / and both have to match before money moves. |
| 24c | 3:12–3:30 | REC WhatsApp 0:18.7–0:35.7 | **Use-case montage**: line-icon cards in the site's icon style, one per noun, cut on each word: rental cars (+ 1 s of web `/item/car-001` rental timeline), hotel rooms, apartments (deposit), equipment rentals, shared scooters, borrowed gear, returns, insurance claims | Cards slide in on a grid, each lights orange as it's spoken | Think of everything we share. Rental cars, where you get billed for a scratch you didn't make. / Hotel rooms, and apartments where a security deposit comes down to a landlord's photos at move-out. / Equipment rentals, shared scooters, borrowed gear, returns and insurance claims. |
| 24d | 3:30–3:36 | REC WhatsApp 0:35.7–0:42.4 | Grid collapses into one card: "your app" → `scan-in` / `scan-out` | No code shown (the SDK isn't built yet) | With our SDK, any of those companies can build scan-in and scan-out checks into their own app. |
| 25 | 3:36–3:48 | PH "Looking ahead…" (**cut in Option B**) | Rental car + hotel icons + "SDK for marketplaces and shipping platforms" | Simple fade | Looking ahead, we're expanding ScanDiff to use cases like rental cars and hotel rooms, / while building an SDK that lets marketplaces and shipping platforms integrate scan-based payments and returns. |
| 26 | 3:48–3:55 | PH "We're ScanDiff. Measured, not argued." | Logo end card: mark + wordmark, then **"Measured, not argued."** kinetic, then `scandiff.us` and the team line (Adithya Sripada · Koushik Jandhyala · Keshav Pillarisetti) | A soft sub hit as the dot lands; 1.5 s hold on black | We're ScanDiff. / Measured, not argued. |

\* Lines with "mug" change per decision 2.

## Option B: tightened script (≈ 3:00)

Recorded takes are untouched apart from trimming "And now," and long pauses. Changes affect only unrecorded lines:

| Beat | Script line(s) | Option B |
|---|---|---|
| 06–07 | "Let's start with a simple example: a mug. The seller lists the mug, and ScanDiff generates a unique item ID and two QR codes. One is for the original scan, and the other is for the buyer's check-in." | "Take a simple example: a [mug]. The seller lists it and gets a unique item ID and two QR codes: one for the original scan, one for the buyer's check-in." |
| 09 | "The app guides the capture, builds a textured three-dimensional model, and saves photos along with their camera positions. Before uploading, every file gets a unique SHA-256 fingerprint to help detect whether the evidence has been altered." | "The app guides the capture, builds a textured 3D model, saves photos with their camera positions, and fingerprints every file with SHA-256, so any later change to the evidence shows." |
| 10–11 | "Now, the buyer checks out using our demo Visa payment flow. But the money isn't released yet. It's held until the buyer checks the item's condition on arrival." | "The buyer pays through our demo Visa checkout, but the money is held until they check the item on arrival." |
| 14 | "Then, it measures how much the surface has changed… measurement noise." | "Then it measures how far the surface moved, down to a few millimeters, against the scan's own noise level, so real change stands out from measurement noise." |
| 15–16 | "Next, we group… just normal wear." | "Changes are grouped into regions, and for each one, Claude compares before-and-after photo crops and labels it: a dent, a missing part, a scuff, or normal wear." |
| 18 | "So, what happens next?" | cut |
| 20–21 | "But what if something went wrong during shipping? The buyer can dispute…" | "If something went wrong in shipping, the buyer disputes: the payment stays held, and the refund runs through Capital One's Nessie sandbox." |
| 23 | "That brings us to an important distinction… demonstration purposes only." | "To be clear: ScanDiff is tamper-evident evidence of condition at handoff. It doesn't prove an item was advertised accurately, and payments here are a demo." |
| 25 | "Looking ahead…" | cut (the recorded use-case and SDK lines already cover it) |

Estimated runtime for Option B: ≈ 3:00–3:05 at 150 wpm. That reaches 3:00 flat with a slightly brisker read (~160 wpm) on the new lines, or by also trimming pauses inside the WhatsApp take.

## Build plan after approval

1. Proxies: tone-map and grade the chosen ProRes ranges (HLG → Rec.709 via a generated 3D LUT; this ffmpeg has no zscale), rotate IMG_6526, and transcode the screen-recording ranges to CFR 30 fps H.264 into `video/public/clips/`.
2. VO: extract → transcribe (done) → pick and edit → vo-polish → `media/vo/TAKES.md` with before/after loudness and noise floor for each line.
3. Web recordings (Playwright, mock mode, 2560×1440).
4. Remotion project in `video/`: one composition and a component per act, shared `theme.ts` (tokens above), `DeviceFrame`, `BrowserFrame`, `LowerThird`, `Captions`, `KineticLine`, `Badge`, the pipeline tracker, the hash/ledger graphic and the histogram.
5. Preview → self-critique loop → final render, thumbnail, report.
