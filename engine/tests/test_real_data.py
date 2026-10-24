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
