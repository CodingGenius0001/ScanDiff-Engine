"""The suite-wide guard in conftest.py: no live services, whatever engine/.env holds."""

import socket

import pytest

from scandiff import classify, storage
from scandiff.errors import StorageNotConfigured


def test_supabase_is_not_configured():
    with pytest.raises(StorageNotConfigured):
        storage.load_settings()


def test_vision_is_off():
    assert classify.vision_provider() is None


def test_results_are_saved_locally_not_uploaded(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "STATIC_DIR", tmp_path)

    url = storage.upload_file(b"x", "diffs/d/heatmap.glb")

    assert url == "http://localhost:8000/static/diffs/d/heatmap.glb"
    assert (tmp_path / "diffs/d/heatmap.glb").read_bytes() == b"x"


def test_outbound_network_is_blocked():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        with pytest.raises(RuntimeError, match="may not reach the network"):
            sock.connect(("192.0.2.1", 443))
