**Adithya:**

Every time an item changes hands, whether it's a marketplace sale, a return, or a rental, there's one big question: what condition was it in?

Usually, all we have are a few photos. A tiny, three-millimeter dent can disappear under the wrong lighting. And comparing photos taken at different times? That's mostly guesswork.

That's where ScanDiff comes in.

We're turning "trust me" into measurable evidence. ScanDiff compares three-dimensional scans of physical items to detect changes in their condition, with a marketplace checkout built right in.

**Koushik:**

Let's start with a simple example: a mug.

The seller lists the mug, and ScanDiff generates a unique item ID and two QR codes. One is for the original scan, and the other is for the buyer's check-in.

Before shipping, the seller scans the mug using a LiDAR-equipped iPhone.

The app guides the capture, builds a textured three-dimensional model, and saves photos along with their camera positions. Before uploading, every file gets a unique SHA-256 fingerprint to help detect whether the evidence has been altered.

Now, the buyer checks out using our demo Visa payment flow.

But the money isn't released yet. It's held until the buyer checks the item's condition on arrival.

**Adithya:**

Once the mug arrives, the buyer scans it again.

ScanDiff aligns both three-dimensional models, first globally and then using a technique called ICP to refine the match.

Then, it measures how much the surface has changed, down to a few millimeters. Instead of guessing what counts as damage, we estimate the scan's own noise level, helping distinguish real changes from measurement noise.

Next, we group the changes into individual regions.

For each region, Claude compares the before-and-after photo crops and classifies the change. It might be a dent, a missing part, a scuff, or just normal wear.

And if one scan can't see a particular surface, we mark it as "no data" rather than incorrectly calling it damage.

**Koushik:**

So, what happens next?

The buyer reviews the results and accepts the item. Through Supabase Realtime, that decision immediately updates the checkout, and the held payment is released.

But what if something went wrong during shipping?

The buyer can dispute the transaction. The payment stays held, and the refund process runs through Capital One's Nessie sandbox.

Both sides also get the same printable evidence page, complete with the original exhibits, file fingerprints, and flagged regions.

**Adithya:**

That brings us to an important distinction: ScanDiff provides tamper-evident evidence of an item's condition at handoff. It doesn't prove that the item was originally advertised accurately, and our payment flow is for demonstration purposes only.

Today anyone can generate a photo of damage that never happened, so a photo is no longer proof. ScanDiff works like two-factor authentication for physical things: one scan when you take something, one scan when you hand it back, and both have to match before money moves. Think of everything we share. Rental cars, where you get billed for a scratch you didn't make. Hotel rooms, and apartments where a security deposit comes down to a landlord's photos at move-out. Equipment rentals, shared scooters, borrowed gear, returns and insurance claims. With our SDK, any of those companies can build scan-in and scan-out checks into their own app.

Looking ahead, we're expanding ScanDiff to use cases like rental cars and hotel rooms, while building an SDK that lets marketplaces and shipping platforms integrate scan-based payments and returns.

We're ScanDiff.

Measured, not argued.