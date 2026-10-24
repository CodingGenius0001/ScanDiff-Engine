import re

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas import DiffResponse
from scandiff.errors import AlignmentFailed, ScaleMismatch, ScanNotFound, StorageNotConfigured, UploadFailed

client = TestClient(app)
BODY = {"base_id": "scan_a", "new_id": "scan_b"}
MOCK_DIFF = "/diff?mock=true"


def test_mock_response_fills_every_field():
    response = client.post(MOCK_DIFF, json=BODY)

    assert response.status_code == 200
    result = DiffResponse.model_validate(response.json())
    assert result.verdict == "needs_review"
    assert len(result.histogram.counts) == 20
    assert len(result.histogram.bin_edges_mm) == 21
    assert sorted(r.label for r in result.regions) == ["needs_review", "normal_wear"]
    assert sorted(r.damage_type for r in result.regions) == ["dent_damage", "normal_wear"]
    assert [u.only_in for u in result.uncovered_regions] == ["base"]
    assert result.base_model_url.endswith("/sample_base.glb")
    assert result.new_model_url.endswith("/sample_new.glb")
    assert result.heatmap_legend.colormap == "diverging_blue_gray_red"
    assert result.heatmap_legend.neutral_band_mm == result.stats.threshold_mm
    for region in result.regions:
        assert "centroid_m" in region.model_dump()
        assert "centroid" not in region.model_dump()
        assert 0.005 <= region.radius_m <= 0.03
        assert max(abs(value) for value in region.centroid_m) < 0.3
    for uncovered in result.uncovered_regions:
        assert "centroid_m" in uncovered.model_dump()
        assert "centroid" not in uncovered.model_dump()
        assert uncovered.radius_m > 0
        assert max(abs(value) for value in uncovered.centroid_m) < 0.3
    for fingerprint in (result.base_fingerprint, result.new_fingerprint):
        assert re.fullmatch(r"[0-9a-f]{64}", fingerprint)


def test_mock_query_param_returns_mock_response():
    response = client.post(MOCK_DIFF, json=BODY)

    assert response.status_code == 200
    assert response.json()["diff_id"] == "mock-diff-0001"
    assert response.json()["is_mock"] is True


@pytest.mark.parametrize(
    "error, status",
    [
        (ScanNotFound("No scan folder named scan_a."), 404),
        (AlignmentFailed("alignment failed, please re-scan"), 422),
        (ScaleMismatch("different objects or units"), 422),
        (StorageNotConfigured("no Supabase"), 503),
        (UploadFailed("bucket refused"), 502),
    ],
)
def test_real_diff_turns_pipeline_errors_into_statuses(monkeypatch, error, status):
    def fail(base_id, new_id):
        raise error

    monkeypatch.setattr("app.main.run_diff", fail)
    response = client.post("/diff", json=BODY)

    assert response.status_code == status
    assert response.json()["detail"] == str(error)


def test_mock_numbers_agree():
    result = DiffResponse.model_validate(client.post(MOCK_DIFF, json=BODY).json())

    deepest = max(result.regions, key=lambda region: region.max_depth_mm)
    assert deepest.max_depth_mm == result.stats.max_change_mm
    assert f"{deepest.max_depth_mm:.1f} mm" in deepest.reason
    assert abs(result.heatmap_legend.min_mm) == result.stats.max_change_mm


def test_mock_uncovered_patch_is_on_the_side_not_the_bottom():
    result = DiffResponse.model_validate(client.post(MOCK_DIFF, json=BODY).json())

    x, y, z = result.uncovered_regions[0].centroid_m
    assert x < -0.04
    assert abs(y) < 0.005 and abs(z) < 0.005


def test_model_urls_serve_glbs():
    payload = client.post(MOCK_DIFF, json=BODY).json()

    for key in ("heatmap_url", "base_model_url", "new_model_url"):
        response = client.get(payload[key])
        assert response.status_code == 200
        assert response.content[:4] == b"glTF"


def test_cors_allows_any_origin():
    response = client.post(MOCK_DIFF, json=BODY, headers={"Origin": "http://localhost:5173"})

    assert response.headers["access-control-allow-origin"] == "*"
