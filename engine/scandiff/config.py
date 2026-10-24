"""All tunable constants."""

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

# An alignment below MIN_FITNESS or above MAX_RMSE_MM (at the finest ICP distance) is rejected.
MIN_FITNESS = 0.6
MAX_RMSE_MM = 1.5
