"""Draw a scan's mesh vertices over its key photos, to check that model and poses share a frame.

    python scripts/check_projection.py data/scans/<item_id>/<scan_id> [--out out/projection]

Saves one overlay per photo. The dots should cover the object exactly. If they
are mirrored or rotated against it, the pose transpose or the ARKit-to-OpenCV
axis flip in scandiff/photos.py is wrong. The arrow at the object's center
points along the world's +Y (up).
"""

import argparse
import sys
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE_DIR))

import numpy as np  # noqa: E402
from PIL import ImageDraw  # noqa: E402

from scandiff.io import find_model_file, load_mesh  # noqa: E402
from scandiff.photos import load_photos, project_points  # noqa: E402
from scandiff.storage import read_metadata  # noqa: E402

DOTS = 4000
SHRINK = 4
DOT_COLOR = (0, 255, 80)
ARROW_COLOR = (255, 40, 40)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("scan", type=Path, metavar="scan_dir")
    parser.add_argument("--out", type=Path, default=ENGINE_DIR / "out" / "projection")
    args = parser.parse_args()

    metadata = read_metadata(args.scan / "metadata.json")
    mesh = load_mesh(find_model_file(args.scan), require_density=False)
    rng = np.random.default_rng(0)
    vertices = mesh.vertices[rng.choice(len(mesh.vertices), min(DOTS, len(mesh.vertices)), replace=False)]
    center = mesh.bounds.mean(axis=0)
    arrow = np.array([center, center + [0.0, 0.05, 0.0]])

    out = args.out / f"{metadata.item_id}_{metadata.scan_id}"
    out.mkdir(parents=True, exist_ok=True)
    print(f"{args.scan}: {len(mesh.vertices)} vertices, {len(metadata.photos)} photos -> {out}")
    for photo in load_photos(args.scan, metadata):
        uv, inside = project_points(vertices, photo)
        image = photo.open().convert("RGB")
        image = image.resize((photo.width // SHRINK, photo.height // SHRINK))
        draw = ImageDraw.Draw(image)
        for u, v in uv[inside] / SHRINK:
            draw.ellipse([u - 1.5, v - 1.5, u + 1.5, v + 1.5], fill=DOT_COLOR)
        ends, ends_inside = project_points(arrow, photo)
        if ends_inside.all():
            draw.line([tuple(end) for end in ends / SHRINK], fill=ARROW_COLOR, width=4)
        image.save(out / f"{Path(photo.file).stem}.jpg", quality=85)
        print(f"  {photo.file}: {inside.mean():.0%} of vertices land inside the {photo.width}x{photo.height} image")


if __name__ == "__main__":
    main()
