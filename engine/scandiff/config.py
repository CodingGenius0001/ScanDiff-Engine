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
# Off by default: on a boxy item the largest plane can be a side of the item, not the table.
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
