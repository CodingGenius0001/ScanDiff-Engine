"""Heat map GLBs, their legend, and uploading results."""

import io

import httpx
import numpy as np
import pytest
import trimesh
from storage3.utils import StorageException

from scandiff import config, storage
from scandiff.errors import UploadFailed
from scandiff.heatmap import (
    ADDED_RGB,
    DENT_RGB,
    NEUTRAL_RGB,
    diverging_colors,
    heatmap_legend,
    make_heatmap,
    to_linear,
)
from scandiff.preprocess import clean, to_point_cloud

RADIUS = 0.05
DENT_CENTER = np.array([0.0, 0.0, 1.0])
THRESHOLD_MM = 1.0


def _surface_distance(points):
    unit = points / np.linalg.norm(points, axis=1, keepdims=True)
    return RADIUS * np.arccos(np.clip(unit @ DENT_CENTER, -1.0, 1.0))


def _dented_sphere():
    """5 mm flat-bottomed dent, 12 mm across the bottom, easing out by 18 mm."""
    mesh = trimesh.creation.icosphere(subdivisions=5, radius=RADIUS)
    depth = 0.005 * np.clip((0.018 - _surface_distance(mesh.vertices)) / 0.006, 0.0, 1.0)
    mesh.vertices = mesh.vertices * (1.0 - depth / RADIUS)[:, None]
    return mesh


def _load_glb(data: bytes) -> trimesh.Trimesh:
    return trimesh.load(io.BytesIO(data), file_type="glb", force="mesh")


def _display_colors(glb: trimesh.Trimesh) -> np.ndarray:
    """The GLB's COLOR_0 (linear, as glTF requires) back in sRGB, as a viewer shows it."""
    c = glb.visual.vertex_colors[:, :3].astype(float) / 255.0
    srgb = np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)
    return np.round(srgb * 255.0).astype(int)


@pytest.fixture(scope="module")
def base_cloud():
    return clean(to_point_cloud(trimesh.creation.icosphere(subdivisions=5, radius=RADIUS), 60_000))


def test_dented_sphere_shows_a_blue_spot_on_a_gray_body(base_cloud):
    move = trimesh.transformations.rotation_matrix(1.0, [0.3, 1.0, 0.2])
    move[:3, 3] = [0.2, -0.1, 0.05]
    new_mesh = _dented_sphere()
    new_mesh.apply_transform(move)

    glb = _load_glb(make_heatmap(new_mesh, np.linalg.inv(move), base_cloud, THRESHOLD_MM))

    colors = _display_colors(glb)
    s = _surface_distance(glb.vertices)
    assert np.allclose(glb.vertices[s > 0.025], glb.vertices[s > 0.025] / np.linalg.norm(glb.vertices[s > 0.025], axis=1, keepdims=True) * RADIUS, atol=1e-4)
    # The dent is 5 mm deep, past saturation (2.5 x 1 mm); linear storage costs a level or two of rounding.
    assert np.abs(colors[s < 0.010] - DENT_RGB).max() <= 3
    assert np.abs(colors[s > 0.025] - NEUTRAL_RGB).max() <= 2
    assert not np.any(np.abs(colors - ADDED_RGB).max(axis=1) <= 3)


def test_colors_blend_from_the_threshold_to_saturation():
    colors = diverging_colors(np.array([0.0, -1.0, 1.0, -3.0, 3.0, -5.0, 5.0, -9.0, 9.0]), 1.0, 5.0)[:, :3]

    assert np.all(colors[:3] == NEUTRAL_RGB)
    assert np.all(colors[[5, 7]] == DENT_RGB) and np.all(colors[[6, 8]] == ADDED_RGB)
    midway_dent = np.round((np.array(NEUTRAL_RGB) + np.array(DENT_RGB)) / 2)
    assert np.abs(colors[3] - midway_dent).max() <= 1


def test_legend_matches_the_colors():
    legend = heatmap_legend(2.0)

    assert (legend["min_mm"], legend["max_mm"]) == (-5.0, 5.0)
    assert legend["threshold_mm"] == legend["neutral_band_mm"] == 2.0
    assert legend["colormap"] == "diverging_blue_gray_red"
    assert [stop["mm"] for stop in legend["colors"]] == [-5.0, -2.0, 2.0, 5.0]
    assert [tuple(stop["rgb"]) for stop in legend["colors"]] == [DENT_RGB, NEUTRAL_RGB, NEUTRAL_RGB, ADDED_RGB]


def test_big_meshes_are_decimated(base_cloud, monkeypatch):
    monkeypatch.setattr(config, "HEATMAP_MAX_FACES", 2_000)
    new_mesh = _dented_sphere()

    glb = _load_glb(make_heatmap(new_mesh, np.eye(4), base_cloud, THRESHOLD_MM))

    assert len(new_mesh.faces) > 20_000
    assert len(glb.faces) <= 2_000
    core = _display_colors(glb)[_surface_distance(glb.vertices) < 0.008]
    assert len(core) and np.abs(core - DENT_RGB).max() <= 3


def test_colors_are_stored_linear_as_gltf_requires():
    neutral = to_linear(np.array([[*NEUTRAL_RGB, 255]], dtype=np.uint8))[0]

    # sRGB 200 is about 0.578 in linear light, so 147; written as-is it renders near-white.
    assert tuple(neutral[:3]) == (147, 147, 147) and neutral[3] == 255
    assert tuple(to_linear(np.array([[0, 0, 0, 255], [255, 255, 255, 255]], dtype=np.uint8))[:, 0]) == (0, 255)


def test_coarse_meshes_are_subdivided_without_changing_shape(base_cloud):
    coarse = trimesh.creation.icosphere(subdivisions=2, radius=RADIUS)

    glb = _load_glb(make_heatmap(coarse, np.eye(4), base_cloud, THRESHOLD_MM))

    assert len(coarse.faces) < len(glb.faces) <= config.HEATMAP_MAX_FACES
    # Midpoint subdivision keeps every original facet, so area and volume are unchanged.
    assert np.isclose(glb.area, coarse.area, rtol=1e-6)
    assert np.isclose(glb.volume, coarse.volume, rtol=1e-6)


@pytest.fixture
def no_supabase(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "ENV_PATH", tmp_path / "missing.env")
    monkeypatch.setattr(storage, "STATIC_DIR", tmp_path / "static")
    for name in ("SUPABASE_URL", "SUPABASE_KEY", "ENGINE_PUBLIC_URL"):
        monkeypatch.delenv(name, raising=False)
    return tmp_path / "static"


def test_upload_saves_locally_without_supabase(no_supabase, monkeypatch):
    url = storage.upload_file(b"glTF data", "diffs/d1/heatmap.glb")

    assert url == "http://localhost:8000/static/diffs/d1/heatmap.glb"
    assert (no_supabase / "diffs" / "d1" / "heatmap.glb").read_bytes() == b"glTF data"

    monkeypatch.setenv("ENGINE_PUBLIC_URL", "http://192.168.1.20:8000/")
    assert storage.upload_file(b"{}", "diffs/d1/legend.json") == "http://192.168.1.20:8000/static/diffs/d1/legend.json"


@pytest.mark.parametrize("path", ["../escape.glb", "/etc/heatmap.glb", "diffs/../../x.glb", ""])
def test_upload_rejects_paths_outside_the_bucket(no_supabase, path):
    with pytest.raises(ValueError):
        storage.upload_file(b"x", path)


class _FakeBucket:
    def __init__(self, fail=None):
        self.fail, self.uploads = fail, []

    def upload(self, path, data, options):
        if self.fail:
            raise self.fail
        self.uploads.append((path, data, options))

    def get_public_url(self, path):
        return f"https://example.supabase.co/storage/v1/object/public/scandiff/{path}"


def _fake_supabase(monkeypatch, tmp_path, bucket):
    monkeypatch.setattr(storage, "ENV_PATH", tmp_path / "missing.env")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "key")
    monkeypatch.delenv("SUPABASE_RESULTS_BUCKET", raising=False)
    names = []

    class Client:
        class storage:
            @staticmethod
            def from_(name):
                names.append(name)
                return bucket

    monkeypatch.setattr(storage, "create_client", lambda url, key, options=None: Client())
    return names


def test_upload_goes_to_the_public_scandiff_bucket(monkeypatch, tmp_path):
    bucket = _FakeBucket()
    names = _fake_supabase(monkeypatch, tmp_path, bucket)

    url = storage.upload_file(b"glTF data", "diffs/d1/heatmap.glb")

    assert names == ["scandiff"]
    assert bucket.uploads == [
        ("diffs/d1/heatmap.glb", b"glTF data", {"content-type": "model/gltf-binary", "upsert": "true"})
    ]
    assert url.endswith("/public/scandiff/diffs/d1/heatmap.glb")


@pytest.mark.parametrize(
    "error", [StorageException({"message": "Bucket not found"}), httpx.ReadTimeout("The read operation timed out")]
)
def test_upload_failure_names_the_bucket(monkeypatch, tmp_path, error):
    _fake_supabase(monkeypatch, tmp_path, _FakeBucket(fail=error))

    with pytest.raises(UploadFailed, match="scandiff bucket"):
        storage.upload_file(b"x", "diffs/d1/heatmap.glb")
