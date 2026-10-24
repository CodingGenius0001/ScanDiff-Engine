# Upload format

Agreed with the iOS app. The JSON shape is `ScanMetadata` in `app/schemas.py`.

The iPhone uploads one scan:

- one `.usdz` mesh
- `metadata.json`
- one image per `photos` entry, using that entry's `filename`

The engine converts the USDZ to OBJ before preprocessing, alignment, and every later step. Later stages read the OBJ. Mesh coordinates and the camera translation are meters. `units` is always `"m"`.

## metadata.json

| Field | Type | |
|---|---|---|
| `item_id` | string | Item this scan belongs to |
| `scan_id` | string | This capture |
| `captured_at` | string | ISO 8601 datetime |
| `device` | string | Phone model, such as `iPhone 16 Pro` |
| `units` | `"m"` | Length unit. No other value is valid |
| `photos` | array | Reference photos, described below |

### photos

| Field | Type | |
|---|---|---|
| `filename` | string | Image file name in the upload, not a path |
| `camera_to_world` | 4×4 numbers | Row-major camera-to-world transform. `m[row][col]` maps camera coordinates into the scan frame. Translation is meters |
| `intrinsics` | object | `fx`, `fy`, `cx`, `cy` in pixels |
| `width` | integer | Image width in pixels |
| `height` | integer | Image height in pixels |

```json
{
  "item_id": "item_123",
  "scan_id": "scan_456",
  "captured_at": "2026-10-24T07:30:00Z",
  "device": "iPhone 16 Pro",
  "units": "m",
  "photos": [
    {
      "filename": "IMG_0001.jpg",
      "camera_to_world": [
        [1.0, 0.0, 0.0, 0.1],
        [0.0, 1.0, 0.0, 0.2],
        [0.0, 0.0, 1.0, 0.3],
        [0.0, 0.0, 0.0, 1.0]
      ],
      "intrinsics": { "fx": 1500.0, "fy": 1500.0, "cx": 960.0, "cy": 720.0 },
      "width": 1920,
      "height": 1440
    }
  ]
}
```
