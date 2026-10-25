"""Pydantic models for the API contract."""

from datetime import datetime
from typing import Annotated, Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from scandiff.config import DAMAGE_MIN_CONFIDENCE, ROTATION_ATOL

Label = Literal["normal_wear", "needs_review"]
DamageType = Literal["normal_wear", "scratch_scuff", "dent_damage", "missing_part"]
Kind = Literal["dent", "added", "missing"]
Verdict = Literal["accept", "damage_likely", "needs_review", "inconclusive"]
ScanSide = Literal["base", "new", "neither"]
# Plain-language triage shared with the iOS app (contract/README.md). Derived from the fields
# above, never computed separately, so it cannot disagree with `verdict` or a region's label.
Triage = Literal["no_change", "wear", "damage", "inconclusive"]
RegionTriage = Literal["wear", "damage", "inconclusive"]
_DAMAGE_TYPES = ("dent_damage", "missing_part")

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
    base_id: str = Field(
        description="`scans.id` of the base scan: the iOS scan_id, also its folder name in the scans bucket."
    )
    new_id: str = Field(description="`scans.id` of the new scan to compare against the base.")


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

    @computed_field(description="wear, damage (counts toward damage_likely), or inconclusive.")
    @property
    def triage(self) -> RegionTriage:
        if self.label == "normal_wear":
            return "wear"
        if self.damage_type in _DAMAGE_TYPES and self.confidence > DAMAGE_MIN_CONFIDENCE:
            return "damage"
        return "inconclusive"

    @computed_field(description="{min, max}: bbox_min_m and bbox_max_m.")
    @property
    def bbox(self) -> dict[str, list[float]]:
        return {"min": self.bbox_min_m, "max": self.bbox_max_m}

    @computed_field(description="Same as max_depth_mm.")
    @property
    def max_mm(self) -> float:
        return self.max_depth_mm

    @computed_field(description="Same as mean_depth_mm.")
    @property
    def mean_mm(self) -> float:
        return self.mean_depth_mm

    @field_validator("reason")
    @classmethod
    def reason_is_one_line(cls, value: str) -> str:
        if "\n" in value or "\r" in value:
            raise ValueError("reason must be a single line")
        return value


class UncoveredRegion(BaseModel):
    """Surface that was not compared because a scan did not capture it, such as an unscanned bottom.

    `only_in` says which scan did capture it: "base", "new", or "neither".
    `centroid_m` and `radius_m` match Region, so a marker can be placed and sized.
    """

    id: str
    only_in: ScanSide
    area_cm2: float = Field(description="Uncovered area on that scan, square centimeters.")
    centroid_m: CentroidM
    radius_m: float = Field(
        description="Max distance from centroid_m to any point in the uncovered patch, meters, in the base scan frame."
    )


class Histogram(BaseModel):
    bin_edges_mm: list[float] = Field(
        description="Histogram bin edges, millimeters of absolute change from the base surface."
    )
    counts: list[int] = Field(
        description="Unitless sample count in each bin. One fewer entry than bin_edges_mm."
    )

    @computed_field(description="Same as bin_edges_mm.")
    @property
    def bins_mm(self) -> list[float]:
        return self.bin_edges_mm


class Stats(BaseModel):
    changed_fraction: float = Field(
        description="Unitless fraction of the base surface whose change exceeds threshold_mm, from 0 to 1."
    )
    max_change_mm: float = Field(
        description="Largest absolute change, millimeters from the base surface."
    )
    noise_floor_mm: float = Field(
        description="95th-percentile distance between two scans of an unchanged object, millimeters."
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
    The scale is signed, not a magnitude ramp from unchanged to large change:
    blue is a dent (negative), gray is inside the neutral band around zero, and red is added material (positive).
    """

    min_mm: float = Field(description="Low end of the color scale, millimeters of signed change from the base surface. Negative is a dent.")
    max_mm: float = Field(description="High end of the color scale, millimeters of signed change from the base surface. Positive is added material.")
    threshold_mm: float = Field(
        description="Comparison threshold, millimeters from the base surface. Matches stats.threshold_mm."
    )
    colormap: Literal["diverging_blue_gray_red"] = Field(
        default=COLORMAP,
        description=(
            "Signed scale baked into the heatmap GLB vertex colors. "
            "Blue is a dent, gray is within neutral_band_mm of zero, red is added material. "
            "Not a blue-to-red magnitude ramp."
        ),
    )
    neutral_band_mm: float = Field(
        description="Half-width of the gray band around zero, millimeters. Equal to threshold_mm."
    )


class DiffResponse(BaseModel):
    """Comparison of a new scan against a base scan, for the web viewer.

    All three GLBs are in the base scan frame, in meters, with +Y up as in ARKit and glTF. Every
    position in this response (centroid_m, bbox_*_m) is in that frame too. The upload is USDZ, which
    three.js cannot load, so the engine publishes both scans as GLB. `new_model_url` is already aligned
    into the base frame. `heatmap_url` is the new scan's surface, also aligned into the base frame,
    with vertex colors already applied on the signed blue/gray/red scale. A part removed since the base
    scan has no surface in it; regions and stats still report it.

    verdict "inconclusive" means the scans could not be compared (unreadable, different items, failed
    alignment, or too little overlap): verdict_reason says why, and the URLs, legend, stats and
    fingerprints that could not be produced are null.
    """

    is_mock: bool = Field(
        description="True when this is the engine's fixed example response, not a comparison of the two scans."
    )
    heatmap_url: str | None = Field(
        description="Heatmap GLB: the new scan's surface aligned into the base scan frame, meters, with signed blue/gray/red vertex colors already applied."
    )
    base_model_url: str | None = Field(
        description="Base scan as GLB, in the base scan frame, meters. No heatmap colors."
    )
    new_model_url: str | None = Field(
        description="New scan as GLB, aligned into the base scan frame, meters. No heatmap colors."
    )
    heatmap_legend: HeatmapLegend | None
    histogram: Histogram
    stats: Stats | None
    regions: list[Region]
    uncovered_regions: list[UncoveredRegion]
    verdict: Verdict
    verdict_confidence: UnitInterval = Field(description="Unitless confidence in the verdict, from 0 to 1.")
    verdict_reason: str
    base_fingerprint: str | None
    new_fingerprint: str | None
    diff_id: str
    compared_fraction: UnitInterval | None = Field(
        default=None,
        description="Fraction of the base surface both scans captured and was compared, from 0 to 1. "
        "The rest is in uncovered_regions and never flagged. Null only in the mock.",
    )

    @computed_field(description="no_change, wear, damage, or inconclusive. A triage, not a guarantee.")
    @property
    def triage(self) -> Triage:
        if self.verdict == "damage_likely":
            return "damage"
        if self.verdict in ("needs_review", "inconclusive"):
            return "inconclusive"
        return "wear" if self.regions else "no_change"

    @computed_field(description="Same as verdict_confidence.")
    @property
    def confidence(self) -> float:
        return self.verdict_confidence

    @computed_field(description="Same as verdict_reason.")
    @property
    def reason(self) -> str:
        return self.verdict_reason


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
    """One texture that model.mtl references. Older apps send just the name; newer ones add its hex sha256."""

    model_config = ConfigDict(extra="ignore")

    file: str
    sha256: str = ""


class FileRecord(BaseModel):
    """One bundle file and its hex sha256, from `files` in metadata.json. An empty hash means unknown."""

    model_config = ConfigDict(extra="ignore")

    name: str
    sha256: str = ""


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
    files: list[FileRecord] = Field(default_factory=list)
    # The textured OBJ the app exports beside the model (same frame as model_file); older scans have none.
    obj_file: str | None = None
    material_file: str | None = None

    @field_validator("textures", mode="before")
    @classmethod
    def texture_names_are_files(cls, value: object) -> object:
        """Accept plain names as well as {file, sha256}: the app has sent both."""
        if isinstance(value, list):
            return [{"file": item} if isinstance(item, str) else item for item in value]
        return value
