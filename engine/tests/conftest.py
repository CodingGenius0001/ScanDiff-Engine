"""Keeps every test hermetic, whatever engine/.env holds.

storage and classify load engine/.env on demand, and on a developer machine it
holds the live Supabase and vision keys. Each test gets a missing .env, none
of those variables, and no outbound network: a test that forgets to fake a
service fails loudly instead of calling the live project or the vision model.
"""

import socket

import pytest

from scandiff import classify, storage

SERVICE_ENV = (
    "SUPABASE_URL",
    "SUPABASE_KEY",
    "SUPABASE_BUCKET",
    "SUPABASE_SCANS_TABLE",
    "SUPABASE_RESULTS_BUCKET",
    "VISION_API_KEY",
    "VISION_PROVIDER",
    "VISION_MODEL",
    "ENGINE_PUBLIC_URL",
)
LOOPBACK = {"127.0.0.1", "::1", "localhost"}


@pytest.fixture(autouse=True)
def hermetic(monkeypatch, tmp_path):
    missing = tmp_path / "missing.env"
    monkeypatch.setattr(storage, "ENV_PATH", missing)
    monkeypatch.setattr(classify, "ENV_PATH", missing)
    for name in SERVICE_ENV:
        monkeypatch.delenv(name, raising=False)

    connect = socket.socket.connect

    def loopback_only(sock, address):
        if sock.family in (socket.AF_INET, socket.AF_INET6) and address[0] not in LOOPBACK:
            raise RuntimeError(f"Tests may not reach the network ({address[0]}); fake the service instead.")
        return connect(sock, address)

    monkeypatch.setattr(socket.socket, "connect", loopback_only)
