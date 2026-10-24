"""Geometry-only classification of synthetic damage, the vision fallback, and the verdict rules."""

import time
from types import SimpleNamespace

import numpy as np
import pytest
import trimesh
from PIL import Image

from scandiff import classify, config
from scandiff.classify import classify as classify_region
from scandiff.classify import geometry_score, vision_score
from scandiff.distance import signed_distances
from scandiff.preprocess import clean, to_point_cloud
from scandiff.regions import RegionExtent, RegionGeom, find_regions
from scandiff.verdict import ClassifiedRegion, decide

THRESHOLD_MM = 3.0
BOX = (0.12, 0.08, 0.06)
TOP = BOX[2] / 2
DENT_AT = np.array([-0.038, 0.010])
SCRATCH = (np.array([-0.020, 0.028]), np.array([0.030, 0.028]))
SCUFF = [(np.array([0.0, -0.022]), np.array([0.040, -0.022])), (np.array([0.0, -0.022]), np.array([0.0, 0.008]))]


@pytest.fixture(autouse=True)
def no_vision(monkeypatch):
    monkeypatch.setattr(classify, "vision_provider", lambda: None)


def _to_segment(points, start, end):
    """Distance from each 2D point to the segment start-end."""
    direction = end - start
    t = np.clip((points - start) @ direction / (direction @ direction), 0.0, 1.0)
    return np.linalg.norm(points - (start + t[:, None] * direction), axis=1)


def _depth(xy):
    """Depth below the box top, meters: a dent, a scratch, and an L-shaped scuff."""
    # Dent: spherical cap 24 mm across and 8 mm deep.
    radius, deep = 0.012, 0.008
    sphere = (radius**2 + deep**2) / (2 * deep)
    r = np.linalg.norm(xy - DENT_AT, axis=1)
    dent = np.where(r < radius, np.sqrt(np.maximum(sphere**2 - r**2, 0)) - (sphere - deep), 0.0)
    # Scratch: 50 mm long, 3.8 mm deep with a flat floor 4 mm wide and steep walls.
    s = _to_segment(xy, *SCRATCH)
    scratch = 0.0038 * np.clip((0.003 - s) / 0.001, 0.0, 1.0)
    # Scuff: two shallow 3.7 mm arms meeting at a corner, easing in over 12 mm on each side.
    s = np.minimum(*(_to_segment(xy, *arm) for arm in SCUFF))
    scuff = 0.0037 * np.cos(np.clip(s / 0.012, 0.0, 1.0) * np.pi / 2) ** 2
    return np.maximum.reduce([dent, scratch, scuff])


def _box(damaged):
    mesh = trimesh.creation.box(extents=BOX).subdivide_to_size(0.001)
    if damaged:
        vertices = mesh.vertices.copy()
        top = np.isclose(vertices[:, 2], TOP)
        vertices[top, 2] -= _depth(vertices[top, :2])
        mesh.vertices = vertices
    return mesh


def _nearest(regions, xy):
    return min(regions, key=lambda region: np.linalg.norm(region.extent.centroid_m[:2] - xy))


def test_dent_scratch_and_scuff_get_their_labels():
    base = clean(to_point_cloud(_box(False)))
    new = clean(to_point_cloud(_box(True)))
    signed, reverse = signed_distances(new, base)
    regions = find_regions(new, base, signed, reverse, THRESHOLD_MM)
    assert len(regions) == 3

    labels = {}
    for name, xy in (("dent", DENT_AT), ("scratch", sum(SCRATCH) / 2), ("scuff", np.array([0.012, -0.012]))):
        region = _nearest(regions, xy)
        label, confidence, reason = classify_region(region, threshold_mm=THRESHOLD_MM)
        labels[name] = label
        assert confidence == pytest.approx(max(geometry_score(region, THRESHOLD_MM).values()))
        assert "\n" not in reason and reason.endswith(".")
    assert labels == {"dent": "dent_damage", "scratch": "scratch_scuff", "scuff": "normal_wear"}


def _region(**overrides) -> RegionGeom:
    fields = dict(
        kind="dent",
        indices=np.arange(1),
        area_cm2=1.0,
        max_depth_mm=4.0,
        mean_depth_mm=3.5,
        extent=RegionExtent(np.zeros(3), 0.005, np.full(3, -0.005), np.full(3, 0.005)),
        point_count=40,
        sharpness=0.3,
        spread=1.0,
        aspect_ratio=1.0,
        anchor_m=np.array([0.0, 0.18, 0.0]),
        normal=np.array([0.0, 0.0, 1.0]),
    )
    return RegionGeom(**{**fields, **overrides})


def test_missing_regions_and_deep_compact_holes_are_missing_parts():
    assert max(geometry_score(_region(kind="missing", area_cm2=6.0)).items(), key=lambda kv: kv[1])[0] == "missing_part"
    deep = geometry_score(_region(max_depth_mm=25.0, area_cm2=12.0))
    assert deep["missing_part"] > 0.4
    # Deep added material is not a missing part.
    assert geometry_score(_region(kind="added", max_depth_mm=25.0, area_cm2=12.0))["missing_part"] < 0.1


def test_scores_are_soft_probabilities():
    near_cutoff = geometry_score(_region(max_depth_mm=2 * THRESHOLD_MM, sharpness=0.2), THRESHOLD_MM)
    assert sum(near_cutoff.values()) == pytest.approx(1.0)
    assert 0.2 < near_cutoff["dent_damage"] < 0.8


def test_reason_is_one_plain_line():
    region = _region(max_depth_mm=4.2, area_cm2=3.04, sharpness=0.9)
    reason = classify.describe(region, "dent_damage", bounds=np.array([[0, 0, 0], [0.2, 0.2, 0.2]]))
    assert reason == "4 mm deep, 3.0 cm² dent with sharp edges near the top."
    bump = classify.describe(_region(kind="added", max_depth_mm=6.0, area_cm2=12.4), "dent_damage")
    assert bump == "6 mm high, 12 cm² bump."


def _crops():
    return Image.new("RGB", (256, 256), "gray"), Image.new("RGB", (256, 256), "white")


def test_vision_mixes_in_and_never_blocks(monkeypatch):
    region = _region(max_depth_mm=8.0, sharpness=0.9)
    geometry = geometry_score(region)

    monkeypatch.setattr(classify, "vision_provider", lambda: lambda image, prompt: {
        "label": "scratch_scuff", "confidence": 0.9, "reason": "A light scratch."
    })
    label, confidence, _ = classify_region(region, _crops())
    vision = vision_score(*_crops())
    assert vision["scratch_scuff"] == pytest.approx(0.9)
    assert confidence == pytest.approx(0.6 * geometry[label] + 0.4 * vision[label])

    def slow(image, prompt):
        time.sleep(config.VISION_TIMEOUT_S + 2)

    monkeypatch.setattr(classify, "vision_provider", lambda: slow)
    start = time.perf_counter()
    assert vision_score(*_crops()) is None
    assert time.perf_counter() - start < config.VISION_TIMEOUT_S + 0.5
    assert classify_region(region, _crops())[1] == pytest.approx(max(geometry.values()))

    monkeypatch.setattr(classify, "vision_provider", lambda: lambda image, prompt: {"label": "rust"})
    assert vision_score(*_crops()) is None
    assert vision_score(None, _crops()[1]) is None


def _align(gate_fitness=0.95):
    return SimpleNamespace(gate_fitness=gate_fitness)


def _classified(label, confidence, **overrides):
    return ClassifiedRegion(_region(**overrides), label, confidence, f"Some {label} here.")


def test_verdicts():
    calm = {"changed_fraction": 0.005}
    assert decide([], calm, _align())[0] == "accept"
    assert decide([_classified("normal_wear", 0.8)], calm, _align())[0] == "accept"
    assert decide([_classified("normal_wear", 0.8)], {"changed_fraction": 0.2}, _align())[0] == "needs_review"

    verdict, confidence, reason = decide([_classified("dent_damage", 0.9)], calm, _align())
    assert verdict == "damage_likely"
    assert reason == "Likely damage: some dent_damage here."
    assert confidence == pytest.approx(0.9 * (0.95 - config.MIN_FITNESS) / (1 - config.MIN_FITNESS))

    assert decide([_classified("dent_damage", 0.6)], calm, _align())[0] == "needs_review"
    assert decide([_classified("scratch_scuff", 0.9)], calm, _align())[0] == "needs_review"
    # Weak alignment or a scale warning overrides everything, and lowers trust in the regions.
    weak, weak_confidence, weak_reason = decide([_classified("dent_damage", 0.9)], calm, _align(0.7))
    assert weak == "needs_review" and "70%" in weak_reason
    assert decide([], calm, _align(), scale_warning="new scan is 4% larger")[0] == "needs_review"
    assert weak_confidence > decide([_classified("dent_damage", 0.6)], calm, _align())[1]
