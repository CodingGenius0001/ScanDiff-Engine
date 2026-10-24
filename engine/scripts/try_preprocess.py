"""Run loading and preprocessing on downloaded scans and print what each step did.

    python scripts/try_preprocess.py data/scans/<item_id>/<scan_id> [<scan_dir2>] [--show] [--save out/preview.ply]

A scan dir is a folder from fetch_scans.py, or a model file path. With two
scans, the second is aligned onto the first and the scale check runs too.
"""

import argparse
import sys
import time
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE_DIR))

import open3d as o3d  # noqa: E402

from scandiff.align import align  # noqa: E402
from scandiff.errors import ScanDiffError  # noqa: E402
from scandiff.io import find_model_file, load_mesh  # noqa: E402
from scandiff.preprocess import (  # noqa: E402
    MM,
    CleanReport,
    check_gross_scale,
    clean_with_report,
    scale_check,
    sorted_extents,
    to_point_cloud,
)

REMOVED_COLOR = [1.0, 0.0, 0.0]
KEPT_COLOR = [0.6, 0.6, 0.6]


def step(label: str, detail: str, seconds: float | None = None) -> None:
    timing = "" if seconds is None else f"{seconds:7.2f} s"
    print(f"  {label:<14}{detail:<44}{timing}")


def preprocess(scan: Path) -> tuple[o3d.geometry.PointCloud, CleanReport]:
    model = scan if scan.is_file() else find_model_file(scan)
    print(f"{scan}  ({model.name})")

    start = time.perf_counter()
    mesh = load_mesh(model)
    step("mesh", f"{len(mesh.vertices)} vertices, {len(mesh.faces)} faces", time.perf_counter() - start)

    start = time.perf_counter()
    sampled = to_point_cloud(mesh)
    step("sampled", f"{len(sampled.points)} points", time.perf_counter() - start)

    cloud, report = clean_with_report(sampled)
    seconds = report.seconds
    step("downsampled", f"{report.downsampled_points} points", seconds["downsample"])
    step("outliers", f"-{report.outlier_points} points", seconds["outliers"])
    if "ground_plane" in seconds:
        step("ground plane", f"-{report.plane_points} points", seconds["ground_plane"])
    else:
        step("ground plane", "off (config.REMOVE_GROUND_PLANE)")
    step("normals", "", seconds["normals"])
    step("cleaned", f"{len(cloud.points)} points")
    extents = " x ".join(f"{value / MM:.1f}" for value in sorted_extents(cloud))
    step("extents", f"{extents} mm")
    return cloud, report


def show(cloud: o3d.geometry.PointCloud, report: CleanReport, title: str) -> None:
    kept = o3d.geometry.PointCloud(cloud)
    if not kept.has_colors():
        kept.paint_uniform_color(KEPT_COLOR)
    removed = o3d.geometry.PointCloud(report.removed)
    removed.paint_uniform_color(REMOVED_COLOR)
    o3d.visualization.draw_geometries([kept, removed], window_name=f"{title} (removed in red)")


def save_paths(path: Path, count: int) -> list[Path]:
    if count == 1:
        return [path]
    return [path.with_name(f"{path.stem}_{index}{path.suffix}") for index in range(1, count + 1)]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("scans", nargs="+", type=Path, metavar="scan_dir", help="One or two scan dirs")
    parser.add_argument("--show", action="store_true", help="Show each cleaned cloud, removed points in red")
    parser.add_argument("--save", type=Path, metavar="PLY", help="Write the cleaned cloud(s) here")
    args = parser.parse_args()
    if len(args.scans) > 2:
        parser.error("pass one or two scan dirs")

    results = []
    for scan in args.scans:
        try:
            results.append(preprocess(scan))
        except ScanDiffError as exc:
            sys.exit(f"  {type(exc).__name__}: {exc}")
        print()

    if len(results) == 2:
        base, new = results[0][0], results[1][0]
        try:
            check_gross_scale(base, new)
            start = time.perf_counter()
            aligned = align(new, base)
            print(
                f"alignment: {aligned.method}, fitness {aligned.fitness:.3f}, "
                f"RMSE {aligned.rmse_mm:.2f} mm{time.perf_counter() - start:9.2f} s"
            )
            check = scale_check(base, aligned.aligned)
        except ScanDiffError as exc:
            print(f"{type(exc).__name__}: {exc}")
        else:
            ratios = ", ".join(f"{ratio:.4f}" for ratio in check["ratios"])
            print(f"scale check: new / base along the base's box axes, smallest first: {ratios}")
            print(f"  warning: {check['warning'] or 'none'}")

    if args.save:
        for (cloud, _), path in zip(results, save_paths(args.save, len(results))):
            path.parent.mkdir(parents=True, exist_ok=True)
            o3d.io.write_point_cloud(str(path), cloud)
            print(f"saved {path}")

    if args.show:
        for scan, (cloud, report) in zip(args.scans, results):
            show(cloud, report, scan.name)


if __name__ == "__main__":
    main()
