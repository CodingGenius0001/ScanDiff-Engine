"""Signed distances, noise calibration, and comparison stats."""

import numpy as np
import open3d as o3d
import pytest
import trimesh

from scandiff import config
from scandiff.distance import calibrate_noise_floor, signed_distances, stats, write_calibration
from scandiff.preprocess import clean, to_point_cloud

N_POINTS = 60_000
RADIUS = 0.05
DENT_CENTER = np.array([0.0, 0.0, 1.0])
DENT_DEPTH = 0.005


def _cloud(mesh):
    return clean(to_point_cloud(mesh, N_POINTS))


def _surface_distance(points):
    """Arc length on the sphere from the dent center, meters."""
    unit = points / np.linalg.norm(points, axis=1, keepdims=True)
    return RADIUS * np.arccos(np.clip(unit @ DENT_CENTER, -1.0, 1.0))


def _sphere():
    return trimesh.creation.icosphere(subdivisions=5, radius=RADIUS)


def _dented_sphere():
    """5 mm flat-bottomed dent, 12 mm across the bottom, easing out by 18 mm."""
    mesh = _sphere()
    s = _surface_distance(mesh.vertices)
    depth = DENT_DEPTH * np.clip((0.018 - s) / 0.006, 0.0, 1.0)
    mesh.vertices = mesh.vertices * (1.0 - depth / RADIUS)[:, None]
    return mesh


def test_dent_comes_out_negative_and_the_rest_near_zero():
    base = _cloud(_sphere())
    new = _cloud(_dented_sphere())

    signed, reverse = signed_distances(new, base)

    s = _surface_distance(np.asarray(new.points))
    core = signed[s < 0.010]
    untouched = signed[s > 0.025]
    assert len(core) > 50
    assert np.median(core) == pytest.approx(-DENT_DEPTH, abs=0.0003)
    assert np.all(np.abs(core + DENT_DEPTH) < 0.0006)
    assert np.all(np.abs(untouched) < 0.0003)
    assert reverse.shape == (len(base.points),)
    assert reverse[_surface_distance(np.asarray(base.points)) < 0.010].min() > 0.004


def test_inward_normals_are_flipped_outward():
    base = _cloud(_sphere())
    flipped = o3d.geometry.PointCloud(base)
    flipped.normals = o3d.utility.Vector3dVector(-np.asarray(base.normals))
    new = _cloud(_dented_sphere())

    assert np.allclose(signed_distances(new, flipped)[0], signed_distances(new, base)[0])


def test_removed_part_shows_in_the_reverse_distances():
    knob = trimesh.creation.box(extents=[0.02, 0.02, 0.015])
    knob.apply_translation([0.0, 0.0, RADIUS + 0.005])
    base = _cloud(trimesh.util.concatenate([_sphere(), knob]))
    new = _cloud(_sphere())

    signed, reverse = signed_distances(new, base)
    result = stats(signed, reverse, threshold=0.002, point_area=1e-6)

    assert np.abs(signed).max() < 0.001
    assert reverse.max() > 0.01
    assert result["changed_fraction"] == 0.0
    assert result["unmatched_base_fraction"] > 0.02


def test_stats_weights_by_area_and_bins_overflow():
    d_signed = np.array([-0.005] * 10 + [0.0] * 80 + [0.004] * 10 + [-0.02, 0.03])
    d_reverse = np.zeros(5)
    area = np.ones(len(d_signed))
    area[:10] = 3.0

    result = stats(d_signed, d_reverse, threshold=0.002, point_area=area)

    histogram = result["histogram"]
    assert len(histogram["bin_edges_mm"]) == len(histogram["counts"]) + 1 == 31
    assert histogram["bin_edges_mm"][0] == -15.0 and histogram["bin_edges_mm"][-1] == 15.0
    assert histogram["below_range"] == 1 and histogram["above_range"] == 1
    assert sum(histogram["counts"]) + 2 == len(d_signed)
    changed_area = 30 + 10 + 2
    assert result["changed_fraction"] == pytest.approx(changed_area / area.sum())
    assert result["dent_share"] == pytest.approx(31 / changed_area)
    assert result["added_share"] == pytest.approx(11 / changed_area)
    assert result["max_change_mm"] == pytest.approx(30.0)
    assert result["max_dent_mm"] == pytest.approx(20.0)
    assert result["max_added_mm"] == pytest.approx(30.0)
    assert result["threshold_mm"] == pytest.approx(2.0)


def test_stats_with_nothing_changed():
    result = stats(np.zeros(10), np.zeros(10), threshold=0.002, point_area=1e-6)

    assert result["changed_fraction"] == 0.0
    assert result["mean_change_mm"] == 0.0
    assert result["dent_share"] == result["added_share"] == 0.0


def test_calibration_round_trips_through_the_file(tmp_path):
    box = trimesh.creation.box(extents=[0.10, 0.06, 0.03])
    scan_a = _cloud(box)
    noisy = to_point_cloud(box, N_POINTS)
    rng = np.random.default_rng(0)
    noisy.points = o3d.utility.Vector3dVector(
        np.asarray(noisy.points) + rng.normal(0, 0.0003, (len(noisy.points), 3))
    )
    scan_b = clean(noisy)

    calibration = calibrate_noise_floor([(scan_a, scan_b)])

    assert 0 < calibration["sigma_mm"] < 0.5
    assert calibration["sigma_mm"] < calibration["p95_mm"] < calibration["p99_mm"]
    assert calibration["threshold_mm"] == max(config.MIN_THRESHOLD_MM, 3 * calibration["sigma_mm"])
    assert len(calibration["pairs"]) == 1

    path = write_calibration(calibration, tmp_path / "calibration.json")
    loaded = config.load_calibration(path)
    assert loaded["threshold_mm"] == calibration["threshold_mm"]
    assert "created_at" in loaded


def test_calibration_needs_a_pair():
    with pytest.raises(ValueError):
        calibrate_noise_floor([])


def test_calibration_pools_variances_across_pairs():
    box = trimesh.creation.box(extents=[0.10, 0.06, 0.03])
    scan = _cloud(box)
    noisy = to_point_cloud(box, N_POINTS)
    rng = np.random.default_rng(1)
    noisy.points = o3d.utility.Vector3dVector(
        np.asarray(noisy.points) + rng.normal(0, 0.0005, (len(noisy.points), 3))
    )

    calibration = calibrate_noise_floor([(scan, clean(noisy)), (scan, o3d.geometry.PointCloud(scan))])

    noisy_pair, quiet_pair = calibration["pairs"]
    assert quiet_pair["sigma_mm"] < 0.01
    pooled = np.sqrt(
        (noisy_pair["points"] * noisy_pair["sigma_mm"] ** 2 + quiet_pair["points"] * quiet_pair["sigma_mm"] ** 2)
        / (noisy_pair["points"] + quiet_pair["points"])
    )
    assert calibration["sigma_mm"] == pytest.approx(pooled)
    assert calibration["sigma_mm"] > 0.5 * noisy_pair["sigma_mm"]
