"""
Retro-test for Paskamer Praat PWA extensions v1 (Live-hub + Reviews-relocate)
Tests:
  1. Backend health (/api/)
  2. Download endpoints (zip + worker.js)
  3. Extension static asset availability (via PWA static route)
  4. index.html includes cache-busted extension script tags
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://paskamer-stability.preview.emergentagent.com",
).rstrip("/")


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"User-Agent": "pytest-retro-test/1.0"})
    return s


# ---------- Backend health ----------
class TestBackendHealth:
    def test_api_root_ok(self, session):
        r = session.get(f"{BASE_URL}/api/", timeout=20)
        assert r.status_code == 200, f"/api/ returned {r.status_code}"


# ---------- Download endpoint ----------
class TestDownloads:
    def test_download_pwa_zip(self, session):
        r = session.get(
            f"{BASE_URL}/api/downloads/01-paskamerpraat-pwa-cloudflare.zip",
            timeout=60,
        )
        assert r.status_code == 200
        assert "application/zip" in r.headers.get("content-type", "")
        assert len(r.content) > 10_000  # > 10KB sanity

    def test_download_worker_js(self, session):
        r = session.get(
            f"{BASE_URL}/api/downloads/pp-combined-worker-v1.0.js",
            timeout=30,
        )
        assert r.status_code == 200
        assert "application/javascript" in r.headers.get("content-type", "")
        assert len(r.content) > 1_000

    def test_download_unknown_file_404(self, session):
        r = session.get(
            f"{BASE_URL}/api/downloads/does-not-exist-{os.urandom(4).hex()}.zip",
            timeout=15,
        )
        assert r.status_code == 404


# ---------- Extension static assets ----------
EXT_LIVE = [
    "pp-live-tab-v1.js",
    "pp-live-start-v1.js",
    "pp-live-player-v1.js",
    "pp-live-v1.css",
]


class TestExtensionAssets:
    @pytest.mark.parametrize("fname", EXT_LIVE)
    def test_live_extension_reachable(self, session, fname):
        r = session.get(f"{BASE_URL}/extensions/live/{fname}", timeout=20)
        assert r.status_code == 200, f"{fname} returned {r.status_code}"
        assert len(r.content) > 20

    def test_reviews_relocate_reachable(self, session):
        r = session.get(
            f"{BASE_URL}/extensions/profile/pp-reviews-relocate-v1.js",
            timeout=20,
        )
        assert r.status_code == 200
        assert len(r.content) > 20


# ---------- index.html wires up all extensions ----------
class TestIndexHtmlWiring:
    @pytest.fixture(scope="class")
    def index_html(self, session):
        r = session.get(f"{BASE_URL}/", timeout=20)
        assert r.status_code == 200
        return r.text

    @pytest.mark.parametrize(
        "fragment",
        [
            "/extensions/live/pp-live-tab-v1.js",
            "/extensions/live/pp-live-start-v1.js",
            "/extensions/live/pp-live-player-v1.js",
            "/extensions/live/pp-live-v1.css",
            "/extensions/profile/pp-reviews-relocate-v1.js",
        ],
    )
    def test_extension_included(self, index_html, fragment):
        assert fragment in index_html, f"{fragment} not referenced in index.html"

    def test_cache_buster_present(self, index_html):
        # Every extension include should carry ?v= for cache busting
        pattern = re.compile(
            r"/extensions/(live|profile)/pp-[a-z0-9\-]+-v1\.(js|css)\?v=[^\"'\s>]+"
        )
        assert pattern.search(index_html), "No cache-busted extension URL found"
