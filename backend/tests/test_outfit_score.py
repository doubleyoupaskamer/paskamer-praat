"""Tests for /api/outfit-score Gemini Vision endpoint + fallback."""
import os
import sys
import pytest
from fastapi.testclient import TestClient

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from server import app  # noqa: E402

client = TestClient(app)


def test_outfit_score_fallback_without_image():
    """Zonder photo_b64 moet endpoint deterministic fallback geven."""
    r = client.post("/api/outfit-score", json={
        "request_id": "test-fb",
        "image_hash": "abcd",
    })
    assert r.status_code == 200
    data = r.json()
    assert "score" in data
    assert isinstance(data["score"], int)
    assert 0 <= data["score"] <= 100
    assert data["source"] == "fallback"
    assert data["request_id"] == "test-fb"
    assert data["image_hash"] == "abcd"
    assert "tips" in data
    assert "breakdown" in data


def test_outfit_score_breakdown_keys():
    r = client.post("/api/outfit-score", json={
        "request_id": "kbreak",
        "image_hash": "k",
    })
    data = r.json()
    bd = data["breakdown"]
    for k in ("kleur", "fit", "styling", "occasion"):
        assert k in bd
        assert 0 <= bd[k] <= 100
