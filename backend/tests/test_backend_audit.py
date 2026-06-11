"""
Backend smoke tests for PaskamerPraat v60.1.35 stability audit.
Tests:
- /api/ health
- /api/status GET/POST
- /api/admin/generate-image 403 paths (no secret, wrong secret)
- CORS preflight from foreign origin
- CORS credentials NOT 'true' when wildcard '*'
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://paskamer-stability.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ─── Health ───────────────────────────────────────────────────────
class TestHealth:
    def test_root_hello_world(self):
        r = requests.get(f"{API}/", timeout=15)
        assert r.status_code == 200, f"expected 200, got {r.status_code} body={r.text[:200]}"
        data = r.json()
        assert data == {"message": "Hello World"}, f"unexpected body: {data}"


# ─── Status CRUD ──────────────────────────────────────────────────
class TestStatus:
    def test_get_status_returns_list(self):
        r = requests.get(f"{API}/status", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list), f"expected list, got {type(data)}"

    def test_post_status_creates_record(self):
        payload = {"client_name": "TEST_test-audit"}
        r = requests.post(f"{API}/status", json=payload, timeout=15)
        assert r.status_code == 200, f"expected 200, got {r.status_code} body={r.text[:200]}"
        data = r.json()
        # Validate full StatusCheck object
        assert "id" in data and isinstance(data["id"], str) and len(data["id"]) > 0
        assert "client_name" in data and data["client_name"] == "TEST_test-audit"
        assert "timestamp" in data and isinstance(data["timestamp"], str)
        # Mongo _id must be excluded
        assert "_id" not in data

        # Verify persistence via GET
        listing = requests.get(f"{API}/status", timeout=15).json()
        ids = [c.get("id") for c in listing]
        assert data["id"] in ids, "created record not found in GET /status"


# ─── Admin generate-image auth ────────────────────────────────────
class TestAdminGenerateImageAuth:
    def test_no_admin_secret_returns_403(self):
        r = requests.post(
            f"{API}/admin/generate-image",
            json={"prompt": "test", "aspect": "portrait"},
            timeout=15,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code} body={r.text[:200]}"

    def test_wrong_admin_secret_returns_403(self):
        r = requests.post(
            f"{API}/admin/generate-image",
            json={"prompt": "test", "aspect": "portrait"},
            headers={"X-Admin-Secret": "totally-wrong-secret"},
            timeout=15,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code} body={r.text[:200]}"


# ─── CORS spec compliance ────────────────────────────────────────
class TestCORS:
    def test_preflight_from_foreign_origin(self):
        """OPTIONS preflight from foreign origin should return 200 with ACA-* headers."""
        r = requests.options(
            f"{API}/status",
            headers={
                "Origin": "https://example.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
            timeout=15,
        )
        assert r.status_code in (200, 204), f"preflight failed: {r.status_code} body={r.text[:200]}"
        # Allow-Origin should be present
        allow_origin = r.headers.get("access-control-allow-origin")
        assert allow_origin is not None, f"missing ACA-Origin header. headers={dict(r.headers)}"
        # Allow-Methods should mention POST (or *)
        allow_methods = r.headers.get("access-control-allow-methods", "")
        assert ("POST" in allow_methods.upper()) or ("*" in allow_methods), \
            f"unexpected ACA-Methods: {allow_methods}"

    def test_credentials_not_true_when_wildcard(self):
        """CORS spec: allow_credentials=true is incompatible with origin '*'.
        With CORS_ORIGINS='*', ACA-Credentials must NOT be 'true'."""
        r = requests.options(
            f"{API}/status",
            headers={
                "Origin": "https://example.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
            timeout=15,
        )
        creds = r.headers.get("access-control-allow-credentials", "")
        allow_origin = r.headers.get("access-control-allow-origin", "")
        # If origin is wildcard '*', credentials must NOT be 'true'
        if allow_origin == "*":
            assert creds.lower() != "true", \
                f"CORS spec violation: ACA-Credentials='true' with ACA-Origin='*'"
        # If echoing back origin, credentials MAY be true (still spec-compliant)
        # but per the v60.1.35 fix with CORS_ORIGINS='*', we expect ACA-Origin='*' and creds!=true.

    def test_actual_post_with_origin_returns_cors_headers(self):
        r = requests.post(
            f"{API}/status",
            json={"client_name": "TEST_cors-check"},
            headers={"Origin": "https://example.com"},
            timeout=15,
        )
        assert r.status_code == 200
        allow_origin = r.headers.get("access-control-allow-origin")
        assert allow_origin is not None, "missing ACA-Origin on actual POST"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
