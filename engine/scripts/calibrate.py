"""Measure scan-to-scan noise from rescans of unchanged objects and save the threshold.

    python scripts/calibrate.py scanA scanB [scanC scanD ...]

Scans are taken in pairs: A with B, C with D. Each pair must be two scans of
the same object with nothing changed in between. A scan is a folder from
fetch_scans.py or a model file. The result goes to engine/calibration.json,
which config reads at startup.
"""

import argparse
import sys
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE_DIR))

from scandiff import config  # noqa: E402
from scandiff.distance import calibrate_noise_floor, write_calibration  # noqa: E402
from scandiff.errors import ScanDiffError  # noqa: E402
from scandiff.io import find_model_file, load_mesh  # noqa: E402
from scandiff.preprocess import clean, to_point_cloud  # noqa: E402


def load_cloud(scan: Path):
    model = scan if scan.is_file() else find_model_file(scan)
    return clean(to_point_cloud(load_mesh(model)))


def label(scan: Path) -> str:
    """item/scan for a fetched folder, the file name for a model file."""
    folder = scan.parent if scan.is_file() else scan
    return f"{folder.parent.name}/{folder.name}" + (f" ({scan.name})" if scan.is_file() else "")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("scans", nargs="+", type=Path, help="Scans in pairs of the same unchanged object")
    parser.add_argument(
        "--out", type=Path, default=config.CALIBRATION_PATH, help="Where to write (default: engine/calibration.json)"
    )
    args = parser.parse_args()
    if len(args.scans) % 2:
        parser.error("pass scans in pairs: an even number of scans")

    pairs, names = [], []
    try:
        for scan_a, scan_b in zip(args.scans[::2], args.scans[1::2]):
            pairs.append((load_cloud(scan_a), load_cloud(scan_b)))
            names.append([label(scan_a), label(scan_b)])
        calibration = calibrate_noise_floor(pairs)
    except ScanDiffError as exc:
        sys.exit(f"{type(exc).__name__}: {exc}")
    for pair, scans in zip(calibration["pairs"], names):
        pair["scans"] = scans

    sigma = calibration["sigma_mm"]
    threshold = calibration["threshold_mm"]
    count = len(calibration["pairs"])
    print(f"Noise floor from {count} rescan pair{'s' if count != 1 else ''} of unchanged objects, "
          f"{calibration['points']:,} points compared")
    print(f"  Scan-to-scan noise (sigma, from MAD)  {sigma:5.2f} mm")
    print(f"  95% of the surface agrees within      {calibration['p95_mm']:5.2f} mm")
    print(f"  99% of the surface agrees within      {calibration['p99_mm']:5.2f} mm")
    print(f"  Change threshold                      {threshold:5.2f} mm  "
          f"(the 95th percentile, floor {config.MIN_THRESHOLD_MM:g} mm)")
    print()
    for index, pair in enumerate(calibration["pairs"], start=1):
        print(f"  Pair {index}: {pair['scans'][0]} vs {pair['scans'][1]}")
        print(f"    ICP fitness {pair['icp_fitness']:.3f}, RMSE {pair['icp_rmse_mm']:.2f} mm; "
              f"sigma {pair['sigma_mm']:.2f} mm, p95 {pair['p95_mm']:.2f} mm, p99 {pair['p99_mm']:.2f} mm")
    print()
    print("Pitch line:")
    print(f"  Two scans of the same unchanged item agree within {calibration['p95_mm']:.1f} mm on 95% "
          f"of the surface, so ScanDiff only flags changes larger than {threshold:.1f} mm.")
    print()
    print(f"Saved {write_calibration(calibration, args.out)}")


if __name__ == "__main__":
    main()
