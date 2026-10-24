"""Sanity-check two scans of the same object.

Aligns `new` onto `base` and prints how far each new point is from the base
surface. Two scans of an unchanged mug should put 95% of points within a few mm.

    python scripts/mug_check.py base.obj new.obj [--show] [--units mm]
"""

import argparse
import sys

import numpy as np
import open3d as o3d
import trimesh
from scipy.spatial import cKDTree

SAMPLE_COUNT = 150_000
VOXEL_SIZE_M = 0.002
NORMAL_RADIUS_M = 0.005
NORMAL_MAX_NN = 30
OUTLIER_NB_NEIGHBORS = 20
OUTLIER_STD_RATIO = 2.0
ICP_MAX_CORRESPONDENCE_M = 0.01
ICP_MAX_ITERATIONS = 100
LOW_FITNESS = 0.5
HISTOGRAM_BINS = 20
BAR_WIDTH = 40

UNIT_TO_M = {"m": 1.0, "mm": 0.001}


def load_mesh(path: str, unit_to_m: float) -> trimesh.Trimesh:
    """Load a mesh file as one mesh in meters, merging scene geometry."""
    mesh = trimesh.load(path, force="mesh")
    if isinstance(mesh, trimesh.Scene):
        mesh = mesh.to_mesh()
    if mesh.is_empty or len(mesh.faces) == 0:
        sys.exit(f"{path}: no triangles to sample")
    mesh.apply_scale(unit_to_m)
    return mesh


def to_cloud(mesh: trimesh.Trimesh, seed: int) -> o3d.geometry.PointCloud:
    """Sample the surface, clean it up, and return a downsampled cloud with normals."""
    points, _ = trimesh.sample.sample_surface(mesh, SAMPLE_COUNT, seed=seed)
    cloud = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(points))
    cloud.estimate_normals(
        o3d.geometry.KDTreeSearchParamHybrid(radius=NORMAL_RADIUS_M, max_nn=NORMAL_MAX_NN)
    )
    cloud = cloud.voxel_down_sample(VOXEL_SIZE_M)
    cloud.normalize_normals()
    cloud, _ = cloud.remove_statistical_outlier(
        nb_neighbors=OUTLIER_NB_NEIGHBORS, std_ratio=OUTLIER_STD_RATIO
    )
    return cloud


def align(new: o3d.geometry.PointCloud, base: o3d.geometry.PointCloud):
    """Match centroids, then refine with point-to-plane ICP. Returns the ICP result."""
    init = np.eye(4)
    init[:3, 3] = base.get_center() - new.get_center()
    return o3d.pipelines.registration.registration_icp(
        new,
        base,
        ICP_MAX_CORRESPONDENCE_M,
        init,
        o3d.pipelines.registration.TransformationEstimationPointToPlane(),
        o3d.pipelines.registration.ICPConvergenceCriteria(max_iteration=ICP_MAX_ITERATIONS),
    )


def print_histogram(distances_mm: np.ndarray) -> None:
    """Text histogram from 0 to the 99th percentile, with one overflow row past it."""
    top = max(float(np.percentile(distances_mm, 99)), 1e-3)
    counts, edges = np.histogram(distances_mm, bins=HISTOGRAM_BINS, range=(0.0, top))
    overflow = int(np.count_nonzero(distances_mm > top))
    total = len(distances_mm)
    peak = max(counts.max(), overflow, 1)

    print("\nDistance new -> base (mm)       count      %   cum %")
    cumulative = 0
    rows = [(f"{lo:6.2f} - {hi:6.2f}", int(c)) for lo, hi, c in zip(edges[:-1], edges[1:], counts)]
    rows.append((f"{top:6.2f} +       ", overflow))
    for label, count in rows:
        cumulative += count
        bar = "#" * round(BAR_WIDTH * count / peak)
        print(
            f"{label} {bar:<{BAR_WIDTH}} {count:7d} "
            f"{100 * count / total:6.2f} {100 * cumulative / total:7.2f}"
        )


def show(new: o3d.geometry.PointCloud, base: o3d.geometry.PointCloud) -> None:
    base.paint_uniform_color([0.55, 0.55, 0.6])
    new.paint_uniform_color([1.0, 0.5, 0.1])
    o3d.visualization.draw_geometries(
        [base, new], window_name="mug_check: base (gray), new aligned (orange)"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("base", help="Reference scan (OBJ or anything trimesh loads)")
    parser.add_argument("new", help="Scan to compare against the reference")
    parser.add_argument("--show", action="store_true", help="Show both clouds overlaid after alignment")
    parser.add_argument(
        "--units", choices=UNIT_TO_M, default="m", help="Units of the mesh files (default: m)"
    )
    args = parser.parse_args()
    unit_to_m = UNIT_TO_M[args.units]

    base = to_cloud(load_mesh(args.base, unit_to_m), seed=0)
    new = to_cloud(load_mesh(args.new, unit_to_m), seed=1)
    print(f"Points after cleanup: base {len(base.points)}, new {len(new.points)}")

    result = align(new, base)
    print(f"ICP fitness:     {result.fitness:.4f}")
    print(f"ICP inlier RMSE: {1000 * result.inlier_rmse:.3f} mm")
    if result.fitness < LOW_FITNESS:
        print(
            "Warning: low ICP fitness. Centroid matching only fixes translation, "
            "so the scans may start too far apart in rotation."
        )
    new.transform(result.transformation)

    distances_mm = 1000 * cKDTree(np.asarray(base.points)).query(np.asarray(new.points))[0]
    print_histogram(distances_mm)

    p50, p95, p99 = np.percentile(distances_mm, [50, 95, 99])
    print(
        f"\np50 {p50:.3f} mm   p95 {p95:.3f} mm   p99 {p99:.3f} mm   "
        f"max {distances_mm.max():.3f} mm"
    )

    if args.show:
        show(new, base)


if __name__ == "__main__":
    main()
