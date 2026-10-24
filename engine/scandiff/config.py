"""All tunable constants.

The noise floor and change threshold come from calibration.json when
scripts/calibrate.py has written it, and from the defaults below until then.
"""

import json
from pathlib import Path

# A parsed camera rotation must match the identity gram matrix within this tolerance.
ROTATION_ATOL = 1e-3

# Loading. Scans are meters.
MIN_MESH_VERTICES = 5_000
MIN_SURFACE_AREA_M2 = 1e-4

# Sampling
SAMPLE_POINTS = 150_000
# sample_surface_even may return fewer points than asked; below this fraction, resample.
SAMPLE_EVEN_MIN_FRACTION = 0.9
RANDOM_SEED = 0

# Cleaning
VOXEL_MM = 2.0
OUTLIER_NB_NEIGHBORS = 20
OUTLIER_STD_RATIO = 2.0
# An outlier must also sit this many voxels from its neighbors on average, so dents and edges stay.
OUTLIER_MIN_SPACING_VOXELS = 3.0
# Off by default: Object Capture leaves the table out and the app scans the item's bottom too,
# so the largest plane is part of the item (a side, or the base), not the table.
REMOVE_GROUND_PLANE = False
PLANE_DISTANCE_MM = 3.0
PLANE_RANSAC_ITERATIONS = 1000
NORMAL_RADIUS_MM = 6.0
NORMAL_MAX_NN = 30
NORMAL_ORIENT_K = 15
MIN_POINTS = 1_000

# Scale check, as a fraction of the base extent.
SCALE_TOLERANCE = 0.03
SCALE_MISMATCH = 0.20
OBB_SUBSET_POINTS = 300
# Extents run from this percentile to 100 minus it along each box axis.
EXTENT_PERCENTILE = 0.5

# Global registration runs on a coarser copy; these factors scale its voxel size.
GLOBAL_VOXEL_FACTOR = 2.5
GLOBAL_NORMAL_RADIUS_FACTOR = 2.0
FPFH_RADIUS_FACTOR = 5.0
FPFH_MAX_NN = 100
GLOBAL_DISTANCE_FACTOR = 1.5
RANSAC_EDGE_LENGTH_RATIO = 0.9
RANSAC_MAX_ITERATIONS = 100_000
RANSAC_CONFIDENCE = 0.999

# Point-to-plane ICP, coarse to fine.
ICP_DISTANCES_MM = (10.0, 5.0, 2.0)
ICP_MAX_ITERATIONS = 50

# An alignment is rejected when under MIN_FITNESS of the new points are within
# ALIGN_GATE_DISTANCE_MM of the base, or its RMSE at the finest ICP distance is over MAX_RMSE_MM.
# The gate is looser than ICP's 2 mm so a scan with real change still passes: a moved cord
# put 45% of a correctly aligned coffee maker over 2 mm off, while wrong objects stay under 0.33 at 5 mm.
MIN_FITNESS = 0.6
ALIGN_GATE_DISTANCE_MM = 5.0
MAX_RMSE_MM = 1.5

# Signed-distance histogram: fixed bins across this range, plus one overflow bin on each side.
HISTOGRAM_RANGE_MM = 15.0
HISTOGRAM_BIN_MM = 1.0

# Change threshold: 3 sigma of scan-to-scan noise, never below MIN_THRESHOLD_MM.
MIN_THRESHOLD_MM = 2.0
THRESHOLD_SIGMAS = 3.0
CALIBRATION_PATH = Path(__file__).resolve().parents[1] / "calibration.json"


def load_calibration(path: Path = CALIBRATION_PATH) -> dict | None:
    """calibration.json as written by scripts/calibrate.py, or None if it doesn't exist yet."""
    if not path.exists():
        return None
    return json.loads(path.read_text())


_calibration = load_calibration()
CALIBRATED = _calibration is not None
# Placeholders until calibration: 1 mm of noise, a 3 mm threshold.
NOISE_SIGMA_MM = _calibration["sigma_mm"] if CALIBRATED else 1.0
THRESHOLD_MM = _calibration["threshold_mm"] if CALIBRATED else 3.0
