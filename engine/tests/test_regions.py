"""Region radius and bounding box, and grouping changed points into regions."""

import numpy as np
import pytest
import trimesh

from scandiff.distance import signed_distances
from scandiff.preprocess import clean, to_point_cloud
from scandiff.regions import find_regions, measure_region

N_POINTS = 150_000
THRESHOLD_MM = 3.0
BOX = (0.12, 0.08, 0.06)
TOP = BOX[2] / 2
DENT_AT = (-0.03, 0.0)
CUBE_AT = (0.03, 0.0)
CAP_RADIUS = 0.010
CAP_DEPTH = 0.005
CUBE = 0.010


def test_radius_is_max_distance_from_centroid_and_bbox_holds_points():
    points = np.array(
        [
            [0.0, 0.0, 0.0],
            [0.02, 0.0, 0.0],
            [0.0, 0.01, 0.0],
        ]
    )

    extent = measure_region(points)

    assert extent.centroid_m == pytest.approx([0.02 / 3, 0.01 / 3, 0.0])
    distances = np.linalg.norm(points - extent.centroid_m, axis=1)
    assert extent.radius_m == pytest.approx(float(distances.max()))
    assert extent.bbox_min_m.tolist() == [0.0, 0.0, 0.0]
    assert extent.bbox_max_m.tolist() == [0.02, 0.01, 0.0]
    assert extent.radius_m < 0.03


def _cloud(mesh):
    return clean(to_point_cloud(mesh, N_POINTS))


def _regions(base_mesh, new_mesh):
    base, new = _cloud(base_mesh), _cloud(new_mesh)
    signed, reverse = signed_distances(new, base)
    return find_regions(new, base, signed, reverse, THRESHOLD_MM)


def _box(caps=()):
    """The box, with a spherical cap pressed into (depth > 0) or raised from the top for each (center, depth)."""
    mesh = trimesh.creation.box(extents=BOX).subdivide_to_size(0.0015)
    vertices = mesh.vertices.copy()
    on_top = np.isclose(vertices[:, 2], TOP)
    for center, depth in caps:
        r = np.linalg.norm(vertices[:, :2] - center, axis=1)
        vertices[on_top, 2] -= np.sign(depth) * _cap_depth(r[on_top], abs(depth))
    mesh.vertices = vertices
    return mesh


def _cap_depth(r, depth):
    """Depth of a spherical cap CAP_RADIUS across at distance r from its center."""
    sphere = (CAP_RADIUS**2 + depth**2) / (2 * depth)
    return np.where(r < CAP_RADIUS, np.sqrt(np.maximum(sphere**2 - r**2, 0.0)) - (sphere - depth), 0.0)


def _cap_area_cm2(depth):
    """Cap surface deeper than the threshold: a zone of its sphere, 2 pi R h."""
    sphere = (CAP_RADIUS**2 + depth**2) / (2 * depth)
    return 2 * np.pi * sphere * (depth - THRESHOLD_MM / 1000) * 1e4


def _glue_cube(box, at, size):
    """`box` with a cube glued on top: the cube has no bottom, and the box top under it is cut away."""
    cube = trimesh.creation.box(extents=[size] * 3).subdivide_to_size(0.0015)
    cube.apply_translation([*at, TOP + size / 2])
    cube.update_faces(cube.face_normals[:, 2] > -0.5)
    under = (box.face_normals[:, 2] > 0.5) & np.all(np.abs(box.triangles_center[:, :2] - at) < size / 2, axis=1)
    box.update_faces(~under)
    return trimesh.util.concatenate([box, cube])


def test_dent_and_glued_cube_make_one_region_each():
    regions = _regions(_box(), _glue_cube(_box([(DENT_AT, CAP_DEPTH)]), CUBE_AT, CUBE))

    # The cube is more severe: about 3.8 cm² at 10 mm, against 1.6 cm² at 5 mm.
    assert [region.kind for region in regions] == ["added", "dent"]
    cube, dent = regions
    # Above the threshold: the cube's top plus the part of its sides higher than 3 mm.
    assert cube.area_cm2 == pytest.approx(1 + 4 * (CUBE - THRESHOLD_MM / 1000) * CUBE * 1e4, rel=0.25)
    assert dent.area_cm2 == pytest.approx(_cap_area_cm2(CAP_DEPTH), rel=0.25)
    assert cube.max_depth_mm == pytest.approx(10, abs=0.5)
    assert dent.max_depth_mm == pytest.approx(5, abs=0.5)
    assert cube.extent.centroid_m[:2] == pytest.approx(CUBE_AT, abs=0.002)
    assert dent.extent.centroid_m[:2] == pytest.approx(DENT_AT, abs=0.002)
    assert THRESHOLD_MM < dent.mean_depth_mm < dent.max_depth_mm
    # The cube steps straight up from the box; the dent eases in.
    assert cube.sharpness > dent.sharpness
    assert 0.5 < dent.spread < 1.5


def test_removed_part_is_one_missing_region():
    knob = 0.015
    regions = _regions(_glue_cube(_box(), CUBE_AT, knob), _box())

    assert [region.kind for region in regions] == ["missing"]
    (missing,) = regions
    assert missing.area_cm2 == pytest.approx(knob**2 * 1e4 + 4 * (knob - THRESHOLD_MM / 1000) * knob * 1e4, rel=0.25)
    assert missing.max_depth_mm == pytest.approx(15, abs=1.0)
    assert missing.extent.centroid_m[:2] == pytest.approx(CUBE_AT, abs=0.002)


def test_touching_dent_and_bump_are_split():
    # 16 mm apart, so their changed patches are 2-3 mm apart and cluster together at first.
    regions = _regions(_box(), _box([((-0.008, 0.0), CAP_DEPTH), ((0.008, 0.0), -CAP_DEPTH)]))

    assert sorted(region.kind for region in regions) == ["added", "dent"]
    for region in regions:
        expected_x = -0.008 if region.kind == "dent" else 0.008
        assert region.extent.centroid_m[0] == pytest.approx(expected_x, abs=0.002)


def test_unchanged_scan_has_no_regions():
    assert _regions(_box(), _box()) == []
