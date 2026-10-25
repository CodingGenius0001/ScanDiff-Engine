"""scripts/check_contract.py: reports, never crashes, and can check a running engine."""

import importlib.util
import json
import socket
import threading
import time
from pathlib import Path

import pytest
import uvicorn

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("check_contract", ROOT / "scripts" / "check_contract.py")
check_contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check_contract)

DEPLOYED = sorted((ROOT / "ios" / "ScanDiff" / "ScanDiffTests" / "Fixtures").glob("engine_*.json"))


def test_the_canonical_sample_passes():
    assert check_contract.check(json.loads((ROOT / "contract" / "diff_response.json").read_text())) == []


@pytest.mark.parametrize("fixture", DEPLOYED, ids=lambda path: path.name)
def test_off_contract_responses_fail_with_reasons_not_a_crash(fixture):
    problems = check_contract.check(json.loads(fixture.read_text()))

    assert any("histogram" in problem for problem in problems)
    assert any("verdict_confidence" in problem for problem in problems)


@pytest.mark.parametrize("body", [{}, {"histogram": None, "regions": [1, "x"]}, {"histogram": [1, 2], "regions": None}])
def test_garbage_is_reported(body):
    assert check_contract.check(body)


@pytest.fixture
def engine_url():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config("app.main:app", host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.05)
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True
    thread.join(5)


def test_checks_a_running_engine_with_a_session(engine_url, monkeypatch):
    from app.pipeline import inconclusive

    monkeypatch.setattr("app.main.run_diff", lambda base_id, new_id: inconclusive("Test.", "d1"))

    assert check_contract.check(check_contract.fetch(engine_url, "a", "b", mock=True)) == []
    real = check_contract.fetch(engine_url, "a", "b", mock=False)
    assert real["verdict"] == "inconclusive" and check_contract.check(real) == []
