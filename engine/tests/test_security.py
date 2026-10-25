"""Hostile input: crafted metadata.json, odd scan ids and API abuse."""

import hashlib
import json
import threading

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import main
from app.main import app
from app.schemas import DiffRequest, ScanMetadata
from scandiff import storage
from scandiff.errors import InvalidMetadata

client = TestClient(app)

MODEL = b"not really a usdz"
IDENTITY = [1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0]
INTRINSICS = [100.0, 0, 0, 0, 100.0, 0, 50.0, 40.0, 1.0]


def _metadata(**changes) -> dict:
    metadata = {
        "created_at": "2026-10-24T00:00:00Z",
        "created_by": "user",
        "device": "iPhone18,2",
        "item_id": "mug-002",
        "kind": "check",
        "model_file": "model.usdz",
        "model_sha256": hashlib.sha256(MODEL).hexdigest(),
        "scan_id": "SCAN-1",
        "photos": [{"file": "photo_01.jpg", "camera_transform": IDENTITY, "intrinsics": INTRINSICS}],
    }
    metadata.update(changes)
    return metadata


class _Bucket:
    def __init__(self, files):
        self.files = files
        self.downloads = []

    def download(self, remote):
        self.downloads.append(remote)
        return self.files.get(remote, b"attacker bytes")


@pytest.fixture
def bucket(tmp_path, monkeypatch):
    """A fake scans bucket holding one scan, mug-002/SCAN-1, whose metadata.json the test writes."""
    data_dir = tmp_path / "srv" / "data" / "scans"
    monkeypatch.setattr(storage, "DATA_DIR", data_dir)
    monkeypatch.setattr(storage, "load_settings", lambda: storage.Settings("https://x.supabase.co", "k", "scans", None))
    monkeypatch.setattr(storage, "resolve_folder", lambda client, settings, scan: ("mug-002", "SCAN-1"))
    fake = _Bucket({"mug-002/SCAN-1/model.usdz": MODEL})

    class Client:
        class storage:
            @staticmethod
            def from_(name):
                return fake

    monkeypatch.setattr(storage, "connect", lambda settings: Client())

    def write(metadata):
        fake.files["mug-002/SCAN-1/metadata.json"] = json.dumps(metadata).encode()
        return fake

    return write


def _escaped(root):
    """Files the engine wrote outside its scan folder, under the fake server root."""
    scan_dir = root / "srv" / "data" / "scans" / "mug-002" / "SCAN-1"
    return [path for path in root.rglob("*") if path.is_file() and scan_dir not in path.parents]


TRAVERSALS = ["../../../../escaped.jpg", "../escaped.jpg", "/etc/escaped.jpg", "sub/../../escaped.jpg", "..", "a\\..\\b"]


@pytest.mark.parametrize("name", TRAVERSALS)
def test_photo_names_cannot_leave_the_scan_folder(bucket, tmp_path, name):
    photo = {"file": name, "camera_transform": IDENTITY, "intrinsics": INTRINSICS}
    bucket(_metadata(photos=[photo]))

    with pytest.raises(InvalidMetadata):
        storage.fetch_scan("SCAN-1")
    assert _escaped(tmp_path) == []


@pytest.mark.parametrize("name", TRAVERSALS)
def test_model_file_cannot_leave_the_scan_folder(bucket, tmp_path, name):
    bucket(_metadata(model_file=name))

    with pytest.raises(InvalidMetadata):
        storage.fetch_model("SCAN-1")
    assert _escaped(tmp_path) == []


@pytest.mark.parametrize(
    "field, value",
    [
        ("obj_file", "../../../../model.obj"),
        ("material_file", "../model.mtl"),
        ("item_id", "../../../.."),
        ("scan_id", "../SCAN-2"),
        ("textures", ["../../../../texture_0.png"]),
        ("files", [{"name": "../../../../model.obj", "sha256": ""}]),
    ],
)
def test_metadata_rejects_paths_in_names(field, value):
    with pytest.raises(ValidationError, match="plain name"):
        ScanMetadata.model_validate(_metadata(**{field: value}))


def test_real_names_still_parse():
    metadata = ScanMetadata.model_validate(
        _metadata(
            obj_file="model.obj",
            material_file="model.mtl",
            textures=["texture_0.png", {"file": "texture_1.png", "sha256": "ab" * 32}],
            files=[{"name": "model.obj", "sha256": ""}],
            item_id="coffe-maker-2",
            scan_id="371735CF-77D6-4C1F-960D-725012A74B2B",
        )
    )

    assert metadata.textures[1].file == "texture_1.png"


@pytest.mark.parametrize("path", ["../x.glb", "/abs/x.glb", "a/../../x.glb", ""])
def test_result_uploads_stay_inside_the_bucket(path):
    with pytest.raises(ValueError):
        storage.upload_file(b"x", path)


def test_diff_request_requires_both_ids():
    with pytest.raises(ValidationError):
        DiffRequest.model_validate({"base_id": "a"})
    assert client.post("/diff?mock=true", json={"base_id": 1}).status_code == 422
    assert client.post("/diff?mock=true", content=b"not json", headers={"Content-Type": "application/json"}).status_code == 422


def test_scan_ids_with_slashes_are_not_found_not_crashes(monkeypatch):
    seen = []

    def fake_glb(scan_id):
        seen.append(scan_id)
        raise storage.ScanNotFound(f"No scan folder named {scan_id}.")

    monkeypatch.setattr(main, "scan_model_glb", fake_glb)

    response = client.get("/scans/..%2F..%2Fetc/model.glb")

    assert response.status_code == 404


def test_sessions_hold_up_under_concurrent_health_and_diff_calls(monkeypatch):
    from app.pipeline import inconclusive

    monkeypatch.setattr("app.main.run_diff", lambda base_id, new_id: inconclusive("Test.", "d"))
    statuses, errors = [], []

    def worker():
        try:
            session = client.get("/health").json()["session_id"]
            statuses.append(
                client.post("/diff", json={"base_id": "a", "new_id": "b"}, headers={"X-Session-ID": session}).status_code
            )
        except Exception as exc:  # noqa: BLE001 - collected and asserted below
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(32)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []
    assert statuses == [200] * 32


def test_expired_sessions_are_refused(monkeypatch):
    from app.pipeline import inconclusive

    monkeypatch.setattr("app.main.run_diff", lambda base_id, new_id: inconclusive("Test.", "d"))
    session = client.get("/health").json()["session_id"]
    monkeypatch.setitem(main._sessions, session, 0.0)

    response = client.post("/diff", json={"base_id": "a", "new_id": "b"}, headers={"X-Session-ID": session})

    assert response.status_code == 401


def test_a_lone_surrogate_in_a_name_is_still_a_json_answer(monkeypatch):
    # json.loads turns "\ud800" in metadata.json into a lone surrogate, which UTF-8 cannot encode.
    from app.pipeline import inconclusive

    metadata = ScanMetadata.model_validate(json.loads(json.dumps(_metadata(item_id="mug-\ud800"))))
    monkeypatch.setattr(
        "app.main.run_diff",
        lambda base_id, new_id: inconclusive(f"The scans are of different items ({metadata.item_id} and mug-002)."),
    )
    session = client.get("/health").json()["session_id"]

    response = TestClient(app, raise_server_exceptions=False).post(
        "/diff", json={"base_id": "a", "new_id": "b"}, headers={"X-Session-ID": session}
    )

    assert response.status_code == 200
    assert response.json()["verdict"] == "inconclusive"
