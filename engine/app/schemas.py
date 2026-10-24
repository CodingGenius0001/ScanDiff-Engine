"""Pydantic models for the API contract."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

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


Vec4 = Annotated[list[float], Field(min_length=4, max_length=4)]
Matrix4 = Annotated[list[Vec4], Field(min_length=4, max_length=4)]
PositiveInt = Annotated[int, Field(gt=0)]


class Intrinsics(BaseModel):
    """Pinhole camera intrinsics, in pixels."""

    fx: float = Field(gt=0)
    fy: float = Field(gt=0)
    cx: float
    cy: float


class PhotoMetadata(BaseModel):
    """One reference photo shipped with a scan upload."""

    filename: str
    camera_to_world: Matrix4
    intrinsics: Intrinsics
    width: PositiveInt
    height: PositiveInt

    @field_validator("filename")
    @classmethod
    def filename_is_basename(cls, value: str) -> str:
        if not value or "/" in value or "\\" in value or value in {".", ".."}:
            raise ValueError("filename must be a file name, not a path")
        return value


class ScanMetadata(BaseModel):
    """`metadata.json` from the iPhone app.

    The app uploads a USDZ mesh with this file. The engine converts that USDZ
    to OBJ before any later pipeline step. `units` is always meters.
    """

    item_id: str
    scan_id: str
    captured_at: datetime
    device: str
    units: Literal["m"]
    photos: list[PhotoMetadata]
