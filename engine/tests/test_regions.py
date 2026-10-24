"""Region radius and bounding box from the region's points."""

import numpy as np
import pytest

from scandiff.regions import measure_region


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
