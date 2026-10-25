"""Loading and cleaning on real scans from scripts/fetch_scans.py.

Skipped unless data/scans/ holds at least one scan. Run with `pytest -m real_data`.
"""

from pathlib import Path

import pytest

from scandiff.io import find_model_file, load_mesh
from scandiff.preprocess import clean, sorted_extents, to_point_cloud

SCANS_DIR = Path(__file__).resolve().parents[1] / "data" / "scans"
MIN_EXTENT_M = 0.05
MAX_EXTENT_M = 1.0

SCAN_DIRS = sorted(path for path in SCANS_DIR.glob("*/*") if path.is_dir())

pytestmark = pytest.mark.real_data


@pytest.mark.skipif(not SCAN_DIRS, reason="no scans in data/scans/")
@pytest.mark.parametrize(
    "scan_dir", SCAN_DIRS, ids=[str(path.relative_to(SCANS_DIR)) for path in SCAN_DIRS]
)
def test_real_scan_loads_and_cleans(scan_dir):
    cloud = clean(to_point_cloud(load_mesh(find_model_file(scan_dir))))

    extents = sorted_extents(cloud)
    assert MIN_EXTENT_M <= extents[0], f"smallest extent {extents[0] * 1000:.1f} mm"
    assert extents[-1] <= MAX_EXTENT_M, f"largest extent {extents[-1] * 1000:.1f} mm"


COFFEE_PAIR = [
    SCANS_DIR / "coffee-maker-1" / "4D4B567F-8B1A-4146-8F55-EF59EF8A3A07",
    SCANS_DIR / "coffe-maker-2" / "371735CF-77D6-4C1F-960D-725012A74B2B",
]


@pytest.mark.skipif(
    not all((scan / "photo_01.jpg").is_file() for scan in COFFEE_PAIR), reason="coffee-maker scans not downloaded"
)
def test_full_comparison_of_the_coffee_maker_rescan(monkeypatch, tmp_path):
    from app.pipeline import compare, load_scan
    from scandiff import classify, storage

    def save(data: bytes, path: str) -> str:
        (tmp_path / path).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / path).write_bytes(data)
        return f"https://example.test/{path}"

    monkeypatch.setattr(storage, "upload_file", save)
    monkeypatch.setattr("scandiff.photos.upload_file", save)
    monkeypatch.setattr(classify, "vision_provider", lambda: None)
    base, new = (load_scan(find_model_file(scan), storage.read_metadata(scan / "metadata.json")) for scan in COFFEE_PAIR)

    # Different item ids only because scan 2's id is misspelled; it is the same coffee maker.
    assert compare(base, new, diff_id="real").verdict == "inconclusive"
    result = compare(base, new, diff_id="real", check_items=False)

    assert result.regions and not result.is_mock
    # The bottom was never captured, so it is uncovered rather than compared.
    assert 0.5 < result.compared_fraction < 0.95
    bottom = max(result.uncovered_regions, key=lambda patch: patch.area_cm2)
    assert bottom.only_in == "neither" and bottom.centroid_m[1] < 0.02
    assert all(region.centroid_m[1] > 0.01 for region in result.regions[:8])
    assert result.stats.diff_time_s < 60
    assert all("\n" not in region.reason for region in result.regions)
    # The cord moved between scans, so most crops of the worst regions exist on at least one side.
    assert sum(bool(region.before_crop_url or region.after_crop_url) for region in result.regions[:8]) >= 4
    assert (tmp_path / "diffs/real/heatmap.glb").stat().st_size > 0
