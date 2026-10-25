"""Property tests: invariants of the contract and the geometry over generated inputs."""

import json
from pathlib import Path

import jsonschema
import numpy as np
import pytest
from hypothesis import HealthCheck, assume, given, settings
from hypothesis import strategies as st
from hypothesis.extra.numpy import arrays
from pydantic import ValidationError

from app import pipeline
from app.schemas import DiffResponse, HeatmapLegend, Histogram, PhotoMeta, Region, Stats, _plain_name
from scandiff import config, storage
from scandiff.classify import geometry_score
from scandiff.heatmap import diverging_colors
from scandiff.io import _triangulate
from scandiff.regions import RegionExtent, RegionGeom, measure_region

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = json.loads((ROOT / "engine" / "contract" / "diff_response.schema.json").read_text())
SAMPLE = json.loads((ROOT / "contract" / "diff_response.json").read_text())
FAST = settings(max_examples=150, deadline=None, suppress_health_check=[HealthCheck.too_slow])

finite = st.floats(min_value=-1e3, max_value=1e3, allow_nan=False, allow_infinity=False)
unit = st.floats(min_value=0.0, max_value=1.0, allow_nan=False)
positive = st.floats(min_value=0.0, max_value=1e3, allow_nan=False)
point = st.lists(finite, min_size=3, max_size=3)
one_line = st.text(st.characters(blacklist_characters="\r\n"), max_size=80)

regions = st.builds(
    Region,
    id=st.text(min_size=1, max_size=8),
    label=st.sampled_from(["normal_wear", "needs_review"]),
    damage_type=st.sampled_from(["normal_wear", "scratch_scuff", "dent_damage", "missing_part"]),
    kind=st.sampled_from(["dent", "added", "missing"]),
    area_cm2=positive,
    max_depth_mm=positive,
    mean_depth_mm=positive,
    centroid_m=point,
    radius_m=positive,
    bbox_min_m=point,
    bbox_max_m=point,
    confidence=unit,
    reason=one_line,
)

responses = st.builds(
    DiffResponse,
    is_mock=st.booleans(),
    heatmap_url=st.none() | st.just("https://x/heatmap.glb"),
    base_model_url=st.none() | st.just("https://x/base.glb"),
    new_model_url=st.none() | st.just("https://x/new.glb"),
    heatmap_legend=st.none() | st.builds(HeatmapLegend, min_mm=finite, max_mm=finite, threshold_mm=positive, neutral_band_mm=positive),
    histogram=st.builds(Histogram, bin_edges_mm=st.lists(positive, max_size=5), counts=st.lists(st.integers(0, 10**6), max_size=4)),
    stats=st.none()
    | st.builds(
        Stats,
        changed_fraction=unit,
        max_change_mm=positive,
        noise_floor_mm=positive,
        threshold_mm=positive,
        icp_fitness=unit,
        icp_rmse_mm=positive,
        diff_time_s=positive,
    ),
    regions=st.lists(regions, max_size=4),
    uncovered_regions=st.just([]),
    verdict=st.sampled_from(["accept", "damage_likely", "needs_review", "inconclusive"]),
    verdict_confidence=unit,
    verdict_reason=one_line,
    base_fingerprint=st.none() | st.just("ab" * 32),
    new_fingerprint=st.none() | st.just("cd" * 32),
    diff_id=st.text(min_size=1, max_size=12),
    compared_fraction=st.none() | unit,
)


@FAST
@given(responses)
def test_every_response_matches_the_published_schema_and_derives_consistently(response):
    payload = json.loads(response.model_dump_json())

    jsonschema.validate(payload, SCHEMA)
    assert DiffResponse.model_validate(payload) == response
    assert payload["confidence"] == payload["verdict_confidence"]
    assert payload["reason"] == payload["verdict_reason"]
    assert payload["histogram"]["bins_mm"] == payload["histogram"]["bin_edges_mm"]
    expected = {"damage_likely": "damage", "needs_review": "inconclusive", "inconclusive": "inconclusive"}.get(
        response.verdict, "wear" if response.regions else "no_change"
    )
    assert payload["triage"] == expected
    for region in payload["regions"]:
        assert region["max_mm"] == region["max_depth_mm"] and region["mean_mm"] == region["mean_depth_mm"]
        assert region["bbox"] == {"min": region["bbox_min_m"], "max": region["bbox_max_m"]}
        if region["label"] == "normal_wear":
            assert region["triage"] == "wear"
        elif region["triage"] == "damage":
            assert region["damage_type"] in ("dent_damage", "missing_part") and region["confidence"] > config.DAMAGE_MIN_CONFIDENCE


def test_the_canonical_sample_matches_the_schema():
    jsonschema.validate(SAMPLE, SCHEMA)
    DiffResponse.model_validate(SAMPLE)


@pytest.mark.parametrize("bad", [{"verdict": "accepted"}, {"verdict_confidence": 1.5}, {"compared_fraction": -0.1}])
def test_the_schema_rejects_out_of_contract_values(bad):
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate({**SAMPLE, **bad}, SCHEMA)


@FAST
@given(one_line.filter(lambda s: s.strip(" .")))
def test_inconclusive_results_always_validate(reason):
    result = pipeline.inconclusive(reason, compared_fraction=0.42)

    jsonschema.validate(json.loads(result.model_dump_json()), SCHEMA)
    assert result.triage == "inconclusive" and result.regions == [] and result.stats is None


@FAST
@given(st.text(max_size=40))
def test_accepted_plain_names_never_leave_their_folder(name):
    try:
        _plain_name(name)
    except ValueError:
        return
    base = Path("/srv/data/scans/item/SCAN")
    assert (base / name).parent == base


@FAST
@given(st.lists(st.sampled_from(["a", "b", "..", ".", "", "c.glb"]), min_size=1, max_size=5))
def test_result_upload_paths_stay_inside_the_bucket(parts):
    path = "/".join(parts)
    try:
        relative = storage._relative_path(path)
    except ValueError:
        return
    assert not relative.startswith("/") and ".." not in relative.split("/")


@FAST
@given(arrays(np.float64, st.integers(1, 200), elements=st.floats(-1e6, 1e6, allow_nan=False)))
def test_histogram_counts_every_point_once(signed_mm):
    histogram = pipeline._absolute_histogram(signed_mm)

    assert sum(histogram.counts) == len(signed_mm)
    assert len(histogram.bin_edges_mm) == len(histogram.counts) + 1
    assert histogram.bin_edges_mm == sorted(histogram.bin_edges_mm)


@FAST
@given(arrays(np.float64, st.tuples(st.integers(1, 50), st.just(3)), elements=st.floats(-10, 10, allow_nan=False)))
def test_region_extent_contains_its_points(points):
    extent = measure_region(points)

    assert np.all(extent.bbox_min_m <= extent.centroid_m + 1e-9) and np.all(extent.centroid_m <= extent.bbox_max_m + 1e-9)
    assert 0 <= extent.radius_m <= np.linalg.norm(extent.bbox_max_m - extent.bbox_min_m) + 1e-9


@FAST
@given(st.lists(st.integers(0, 7), min_size=1, max_size=20))
def test_fan_triangulation_keeps_each_face_to_its_own_corners(counts):
    counts = np.array(counts)
    indices = np.arange(counts.sum())

    triangles = _triangulate(counts, indices)

    assert len(triangles) == np.clip(counts - 2, 0, None).sum()
    starts = np.cumsum(counts) - counts
    face_of = np.repeat(np.arange(len(counts)), counts)
    for triangle in triangles:
        assert len({face_of[corner] for corner in triangle}) == 1
        assert triangle[0] == starts[face_of[triangle[0]]]


@FAST
@given(
    st.floats(0, 10),
    st.floats(0.01, 50),
    st.floats(0.01, 20),
    st.floats(0, 5),
    st.floats(0, 5),
    st.floats(1, 20),
    st.sampled_from(["dent", "added", "missing"]),
)
def test_geometry_scores_are_a_distribution(area, depth, threshold, sharpness, spread, aspect, kind):
    geom = RegionGeom(
        kind=kind,
        indices=np.arange(3),
        area_cm2=area,
        max_depth_mm=depth,
        mean_depth_mm=depth / 2,
        extent=RegionExtent(np.zeros(3), 0.01, np.zeros(3), np.ones(3)),
        point_count=3,
        sharpness=sharpness,
        spread=spread,
        aspect_ratio=aspect,
        anchor_m=np.zeros(3),
        normal=np.array([0, 0, 1.0]),
    )

    scores = geometry_score(geom, threshold)

    assert sum(scores.values()) == pytest.approx(1.0)
    assert all(0 < value < 1 for value in scores.values())


@FAST
@given(arrays(np.float64, st.integers(1, 100), elements=st.floats(-100, 100, allow_nan=False)), st.floats(0.1, 5), st.floats(0.1, 20))
def test_heatmap_colors_are_valid_and_gray_inside_the_band(signed_mm, neutral, extra):
    colors = diverging_colors(signed_mm, neutral, neutral + extra)

    assert colors.shape[0] == len(signed_mm)
    assert np.all((colors >= 0) & (colors <= 255 if colors.dtype.kind in "iu" else colors <= 1.0 + 1e-9))
    inside = np.abs(signed_mm) <= neutral
    if inside.sum() > 1:
        assert np.allclose(colors[inside], colors[inside][0])


@FAST
@given(st.floats(-np.pi, np.pi), st.lists(st.floats(-1, 1), min_size=3, max_size=3), point)
def test_camera_pose_round_trips_column_major(angle, axis, translation):
    axis = np.array(axis)
    assume(np.linalg.norm(axis) > 0.1)
    from scipy.spatial.transform import Rotation

    pose = np.eye(4)
    pose[:3, :3] = Rotation.from_rotvec(angle * axis / np.linalg.norm(axis)).as_matrix()
    pose[:3, 3] = translation
    photo = PhotoMeta(file="p.jpg", camera_transform=pose.flatten(order="F").tolist(), intrinsics=[1, 0, 0, 0, 1, 0, 0, 0, 1])

    assert np.allclose(photo.T_cam_to_world, pose)


