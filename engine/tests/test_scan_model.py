"""GET /scans/{scan_id}/model.glb and the Supabase folder lookup behind it."""

import base64
import io
import json
from pathlib import Path

import numpy as np
import pytest
import trimesh
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app import scan_models
from app.main import app
from app.schemas import ScanMetadata
from scandiff import storage
from scandiff.errors import (
    ChecksumMismatch,
    InvalidMetadata,
    ScanNotFound,
    StorageNotConfigured,
    UploadFailed,
)
from scandiff.io import load_mesh

client = TestClient(app)
SCAN_ID = "4d4b567f-8b1a-4146-8f55-ef59ef8a3a07"


def _write_usdz(path: Path, mesh: trimesh.Trimesh, up_axis: str = "Y") -> Path:
    from pxr import Usd, UsdGeom, UsdUtils

    usda = path.with_suffix(".usda")
    stage = Usd.Stage.CreateNew(str(usda))
    UsdGeom.SetStageMetersPerUnit(stage, 1.0)
    UsdGeom.SetStageUpAxis(stage, up_axis)
    UsdGeom.Xform.Define(stage, "/World")
    usd_mesh = UsdGeom.Mesh.Define(stage, "/World/Mesh")
    usd_mesh.CreatePointsAttr([tuple(map(float, vertex)) for vertex in mesh.vertices])
    usd_mesh.CreateFaceVertexCountsAttr([3] * len(mesh.faces))
    usd_mesh.CreateFaceVertexIndicesAttr(mesh.faces.ravel().tolist())
    stage.SetDefaultPrim(stage.GetPrimAtPath("/World"))
    stage.GetRootLayer().Save()
    UsdUtils.CreateNewUsdzPackage(str(usda), str(path))
    return path


def _metadata(model: Path) -> ScanMetadata:
    return ScanMetadata(
        created_at="2026-10-24T18:47:34Z",
        created_by="iPhone",
        device="iPhone18,2, iOS 27.0",
        item_id="coffee-maker-1",
        kind="baseline",
        model_file=model.name,
        model_sha256=storage.file_sha256(model),
        scan_id=SCAN_ID.upper(),
        photos=[],
    )


@pytest.fixture
def stored_scan(tmp_path, monkeypatch):
    """Serve a Z-up USDZ box, 10 cm wide, 6 cm deep and 20 cm tall, as the stored scan."""
    box = trimesh.creation.box(extents=[0.10, 0.06, 0.20]).subdivide().subdivide()
    model = _write_usdz(tmp_path / "model.usdz", box, up_axis="Z")
    calls = []

    def fetch_model(scan_id):
        calls.append(scan_id)
        return model, _metadata(model)

    monkeypatch.setattr(storage, "fetch_model", fetch_model)
    monkeypatch.setattr(scan_models, "GLB_CACHE_DIR", tmp_path / "glb")
    return model, calls


@pytest.fixture(autouse=True)
def uploads(monkeypatch):
    """Record uploads instead of sending them to Supabase."""
    sent = []

    def upload_file(data, path, bucket=None):
        sent.append((path, bucket, data))
        return f"https://example.supabase.co/storage/v1/object/public/{bucket}/{path}"

    monkeypatch.setattr(storage, "upload_file", upload_file)
    monkeypatch.setattr(storage, "scans_bucket", lambda: "scans")
    return sent


def _load_glb(content: bytes) -> trimesh.Trimesh:
    return trimesh.load(io.BytesIO(content), file_type="glb", force="mesh")


def test_returns_the_scan_as_a_y_up_glb_in_meters(stored_scan):
    model, calls = stored_scan

    response = client.get(f"/scans/{SCAN_ID}/model.glb", headers={"Origin": "http://localhost:3000"})

    assert response.status_code == 200
    assert response.headers["content-type"] == "model/gltf-binary"
    assert response.headers["access-control-allow-origin"] == "*"
    assert response.content[:4] == b"glTF"
    assert b'"NORMAL"' in response.content
    assert calls == [SCAN_ID]
    glb = _load_glb(response.content)
    assert np.allclose(glb.extents, [0.10, 0.20, 0.06])
    assert np.allclose(glb.bounds, load_mesh(model, require_density=False).bounds)


def test_stores_the_glb_next_to_the_scan_once(stored_scan, uploads):
    first = client.get(f"/scans/{SCAN_ID}/model.glb")
    client.get(f"/scans/{SCAN_ID}/model.glb")

    assert [(path, bucket) for path, bucket, _ in uploads] == [(f"coffee-maker-1/{SCAN_ID.upper()}/model.glb", "scans")]
    assert uploads[0][2] == first.content


def test_serves_the_glb_when_storing_it_fails(stored_scan, monkeypatch):
    def fail(data, path, bucket=None):
        raise UploadFailed("bucket refused")

    monkeypatch.setattr(storage, "upload_file", fail)
    response = client.get(f"/scans/{SCAN_ID}/model.glb")

    assert response.status_code == 200
    assert response.content[:4] == b"glTF"


def test_converts_each_model_once(stored_scan, monkeypatch):
    first = client.get(f"/scans/{SCAN_ID}/model.glb")

    def no_conversion(*args, **kwargs):
        raise AssertionError("converted again")

    monkeypatch.setattr(scan_models, "load_mesh", no_conversion)
    second = client.get(f"/scans/{SCAN_ID}/model.glb")

    assert second.status_code == 200
    assert second.content == first.content


def test_serves_scans_too_sparse_to_compare(tmp_path, monkeypatch):
    model = _write_usdz(tmp_path / "model.usdz", trimesh.creation.box(extents=[0.05, 0.05, 0.05]))
    monkeypatch.setattr(storage, "fetch_model", lambda scan_id: (model, _metadata(model)))
    monkeypatch.setattr(scan_models, "GLB_CACHE_DIR", tmp_path / "glb")

    response = client.get(f"/scans/{SCAN_ID}/model.glb")

    assert response.status_code == 200
    assert len(_load_glb(response.content).vertices) == 8


@pytest.mark.parametrize(
    ("error", "status"),
    [
        (ScanNotFound("No scan folder named x in scans."), 404),
        (InvalidMetadata("metadata.json does not match ScanMetadata"), 422),
        (ChecksumMismatch("model sha256 mismatch"), 422),
        (StorageNotConfigured("Set SUPABASE_URL in engine/.env"), 503),
    ],
)
def test_maps_errors_to_status_codes(monkeypatch, error, status):
    def fetch_model(scan_id):
        raise error

    monkeypatch.setattr(storage, "fetch_model", fetch_model)

    response = client.get(f"/scans/{SCAN_ID}/model.glb")

    assert response.status_code == status
    assert response.json()["detail"] == str(error)


class _FakeTable:
    def __init__(self, rows, fail):
        self.rows, self.fail, self.filters = rows, fail, {}

    def select(self, columns):
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def execute(self):
        if self.fail:
            raise APIError({"message": "invalid input syntax for type uuid"})
        rows = [row for row in self.rows if all(row.get(k) == v for k, v in self.filters.items())]
        return type("Result", (), {"data": rows})()


class _FakeClient:
    """Folders in a bucket, and optionally a scans table."""

    def __init__(self, folders, rows=(), table_fails=False):
        self.folders, self.rows, self.table_fails, self.listed = folders, list(rows), table_fails, []

    @property
    def storage(self):
        return self

    def from_(self, bucket):
        return self

    def list(self, prefix, options=None):
        self.listed.append(prefix)
        names = list(self.folders) if prefix == "" else self.folders.get(prefix, [])
        return [{"name": name, "id": None} for name in names]

    def table(self, name):
        return _FakeTable(self.rows, self.table_fails)


SETTINGS = storage.Settings(url="u", key="k", bucket="scans", scans_table="scans")
FOLDERS = {"_smoke": ["E4155D6C"], "coffee-maker-1": ["4D4B567F-8B1A-4146-8F55-EF59EF8A3A07"]}


def test_resolve_folder_uses_the_table_and_ignores_case():
    fake = _FakeClient(FOLDERS, rows=[{"id": SCAN_ID, "item_id": "coffee-maker-1"}])

    assert storage.resolve_folder(fake, SETTINGS, SCAN_ID) == (
        "coffee-maker-1",
        "4D4B567F-8B1A-4146-8F55-EF59EF8A3A07",
    )
    assert fake.listed == ["coffee-maker-1"]


def test_resolve_folder_searches_the_bucket_without_a_table_row():
    for fake in (_FakeClient(FOLDERS), _FakeClient(FOLDERS, table_fails=True)):
        assert storage.resolve_folder(fake, SETTINGS, SCAN_ID)[0] == "coffee-maker-1"
        assert "" in fake.listed


def test_resolve_folder_raises_for_unknown_scans():
    with pytest.raises(ScanNotFound) as error:
        storage.resolve_folder(_FakeClient(FOLDERS), SETTINGS, "not-a-scan")
    assert "publishable" not in str(error.value)


def _jwt(role: str) -> str:
    claims = base64.urlsafe_b64encode(json.dumps({"role": role}).encode()).decode().rstrip("=")
    return f"header.{claims}.signature"


def test_publishable_keys_are_recognized():
    assert storage.is_publishable_key("sb_publishable_abc")
    assert storage.is_publishable_key(_jwt("anon"))
    assert not storage.is_publishable_key("sb_secret_abc")
    assert not storage.is_publishable_key(_jwt("service_role"))
    assert not storage.is_publishable_key("k")
    assert not storage.is_publishable_key("a.!!!.c")


def test_scan_not_found_explains_a_publishable_key():
    settings = storage.Settings(url="u", key="sb_publishable_abc", bucket="scans", scans_table="scans")
    with pytest.raises(ScanNotFound, match="secret key"):
        storage.resolve_folder(_FakeClient({}), settings, SCAN_ID)
