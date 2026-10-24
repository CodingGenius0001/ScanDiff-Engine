# ScanDiff iOS

SwiftUI capture app for Cal Hacks 13.0. It guides an LiDAR iPhone around a physical object, builds a reduced-detail model on device, bundles key photos with camera poses, and uploads the bundle to Supabase. A check scan asks the diff engine for damage, or uses a mock result when `ENGINE_URL` is empty.

## What to test, in order

1. **Home.** Run the app. You should see an item id field, Baseline/Check, and the scanning tips. The Start button stays disabled until the item id is letters, numbers, `-`, or `_`.
2. **Deep link.** From Safari or Shortcuts, open `scandiff://scan?item=mug-1&kind=check`. The app should jump into a scan for `mug-1` as a check. `kind` must be `baseline` or `check`.
3. **Capture.** On an iPhone 12 Pro or later, tap Detect object, then Start capture. Walk slowly around a matte object in even light. The shot count and coverage bar should move, and feedback such as “Move closer” should appear. Complete one full loop, then tap Finish scan. Fewer than 20 shots, or no completed loop, should stop you with a re-scan message.
4. **Processing.** After a good capture, a progress percent should climb while the phone builds `model.usdz` at reduced detail. Cancel should leave the scan and explain that processing was cancelled.
5. **Review.** You should see the model, the key-photo count (8–12), a SHA256 prefix, and the folder path. In the Files app, under ScanDiff, open `Captures/<scan id>/Bundle` and confirm `model.usdz`, `model.obj`, texture files if ModelIO wrote them, `photo_01.jpg` …, and `metadata.json`.
6. **Upload and diff.** With Supabase filled in, Upload a baseline, then a check for the same item id. The check should show a verdict card, the number of flagged regions, and Accept / Dispute. With `ENGINE_URL` empty, the check still shows a labeled mock result. Accept and Dispute write `decision` on that scan row.

## Project

Open `ScanDiff/ScanDiff.xcodeproj`. Bundle id is `com.scandiff.app`. The Supabase Swift package is already added (2.55.4, up to next major).

Guided capture does not run in the Simulator. `ObjectCaptureSession.isSupported` is false there, and the scan screen explains that.

## Secrets

```sh
cp ScanDiff/Configuration/Secrets.xcconfig.example ScanDiff/Configuration/Secrets.xcconfig
```

`Secrets.xcconfig` is gitignored. xcconfig treats `//` as a comment, so write slashes as `$(SLASH)$(SLASH)`:

```
SLASH = /
SUPABASE_URL = https:$(SLASH)$(SLASH)YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY = your-anon-key
ENGINE_URL = http:$(SLASH)$(SLASH)127.0.0.1:8000
```

Leave `ENGINE_URL` empty to use the mock diff client. Leave the Supabase values empty and the app still scans and saves a bundle on the phone; Upload then asks you to add the keys. Rebuild after changing this file. The values are copied into Info.plist at build time as `SupabaseURL`, `SupabaseAnonKey`, and `EngineURL`.

## Supabase

In the SQL editor:

```sql
create table if not exists public.scans (
  id uuid primary key,
  item_id text not null,
  version int not null,
  kind text not null,
  model_url text,
  sha256 text,
  created_by text,
  created_at timestamptz,
  decision text
);

alter table public.scans enable row level security;

create policy "anon read scans" on public.scans for select to anon using (true);
create policy "anon insert scans" on public.scans for insert to anon with check (true);
create policy "anon update scans" on public.scans for update to anon using (true);

insert into storage.buckets (id, name, public)
values ('scans', 'scans', true)
on conflict (id) do update set public = true;

create policy "anon read scan files" on storage.objects for select to anon using (bucket_id = 'scans');
create policy "anon insert scan files" on storage.objects for insert to anon with check (bucket_id = 'scans');
create policy "anon update scan files" on storage.objects for update to anon using (bucket_id = 'scans');
```

These policies are open so a hackathon build can upload with the anon key. Tighten them before any real data.

Files land at `scans/<item_id>/<scan_id>/`. The table row’s `model_url` is the public URL of `model.usdz`, and `sha256` is that file’s SHA256. `version` is one higher than the latest row for the same item. A check scan looks up the latest `kind = baseline` row and `POST`s `{ "base_id", "new_id" }` to `{ENGINE_URL}/diff`.

`metadata.json` in the bundle:

```json
{
  "scan_id": "",
  "item_id": "",
  "kind": "baseline",
  "created_by": "",
  "created_at": "",
  "device": "",
  "model_file": "model.usdz",
  "model_sha256": "",
  "photos": [
    { "file": "photo_01.jpg", "camera_transform": [], "intrinsics": [] }
  ]
}
```

`camera_transform` is 16 floats, column-major, camera-to-world. It comes from the camera poses that `PhotogrammetrySession` solves during reconstruction, so it is in the same coordinate frame as `model.usdz`. `intrinsics` is 9 floats, column-major, in pixels. On iOS 26 they come from the solved pose; on iOS 17–18 they are estimated from the photo's 35mm-equivalent focal length. Photos are stored in raw sensor orientation with no EXIF rotation, so the pixel grid matches the intrinsics. Key photos are the sharpest frame in each of 10 slices of a circle around the object, with at least 8. `created_at` is ISO8601 UTC.

A separate ARKit session is not used for poses because it would take the camera from Object Capture.

## Run it on your iPhone

1. Install the iOS platform that matches this Xcode (Xcode → Settings → Components). This Mac’s Xcode 26.6 was missing the iOS 26.5 simulator runtime, and asset catalogs fail to compile for a device destination until that component is installed.
2. Plug in the iPhone with a cable. Unlock it and tap Trust.
3. On the iPhone: Settings → Privacy & Security → Developer Mode → On, then restart.
4. In Xcode, select the ScanDiff target → Signing & Capabilities → Team → your Apple ID team. Automatic signing. Bundle id `com.scandiff.app`.
5. Choose your iPhone as the run destination and press Run.
6. The first build asks the phone to trust the developer certificate: Settings → General → VPN & Device Management.

Koushik’s iPhone (13 Pro Max) has LiDAR and is a valid capture device. It was not connected while this project was built, and Xcode had no signing certificate, so nothing was installed.

## Not verified on a device

- Guided capture, coverage feedback, and the 20-shot / full-loop gate.
- On-device `PhotogrammetrySession` at reduced detail, cancel, and failure text.
- `model.obj` export through ModelIO, including `texture_N.png` files and the `.mtl` pointing at them.
- That `PhotogrammetrySession` returns poses for the key photos. Unsolved ones are stored as zeros and the review screen says so. Confirm `metadata.json` transforms are not all zeros.
- The camera axis convention of the solved poses (whether the camera looks down −Z as in ARKit). Check with the engine before relying on it.
- Supabase upload, the baseline lookup, Accept / Dispute, and a live `POST /diff`.
- The `scandiff://` cold start from a link while the app is not running.
