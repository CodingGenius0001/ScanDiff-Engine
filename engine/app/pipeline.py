"""The real comparison behind POST /diff."""

import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import trimesh

from app.scan_models import converted_glb, publish_glb, textured_mesh
from app.schemas import DiffResponse, HeatmapLegend, Histogram, Region, ScanMetadata, Stats, UncoveredRegion
from scandiff import config, storage
from scandiff.align import align
from scandiff.classify import classify
from scandiff.coverage import UncoveredPatch, coverage
from scandiff.distance import signed_distances, stats
from scandiff.errors import (
    AlignmentFailed,
    ChecksumMismatch,
    InvalidMetadata,
    ScaleMismatch,
    ScanTooSparse,
    UnsupportedFormat,
)
from scandiff.heatmap import heatmap_legend, make_heatmap
from scandiff.io import load_mesh
from scandiff.photos import Photo, ScanView, crop_pair, load_photo, upload_crops
from scandiff.preprocess import MM, check_gross_scale, clean, scale_check, to_point_cloud
from scandiff.regions import cloud_point_areas, find_regions
from scandiff.verdict import ClassifiedRegion, decide

# Crops, vision calls and uploads run side by side.
_POOL_SIZE = config.MAX_CROPPED_REGIONS
# Problems with the scans themselves: the answer is "inconclusive", not an error.
UNUSABLE_SCAN = (InvalidMetadata, ChecksumMismatch, UnsupportedFormat, ScanTooSparse)


@dataclass(frozen=True)
class LoadedScan:
    metadata: ScanMetadata
    mesh: trimesh.Trimesh
    folder: Path


def load_scan(model: Path, metadata: ScanMetadata) -> LoadedScan:
    return LoadedScan(metadata, load_mesh(model), model.parent)


def run_diff(base_id: str, new_id: str) -> DiffResponse:
    """Fetch both scans from Supabase and compare them.

    Raises ScanNotFound, StorageNotConfigured or UploadFailed; a scan that
    cannot be read or compared comes back inconclusive instead.
    """
    try:
        base = load_scan(*storage.fetch_scan(base_id))
        new = load_scan(*storage.fetch_scan(new_id))
    except UNUSABLE_SCAN as exc:
        return inconclusive(_sentence(str(exc)))
    return compare(base, new)


def compare(base: LoadedScan, new: LoadedScan, diff_id: str | None = None, check_items: bool = True) -> DiffResponse:
    """Align `new` onto `base`, find and classify what changed, and upload the result files.

    Both scans' GLBs are also stored next to their originals (see scan_models.publish_glb).

    Only surface that both scans captured is compared (see scandiff/coverage.py).
    Different item ids (unless `check_items` is off), a size mismatch, a
    failed alignment, or too little overlap make the result inconclusive.
    Raises UploadFailed.
    """
    start = time.perf_counter()
    diff_id = diff_id or uuid.uuid4().hex
    fingerprints = {
        "base_fingerprint": base.metadata.model_sha256.lower(),
        "new_fingerprint": new.metadata.model_sha256.lower(),
    }
    if check_items and base.metadata.item_id != new.metadata.item_id:
        return inconclusive(
            f"The scans are of different items ({base.metadata.item_id} and {new.metadata.item_id}).",
            diff_id,
            **fingerprints,
        )
    threshold_mm = config.THRESHOLD_MM
    threshold = threshold_mm * MM
    try:
        base_cloud = clean(to_point_cloud(base.mesh))
        new_cloud = clean(to_point_cloud(new.mesh))
        check_gross_scale(base_cloud, new_cloud)
        aligned = align(new_cloud, base_cloud)
    except (ScanTooSparse, ScaleMismatch, AlignmentFailed) as exc:
        return inconclusive(_sentence(str(exc)), diff_id, **fingerprints)

    scale_warning = scale_check(base_cloud, aligned.aligned)["warning"]
    d_signed, d_reverse = signed_distances(aligned.aligned, base_cloud)
    try:
        base_view = ScanView(_key_photos(base), base.mesh)
        new_view = ScanView(_key_photos(new), new.mesh, aligned.transform)
    except InvalidMetadata as exc:
        return inconclusive(_sentence(str(exc)), diff_id, **fingerprints)
    base_areas = cloud_point_areas(base_cloud)
    new_areas = cloud_point_areas(aligned.aligned)
    covered = coverage(base_cloud, aligned.aligned, d_signed, d_reverse, base_view, new_view, base_areas)
    uncovered = [_uncovered(f"u{number}", patch) for number, patch in enumerate(covered.uncovered, start=1)]
    if covered.compared_fraction < config.MIN_COMPARED_FRACTION:
        return inconclusive(
            f"Only {covered.compared_fraction:.0%} of the item was captured in both scans; "
            "rescan so both cover all of it.",
            diff_id,
            compared_fraction=covered.compared_fraction,
            uncovered_regions=uncovered,
            **fingerprints,
        )

    new_compared, base_compared = covered.new_compared, covered.base_compared
    summary = stats(
        d_signed[new_compared], d_reverse[base_compared], threshold, new_areas[new_compared], base_areas[base_compared]
    )
    geoms = find_regions(aligned.aligned, base_cloud, d_signed, d_reverse, threshold_mm, new_compared, base_compared)

    cropped = geoms[: config.MAX_CROPPED_REGIONS]
    with ThreadPoolExecutor(_POOL_SIZE) as pool:
        pairs = list(pool.map(lambda geom: crop_pair(geom, base_view, new_view), cropped))
        pairs += [None] * (len(geoms) - len(cropped))
        bounds = base.mesh.bounds
        labels = list(pool.map(lambda geom, pair: classify(geom, pair, threshold_mm, bounds), geoms, pairs))
        uploaded = list(
            pool.map(
                lambda number, geom, pair: upload_crops(geom, pair, diff_id, number) if pair else geom,
                range(1, len(geoms) + 1),
                geoms,
                pairs,
            )
        )
        heatmap = pool.submit(make_heatmap, new.mesh, aligned.transform, base_cloud, threshold_mm)
        new_textured = pool.submit(textured_mesh, new.metadata, new.mesh)

        def new_aligned_glb() -> bytes:
            mesh = (new_textured.result() or new.mesh).copy()
            mesh.apply_transform(aligned.transform)
            return _glb(mesh)

        urls = {
            "heatmap": pool.submit(lambda: storage.upload_file(heatmap.result(), f"diffs/{diff_id}/heatmap.glb")),
            # The base scan's frame is the diff's frame, so its stored GLB is the base model as is.
            "base": pool.submit(lambda: publish_glb(converted_glb(None, base.metadata, base.mesh), base.metadata)),
            "new_stored": pool.submit(lambda: publish_glb(converted_glb(None, new.metadata, new.mesh), new.metadata)),
            "new": pool.submit(lambda: storage.upload_file(new_aligned_glb(), f"diffs/{diff_id}/new_model.glb")),
        }
        urls = {name: future.result() for name, future in urls.items()}

    classified = [ClassifiedRegion(geom, *label) for geom, label in zip(uploaded, labels)]
    verdict, confidence, reason = decide(classified, summary, aligned, scale_warning)
    legend = heatmap_legend(threshold_mm)
    return DiffResponse(
        is_mock=False,
        heatmap_url=urls["heatmap"],
        base_model_url=urls["base"],
        new_model_url=urls["new"],
        heatmap_legend=HeatmapLegend(**{key: value for key, value in legend.items() if key != "colors"}),
        histogram=_absolute_histogram(d_signed[new_compared] / MM),
        stats=Stats(
            changed_fraction=summary["changed_fraction"],
            max_change_mm=summary["max_change_mm"],
            noise_floor_mm=config.NOISE_FLOOR_MM,
            threshold_mm=threshold_mm,
            icp_fitness=aligned.fitness,
            icp_rmse_mm=aligned.rmse_mm,
            diff_time_s=round(time.perf_counter() - start, 2),
        ),
        regions=[_region(f"r{number}", item) for number, item in enumerate(classified, start=1)],
        uncovered_regions=uncovered,
        verdict=verdict,
        verdict_confidence=float(np.clip(confidence, 0.0, 1.0)),
        verdict_reason=reason,
        diff_id=diff_id,
        compared_fraction=round(covered.compared_fraction, 4),
        **fingerprints,
    )


def _key_photos(scan: LoadedScan) -> list[Photo]:
    """The scan's key photos, ready to project into. Raises InvalidMetadata naming a photo that cannot be used."""
    photos = []
    for meta in scan.metadata.photos:
        try:
            photos.append(load_photo(meta, scan.folder))
        except ValueError as exc:
            raise InvalidMetadata(f"key photo {meta.file} has an unusable pose: {exc}") from exc
        except OSError as exc:
            raise InvalidMetadata(f"key photo {meta.file} is missing or is not an image") from exc
    return photos


def inconclusive(
    reason: str,
    diff_id: str | None = None,
    *,
    compared_fraction: float = 0.0,
    uncovered_regions: list[UncoveredRegion] | None = None,
    base_fingerprint: str | None = None,
    new_fingerprint: str | None = None,
) -> DiffResponse:
    """A result that says the scans could not be compared, and why."""
    return DiffResponse(
        is_mock=False,
        heatmap_url=None,
        base_model_url=None,
        new_model_url=None,
        heatmap_legend=None,
        histogram=Histogram(bin_edges_mm=[], counts=[]),
        stats=None,
        regions=[],
        uncovered_regions=uncovered_regions or [],
        verdict="inconclusive",
        verdict_confidence=1.0,
        verdict_reason=reason,
        base_fingerprint=base_fingerprint,
        new_fingerprint=new_fingerprint,
        diff_id=diff_id or uuid.uuid4().hex,
        compared_fraction=round(compared_fraction, 4),
    )


def _region(region_id: str, item: ClassifiedRegion) -> Region:
    geom = item.geom
    return Region(
        id=region_id,
        label="normal_wear" if item.label == "normal_wear" else "needs_review",
        damage_type=item.label,
        kind=geom.kind,
        area_cm2=round(geom.area_cm2, 3),
        max_depth_mm=round(geom.max_depth_mm, 3),
        mean_depth_mm=round(geom.mean_depth_mm, 3),
        centroid_m=geom.extent.centroid_m.round(6).tolist(),
        radius_m=round(geom.extent.radius_m, 6),
        bbox_min_m=geom.extent.bbox_min_m.round(6).tolist(),
        bbox_max_m=geom.extent.bbox_max_m.round(6).tolist(),
        confidence=round(float(np.clip(item.confidence, 0.0, 1.0)), 3),
        reason=item.reason,
        before_crop_url=geom.before_crop_url,
        after_crop_url=geom.after_crop_url,
    )


def _uncovered(patch_id: str, patch: UncoveredPatch) -> UncoveredRegion:
    return UncoveredRegion(
        id=patch_id,
        only_in=patch.only_in,
        area_cm2=round(patch.area_cm2, 2),
        centroid_m=patch.extent.centroid_m.round(6).tolist(),
        radius_m=round(patch.extent.radius_m, 6),
    )


def _absolute_histogram(signed_mm: np.ndarray) -> Histogram:
    """Absolute change in HISTOGRAM_BIN_MM bins up to HISTOGRAM_RANGE_MM; larger changes count in the last bin."""
    edges = np.arange(0.0, config.HISTOGRAM_RANGE_MM + config.HISTOGRAM_BIN_MM / 2, config.HISTOGRAM_BIN_MM)
    counts, _ = np.histogram(np.minimum(np.abs(signed_mm), edges[-1]), bins=edges)
    return Histogram(bin_edges_mm=edges.round(6).tolist(), counts=counts.tolist())


def _sentence(text: str) -> str:
    text = text.strip().rstrip(".")
    return text[:1].upper() + text[1:] + "."


def _glb(mesh: trimesh.Trimesh) -> bytes:
    return mesh.export(file_type="glb", include_normals=True)
