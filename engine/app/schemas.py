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

# A point in the scan frame, in meters, the same frame as the heatmap mesh.
Centroid = Annotated[list[float], Field(min_length=3, max_length=3)]
UnitInterval = Annotated[float, Field(ge=0, le=1)]


class DiffRequest(BaseModel):
    base_id: str
    new_id: str


class Region(BaseModel):
    id: str
    label: Label
    damage_type: DamageType
    kind: Kind
    area_cm2: float
    max_depth_mm: float
    centroid: Centroid
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
    area_cm2: float
    centroid: Centroid


class Histogram(BaseModel):
    bin_edges_mm: list[float]
    counts: list[int]


class Stats(BaseModel):
    changed_fraction: float
    max_change_mm: float
    noise_floor_mm: float
    threshold_mm: float
    icp_fitness: float
    icp_rmse_mm: float
    diff_time_s: float


class DiffResponse(BaseModel):
    heatmap_url: str
    histogram: Histogram
    stats: Stats
    regions: list[Region]
    uncovered_regions: list[UncoveredRegion]
    verdict: Verdict
    verdict_confidence: UnitInterval
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
