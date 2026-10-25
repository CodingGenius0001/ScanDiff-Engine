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

# Change threshold: the 95th-percentile distance between two scans of an unchanged object
# (the noise floor), never below MIN_THRESHOLD_MM in case the two scans are near copies.
MIN_THRESHOLD_MM = 2.0
CALIBRATION_PATH = Path(__file__).resolve().parents[1] / "calibration.json"


def load_calibration(path: Path = CALIBRATION_PATH) -> dict | None:
    """calibration.json as written by scripts/calibrate.py, or None if it doesn't exist yet."""
    if not path.exists():
        return None
    return json.loads(path.read_text())


_calibration = load_calibration()
CALIBRATED = _calibration is not None
# Placeholders until calibration: a 3 mm noise floor and threshold.
NOISE_FLOOR_MM = _calibration["p95_mm"] if CALIBRATED else 3.0
THRESHOLD_MM = _calibration["threshold_mm"] if CALIBRATED else 3.0

# Regions: DBSCAN over the changed points, with eps in voxels.
REGION_EPS_VOXELS = 3.0
REGION_MIN_SAMPLES = 15
# Neighborhood for the depth gradient at a region's edge, in voxels.
REGION_GRADIENT_RADIUS_VOXELS = 2.0
# Each point's area comes from a normal fitted to this many nearest points.
AREA_NEIGHBORS = 8
# Base surface with no new point nearby is a missing part only when it outweighs the changed
# new surface clustered with it this many times. Otherwise it is the far side of the same
# change: the base surface over a dent, or under a glued-on part.
MISSING_AREA_RATIO = 2.0
# Smaller regions are dropped. A placeholder until real damage has been measured.
MIN_REGION_CM2 = 0.5

# Region photos: a view must face the region at least this much (cosine), and a mesh hit
# blocks it only if it is this far plus the region's depth in front of the region.
PHOTO_MIN_FACING = 0.2
OCCLUSION_TOLERANCE_MM = 5.0
# Crops: the region's projected box plus this share of its size, at least CROP_MIN_PX
# across in the photo, then resized to CROP_SIZE_PX square.
CROP_PADDING = 0.3
CROP_MIN_PX = 160
CROP_SIZE_PX = 256
CROP_JPEG_QUALITY = 90
# Length of the world-up step projected to find which way is up in a photo.
CROP_UP_PROBE_MM = 50.0

# Classification. Each rule multiplies soft steps: logistic curves centered on these numbers
# and CLASSIFY_SOFTNESS of them wide, so a region near a cutoff shares its score between
# labels. CLASSIFY_PRIOR is added to every label before normalizing, so a region no rule
# fits comes out uncertain instead of confidently wrong.
CLASSIFY_SOFTNESS = 0.15
CLASSIFY_PRIOR = 0.05
MISSING_MIN_AREA_CM2 = 2.0
MISSING_MIN_DEPTH_MM = 10.0
# Spread (RMS radius over a flat disc's) above this is spread out, below it compact.
COMPACT_MAX_SPREAD = 1.5
DENT_MIN_DEPTH_THRESHOLDS = 2.0
DENT_MIN_SHARPNESS = 0.6
SCRATCH_MIN_ASPECT = 4.0
SCRATCH_MAX_EXTRA_MM = 1.5
SCRATCH_MAX_AREA_CM2 = 3.0
WEAR_MAX_AREA_CM2 = 8.0
WEAR_MAX_EXTRA_MM = 1.5
# With a vision answer, labels are GEOMETRY_WEIGHT geometry and the rest vision.
GEOMETRY_WEIGHT = 0.6
VISION_TIMEOUT_S = 4.0
VISION_DEFAULT_PROVIDER = "anthropic"
VISION_DEFAULT_MODEL = "claude-opus-5-5"
# Only the most severe regions get photo crops and a vision call.
MAX_CROPPED_REGIONS = 8

# Verdict
ACCEPT_FRACTION = 0.02
DAMAGE_MIN_CONFIDENCE = 0.7
# Below this share of the new scan within ALIGN_GATE_DISTANCE_MM of the base, a person checks.
REVIEW_MIN_FITNESS = 0.8

# Coverage: a surface point counts as captured by a scan when one of the scan's key photos
# sees it, facing the camera at least this much (cosine) and not hidden behind the mesh.
# Only points both scans captured are compared.
COVERAGE_MIN_FACING = 0.15
# With less of the base surface compared than this, the result is inconclusive.
MIN_COMPARED_FRACTION = 0.5
# Uncovered patches smaller than this are left out of uncovered_regions.
MIN_UNCOVERED_CM2 = 2.0

# Seconds one result upload to Supabase Storage may take; a diff uploads several at once.
UPLOAD_TIMEOUT_S = 60

# A session from GET /health lasts this long after its last use.
SESSION_TTL_S = 12 * 3600

# Heat map: colors saturate at this many thresholds; bigger meshes are decimated for the browser.
HEATMAP_SATURATION_THRESHOLDS = 5.0
HEATMAP_MAX_FACES = 100_000
