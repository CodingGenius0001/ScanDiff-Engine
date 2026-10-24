"""Pydantic models for the API contract."""

from datetime import datetime
from typing import Annotated, Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, field_validator

from scandiff.config import ROTATION_ATOL

Label = Literal["normal_wear", "needs_review"]
DamageType = Literal["normal_wear", "scratch_scuff", "dent_damage", "missing_part"]
Kind = Literal["dent", "added"]
Verdict = Literal["match", "minor_wear", "needs_review"]
ScanSide = Literal["base", "new"]

def _point_m(description: str) -> type[list[float]]:
    return Annotated[list[float], Field(min_length=3, max_length=3, description=description)]


CentroidM = _point_m("Centroid [x, y, z] in the base scan frame, meters.")
BBoxMinM = _point_m(
    "Axis-aligned minimum corner [x, y, z] of the region in the base scan frame, meters."
)
BBoxMaxM = _point_m(
    "Axis-aligned maximum corner [x, y, z] of the region in the base scan frame, meters."
)
UnitInterval = Annotated[
    float,
    Field(ge=0, le=1, description="Unitless score from 0 to 1."),
]
COLORMAP = "diverging_blue_gray_red"


class DiffRequest(BaseModel):
    base_id: str
    new_id: str


class Region(BaseModel):
    id: str
    label: Label
    damage_type: DamageType
    kind: Kind
    area_cm2: float = Field(description="Region area on the base surface, square centimeters.")
    max_depth_mm: float = Field(
        description="Largest absolute change in the region, millimeters from the base surface."
    )
    mean_depth_mm: float = Field(
        description="Mean absolute change over the region, millimeters from the base surface."
    )
    centroid_m: CentroidM
    radius_m: float = Field(
        description="Max distance from centroid_m to any point in the region, meters, in the base scan frame."
    )
    bbox_min_m: BBoxMinM
    bbox_max_m: BBoxMaxM
    confidence: UnitInterval
    reason: str
    before_crop_url: str | None = None
    after_crop_url: str | None = None

    @field_validator("reason")
    @classmethod
    def reason_is_one_line(cls, value: str) -> str:
        if "\n" in value or "\r" in value:
            raise ValueError("reason must be a single line")
        return value


class UncoveredRegion(BaseModel):
    """Surface that only one of the two scans captured, so it cannot be compared."""

    id: str
    only_in: ScanSide
    area_cm2: float = Field(description="Uncovered area on that scan, square centimeters.")
    centroid: CentroidM


class Histogram(BaseModel):
    bin_edges_mm: list[float] = Field(
        description="Histogram bin edges, millimeters of absolute change from the base surface."
    )
    counts: list[int] = Field(
        description="Unitless sample count in each bin. One fewer entry than bin_edges_mm."
    )


class Stats(BaseModel):
    changed_fraction: float = Field(
        description="Unitless fraction of the base surface whose change exceeds threshold_mm, from 0 to 1."
    )
    max_change_mm: float = Field(
        description="Largest absolute change, millimeters from the base surface."
    )
    noise_floor_mm: float = Field(
        description="Estimated sensor noise, millimeters, in the base scan frame."
    )
    threshold_mm: float = Field(
        description="Change at or below this is treated as unchanged, millimeters from the base surface."
    )
    icp_fitness: float = Field(
        description="Unitless ICP inlier ratio from 0 to 1, after alignment into the base scan frame."
    )
    icp_rmse_mm: float = Field(
        description="ICP residual RMSE, millimeters, in the base scan frame."
    )
    diff_time_s: float = Field(description="Pipeline runtime, seconds.")


class HeatmapLegend(BaseModel):
    """How to read vertex colors on the heatmap GLB.

    The GLB is in the base scan's frame, in meters, with these colors already applied.
    Blue is change toward a dent, gray is inside the neutral band, and red is added material.
    """

    min_mm: float = Field(description="Low end of the color scale, millimeters of signed change from the base surface.")
    max_mm: float = Field(description="High end of the color scale, millimeters of signed change from the base surface.")
    threshold_mm: float = Field(
        description="Comparison threshold, millimeters from the base surface. Matches stats.threshold_mm."
    )
    colormap: Literal["diverging_blue_gray_red"] = COLORMAP
    neutral_band_mm: float = Field(
        description="Half-width of the gray band around zero, millimeters. Equal to threshold_mm."
    )


class DiffResponse(BaseModel):
    """Comparison of a new scan against a base scan, for the web viewer.

    `heatmap_url` is a GLB in the base scan's frame, in meters, with vertex colors already applied.
    """

    heatmap_url: str = Field(
        description="GLB in the base scan frame, meters, with vertex colors already applied."
    )
    heatmap_legend: HeatmapLegend
    histogram: Histogram
    stats: Stats
    regions: list[Region]
    uncovered_regions: list[UncoveredRegion]
    verdict: Verdict
    verdict_confidence: UnitInterval = Field(description="Unitless confidence in the verdict, from 0 to 1.")
    verdict_reason: str
    base_fingerprint: str
    new_fingerprint: str
    diff_id: str


Flat16 = Annotated[list[float], Field(min_length=16, max_length=16)]
Flat9 = Annotated[list[float], Field(min_length=9, max_length=9)]
PositiveInt = Annotated[int, Field(gt=0)]

_ROW_MAJOR = "the flat list was probably parsed row-major by mistake"


def _require_rotation(rotation: np.ndarray) -> None:
    orthonormal = np.allclose(rotation.T @ rotation, np.eye(3), atol=ROTATION_ATOL)
    if abs(float(np.linalg.det(rotation)) - 1.0) > ROTATION_ATOL or not orthonormal:
        raise ValueError(
            "camera_transform is not a rotation after column-major parsing; " + _ROW_MAJOR
        )


class TextureFile(BaseModel):
    """One extra texture file named by a later app version."""

    model_config = ConfigDict(extra="ignore")

    file: str
    sha256: str


class PhotoMeta(BaseModel):
    """One reference photo. Flat arrays stay column-major ARKit dumps.

    Use `T_cam_to_world` and `K`. Nothing else should read the flat lists.
    """

    model_config = ConfigDict(extra="ignore")

    file: str
    camera_transform: Flat16
    intrinsics: Flat9
    image_width: PositiveInt | None = None
    image_height: PositiveInt | None = None

    @field_validator("camera_transform")
    @classmethod
    def transform_ends_with_one(cls, value: list[float]) -> list[float]:
        if not np.isclose(value[-1], 1.0):
            raise ValueError("camera_transform last element must be 1")
        return value

    @property
    def T_cam_to_world(self) -> np.ndarray:
        """4x4 camera-to-world matrix. Translation is column 3, in meters."""
        transform = np.array(self.camera_transform, dtype=float).reshape(4, 4).T
        _require_rotation(transform[:3, :3])
        return transform

    @property
    def K(self) -> np.ndarray:
        """3x3 pinhole intrinsics, [[fx, 0, cx], [0, fy, cy], [0, 0, 1]]."""
        matrix = np.array(self.intrinsics, dtype=float).reshape(3, 3).T
        if not np.isclose(matrix[2, 2], 1.0):
            raise ValueError("intrinsics K[2, 2] is not 1; " + _ROW_MAJOR)
        return matrix


class ScanMetadata(BaseModel):
    """`metadata.json` from the iPhone app."""

    model_config = ConfigDict(extra="ignore")

    created_at: datetime
    created_by: str
    device: str
    item_id: str
    kind: str
    model_file: str
    model_sha256: str
    scan_id: str
    photos: list[PhotoMeta]
    units: str = "m"
    textures: list[TextureFile] = Field(default_factory=list)
