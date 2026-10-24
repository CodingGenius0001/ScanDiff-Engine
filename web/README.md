# ScanDiff web

Web viewer for ScanDiff (Cal Hacks 13.0). It compares a baseline 3D scan with a later scan and shows a heat map, a histogram and flagged regions. It also includes a demo checkout (shipping and returns) and a rental car timeline.

ScanDiff provides **tamper-evident evidence of condition at handoff**. It does not verify that an item is as advertised. Every payment screen is a demo: **no real payment** takes place, and there is no real Apple Pay or Visa integration.

## Run locally

```bash
cd web
npm install
npm run dev      # http://localhost:3000
npm run build    # production build check
```

Everything runs on mock data generated in code. No backend, database or API key is needed.

## Where the teammate integrations plug in

| File | Purpose | Now | Later |
| --- | --- | --- | --- |
| `lib/types.ts` | All data types | Assumed shapes | Match the backend contract |
| `lib/diffClient.ts` | `getDiff(baseId, newId)` | Returns mock data | Calls the diff API and maps its response |
| `lib/modelLoader.ts` | `loadModel(url)` | GLB and PLY | Add any other format the iOS app exports |
| `lib/items.ts` | Item title, price, scan history | Mock catalog | Backend item source |
| `lib/orderStatus.ts` | Checkout status flow | `localStorage` | Driven by real database updates |

The open assumptions are listed in `TODO.md`. Mock data lives only in `lib/mock/`.

## Pages

- `/` home
- `/checkout/mug-001` demo checkout (shipping and returns)
- `/item/mug-001`, `/item/car-001` comparison viewer
- `/item/<id>/evidence` printable dispute evidence

## Deploy to Vercel

1. In Vercel, choose **Add New → Project** and import this GitHub repository.
2. Set **Root Directory** to `web`.
3. Keep the detected Next.js framework and its default build settings. No environment variables are needed.
4. Click **Deploy**. Each push to the connected branch creates a new deployment.
