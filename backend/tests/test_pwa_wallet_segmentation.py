"""
Backend + static-audit tests for PWA wallet segmentation.

Originally added for v60.1.154 (amount-whitelist hardening). Updated for
v60.1.155 (intercept removal) and then v60.1.156 (COMING-SOON INTERCEPT
RESTORED with context-aware eyebrow). The user clarified the popup
itself was wanted; the actual bug was the *shared* popup looking like
the wrong context. v60.1.156 restores the intercept in both wallets
but now passes an explicit source ('b2b' / 'b2c') so the popup renders
a context-aware eyebrow ("Merken Campagne Wallet" vs "Mijn Wallet").

The PWA itself is a Vanilla JS app deployed to Cloudflare Pages from /app/pwa/.
The Emergent preview URL only exposes the FastAPI /api/* routes (it does NOT
serve the PWA), so these tests:
  1. Static-audit the PWA source in /app/pwa/ for B2B/B2C segregation.
  2. Static-audit the Cloudflare zip bundle to ensure it contains v60.1.155.
  3. Backend curl checks for /api/downloads/{filename}.
"""
import os
import re
import zipfile
from pathlib import Path

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend/.env
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').strip("'").rstrip("/")

PWA = Path("/app/pwa")
B2B_FILE = PWA / "extensions/payments/pp-wallet-v1.js"
B2C_FILE = PWA / "extensions/payments/pp-b2c-wallet-v1.js"
ISO_FILE = PWA / "extensions/payments/pp-brand-wallet-isolation-v1.js"
ROUTE_SAFETY = PWA / "extensions/profile/pp-route-safety-v1.js"
ONBOARDING = PWA / "extensions/profile/pp-brand-onboarding-checklist-v1.js"
SW_FILE = PWA / "sw.js"
INDEX_HTML = PWA / "index.html"
ZIP_FILE = Path("/app/01-paskamerpraat-pwa-cloudflare.zip")


# ───────────────── Static audit: B2B wallet ─────────────────
class TestB2BWallet:
    def test_b2b_allowed_amounts_constant(self):
        src = B2B_FILE.read_text()
        m = re.search(r"B2B_ALLOWED_AMOUNTS\s*=\s*\{([^}]+)\}", src)
        assert m, "B2B_ALLOWED_AMOUNTS constant missing in pp-wallet-v1.js"
        body = m.group(1)
        for amt in ("25", "50", "100", "250"):
            assert amt in body, f"B2B_ALLOWED_AMOUNTS missing {amt}"
        # Pure-B2C amounts must not appear as their own keys (use word boundary on left)
        for forbidden in ("5", "10", "15"):
            assert not re.search(rf"(?<!\d){forbidden}\s*:", body), \
                f"B2B_ALLOWED_AMOUNTS leaks B2C amount {forbidden}"

    def test_b2b_render_uses_allowed_filter(self):
        src = B2B_FILE.read_text()
        assert re.search(
            r"availableAmounts\s*=\s*Object\.keys\(shopCfg\.variants\)\.filter[^}]*B2B_ALLOWED_AMOUNTS",
            src,
        ), "Render helper must filter availableAmounts by B2B_ALLOWED_AMOUNTS"

    def test_b2b_topup_guard(self):
        src = B2B_FILE.read_text()
        assert "if (!B2B_ALLOWED_AMOUNTS[Number(amount)])" in src, "topup() must guard with B2B_ALLOWED_AMOUNTS"
        assert "console.warn" in src and "B2B blocked invalid amount" in src

    def test_b2b_route_wrapping_only_for_wallet(self):
        src = B2B_FILE.read_text()
        assert "if (pagina === 'wallet')" in src
        assert "if (pagina === 'b2c_wallet')" not in src, "B2B wallet must NOT wrap b2c_wallet route"

    def test_b2b_storage_field_only_wallet_balance(self):
        src = B2B_FILE.read_text()
        assert "userData.wallet_balance" in src
        # B2B must never read b2c_wallet_balance
        assert "b2c_wallet_balance" not in src, "B2B wallet leaks b2c_wallet_balance reference"

    def test_b2b_header_eyebrow(self):
        src = B2B_FILE.read_text()
        assert '<span class="bp-header-eyebrow">Merken wallet</span>' in src

    def test_b2b_section_title(self):
        src = B2B_FILE.read_text()
        assert "Kies een campagne-pakket" in src
        assert "Kies een boost-pakket" not in src, "B2B file must not contain boost-pakket title"

    def test_b2b_shopify_variant_ids(self):
        src = B2B_FILE.read_text()
        assert "'25':  '57524873855320'" in src or "'25': '57524873855320'" in src
        assert "'50':  '57524878410072'" in src or "'50': '57524878410072'" in src


# ───────────────── Static audit: B2C wallet ─────────────────
class TestB2CWallet:
    def test_b2c_allowed_amounts_constant(self):
        src = B2C_FILE.read_text()
        m = re.search(r"B2C_ALLOWED_AMOUNTS\s*=\s*\{([^}]+)\}", src)
        assert m, "B2C_ALLOWED_AMOUNTS constant missing in pp-b2c-wallet-v1.js"
        body = m.group(1)
        for amt in ("5", "10", "15", "25", "50"):
            assert f"{amt}:" in body, f"B2C_ALLOWED_AMOUNTS missing {amt}"
        for forbidden in ("100:", "250:"):
            assert forbidden not in body, f"B2C_ALLOWED_AMOUNTS leaks B2B amount {forbidden}"

    def test_b2c_render_uses_allowed_filter(self):
        src = B2C_FILE.read_text()
        assert re.search(
            r"availableAmounts\s*=\s*Object\.keys\(b2cCfg\.variants\)\.filter[^}]*B2C_ALLOWED_AMOUNTS",
            src,
        ), "Render helper must filter by B2C_ALLOWED_AMOUNTS"

    def test_b2c_topup_guard(self):
        src = B2C_FILE.read_text()
        assert "if (!B2C_ALLOWED_AMOUNTS[Number(amount)])" in src

    def test_b2c_route_wrapping_only_for_b2c_wallet(self):
        src = B2C_FILE.read_text()
        assert "if (pagina === 'b2c_wallet')" in src
        assert "if (pagina === 'wallet')" not in src, "B2C wallet must NOT wrap B2B 'wallet' route"

    def test_b2c_storage_field_only_b2c_wallet_balance(self):
        src = B2C_FILE.read_text()
        assert "userData.b2c_wallet_balance" in src
        # No reads of plain wallet_balance for value (only as documentation comments allowed)
        # Strict: no occurrences in code other than the doc block at top.
        non_comment_lines = [
            ln for ln in src.splitlines()
            if "wallet_balance" in ln
            and "b2c_wallet_balance" not in ln
            and not ln.strip().startswith("*")
            and not ln.strip().startswith("//")
        ]
        assert not non_comment_lines, f"B2C leaks B2B wallet_balance code: {non_comment_lines}"

    def test_b2c_header_eyebrow(self):
        src = B2C_FILE.read_text()
        assert '<span class="bp-header-eyebrow">Mijn Wallet</span>' in src

    def test_b2c_section_title(self):
        src = B2C_FILE.read_text()
        assert "Kies een boost-pakket" in src
        assert "Kies een campagne-pakket" not in src

    def test_b2c_shopify_variant_ids(self):
        src = B2C_FILE.read_text()
        assert "'25': '57532676768088'" in src
        assert "'50': '57532683321688'" in src


# ───────────────── Static audit: Isolation wrapper ─────────────────
class TestIsolation:
    def test_file_exists(self):
        assert ISO_FILE.exists()

    def test_exports_and_constants(self):
        src = ISO_FILE.read_text()
        assert "window.PP_BrandWalletIsolation" in src
        assert "var B2B_ALLOWED = { 25: 1, 50: 1, 100: 1, 250: 1 }" in src
        assert "var B2C_ALLOWED = { 5: 1, 10: 1, 15: 1, 25: 1, 50: 1 }" in src

    def test_wraps_three_targets(self):
        src = ISO_FILE.read_text()
        assert "PP_Wallet.topup =" in src, "must wrap PP_Wallet.topup"
        assert "PP_B2CWallet.topup =" in src, "must wrap PP_B2CWallet.topup"
        assert "PP_TopupComingSoon.show =" in src, "must wrap PP_TopupComingSoon.show"


# ───────────────── Static audit: Route safety whitelist ─────────────────
class TestRouteSafety:
    REQUIRED_ROUTES = (
        "brand_producten", "brand_profiel", "brand_analytics",
        "brand_product_nieuw", "brand_register", "brand_login",
        "brand_campagnes", "brand_campagne_nieuw", "brand_pending",
        "brand_dashboard", "wallet", "b2c_wallet",
    )

    def test_known_routes_whitelist(self):
        src = ROUTE_SAFETY.read_text()
        m = re.search(r"var\s+KNOWN_ROUTES\s*=\s*\{(.+?)\};", src, re.DOTALL)
        assert m, "KNOWN_ROUTES object not found"
        block = m.group(1)
        for r in self.REQUIRED_ROUTES:
            assert re.search(rf"\b{r}\s*:\s*1\b", block), f"KNOWN_ROUTES missing route: {r}"


# ───────────────── Static audit: Onboarding checklist ─────────────────
class TestOnboarding:
    def test_wallet_step_routes_to_b2b_wallet(self):
        src = ONBOARDING.read_text()
        # find the line containing the wallet step
        wallet_step_match = re.search(
            r"\{\s*key:\s*'wallet'[^}]+\}",
            src,
        )
        assert wallet_step_match, "wallet step not found"
        step = wallet_step_match.group(0)
        assert "navigeer('wallet')" in step, "wallet step must navigate to B2B 'wallet'"
        assert "navigeer('b2c_wallet')" not in step, "wallet step must NOT navigate to b2c_wallet"
        assert "€25 / €50 / €100 / €250" in step


# ───────────────── Static audit: cache version bumps ─────────────────
class TestCacheVersion:
    def test_index_html_bumped(self):
        src = INDEX_HTML.read_text()
        # v60.1.156: both wallets + comingsoon module bumped to the same key
        assert "pp-wallet-v1.js?v=60.1.156-restore-coming-soon-popup" in src
        assert "pp-b2c-wallet-v1.js?v=60.1.156-restore-coming-soon-popup" in src
        assert "pp-topup-comingsoon-v1.js?v=60.1.156-restore-coming-soon-popup" in src

    def test_sw_version(self):
        src = SW_FILE.read_text()
        assert "VERSION       = 'v60.1.156-20260623-restore-coming-soon-popup'" in src or \
               "VERSION = 'v60.1.156-20260623-restore-coming-soon-popup'" in src


# ───────────────── Static audit: deploy zip ─────────────────
class TestDeployZip:
    def test_zip_exists_and_size(self):
        assert ZIP_FILE.exists()
        assert ZIP_FILE.stat().st_size > 3 * 1024 * 1024, "zip should be > 3MB"

    def test_zip_contains_v60_1_156_sw(self):
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("sw.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert "v60.1.156-20260623-restore-coming-soon-popup" in content

    def test_zip_contains_b2b_allowed_amounts(self):
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("extensions/payments/pp-wallet-v1.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert "B2B_ALLOWED_AMOUNTS" in content
        assert "{ 25: 1, 50: 1, 100: 1, 250: 1 }" in content

    def test_zip_contains_b2c_allowed_amounts(self):
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("extensions/payments/pp-b2c-wallet-v1.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert "B2C_ALLOWED_AMOUNTS" in content
        assert "{ 5: 1, 10: 1, 15: 1, 25: 1, 50: 1 }" in content


# ───────────────── Backend curl ─────────────────
@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    return s


class TestDownloadEndpoint:
    def test_download_zip_ok(self, api_client):
        assert BASE_URL, "REACT_APP_BACKEND_URL not configured"
        r = api_client.get(f"{BASE_URL}/api/downloads/01-paskamerpraat-pwa-cloudflare.zip")
        assert r.status_code == 200
        assert r.headers.get("content-type", "").lower().startswith("application/zip")
        assert len(r.content) > 3 * 1024 * 1024

    @pytest.mark.parametrize("bad", ["..hidden.zip", "....zip", "test.exe", "no_extension"])
    def test_invalid_filename_returns_400(self, api_client, bad):
        r = api_client.get(f"{BASE_URL}/api/downloads/{bad}")
        assert r.status_code == 400, f"expected 400 for {bad!r}, got {r.status_code}"

    @pytest.mark.parametrize("bad", ["../etc/passwd", "./../server.py", "foo/bar.zip"])
    def test_path_traversal_blocked(self, api_client, bad):
        """Path-with-slash traversal is rejected by router (404) instead of
        reaching the 400 guard. Still blocked - that's what matters."""
        r = api_client.get(f"{BASE_URL}/api/downloads/{bad}")
        assert r.status_code in (400, 404), f"expected 400/404 for {bad!r}, got {r.status_code}"
        assert r.status_code != 200



# ───────────── v60.1.156: COMING-SOON INTERCEPT RESTORED ─────────────
class TestComingSoonInterceptRestored:
    """v60.1.155 removed the intercept entirely, but the user clarified
    that the popup IS wanted (just with context-aware labelling). v60.1.156
    restores the intercept in both wallets and passes an explicit source
    ('b2b' / 'b2c') so the shared popup renders a context-aware eyebrow.
    These tests assert the INVERSE of the v60.1.155 expectations."""

    def test_b2b_topup_calls_coming_soon_with_b2b_source(self):
        src = B2B_FILE.read_text()
        assert "PP_TopupComingSoon.show" in src, (
            "pp-wallet-v1.js MUST call PP_TopupComingSoon.show (v60.1.156)"
        )
        assert re.search(r"source:\s*'b2b'", src), (
            "B2B intercept must pass source: 'b2b'"
        )
        # The defense-in-depth amount-guard must run BEFORE the popup call
        intercept_block = src.split("PP_TopupComingSoon.show(")[0]
        assert "if (!B2B_ALLOWED_AMOUNTS[Number(amount)])" in intercept_block, (
            "B2B amount-whitelist must be applied BEFORE the popup call"
        )

    def test_b2c_topup_calls_coming_soon_with_b2c_source(self):
        src = B2C_FILE.read_text()
        assert "PP_TopupComingSoon.show" in src, (
            "pp-b2c-wallet-v1.js MUST call PP_TopupComingSoon.show (v60.1.156)"
        )
        assert re.search(r"source:\s*'b2c'", src), (
            "B2C intercept must pass source: 'b2c'"
        )
        intercept_block = src.split("PP_TopupComingSoon.show(")[0]
        assert "if (!B2C_ALLOWED_AMOUNTS[Number(amount)])" in intercept_block, (
            "B2C amount-whitelist must be applied BEFORE the popup call"
        )

    def test_b2b_version_bumped_to_1_5_0(self):
        src = B2B_FILE.read_text()
        assert re.search(r"VERSION\s*:\s*'1\.5\.0'", src), "B2B wallet VERSION must be 1.5.0"

    def test_b2c_version_bumped_to_1_3_0(self):
        src = B2C_FILE.read_text()
        assert re.search(r"VERSION\s*:\s*'1\.3\.0'", src), "B2C wallet VERSION must be 1.3.0"

    def test_comingsoon_module_version_1_1_0(self):
        src = (PWA / "extensions/payments/pp-topup-comingsoon-v1.js").read_text()
        assert re.search(r"VERSION\s*:\s*'1\.1\.0'", src), "ComingSoon module VERSION must be 1.1.0"

    def test_comingsoon_eyebrow_b2b_present(self):
        src = (PWA / "extensions/payments/pp-topup-comingsoon-v1.js").read_text()
        assert "Merken Campagne Wallet" in src
        assert "pp-topup-cs-eyebrow-b2b" in src
        assert "topup-cs-eyebrow-" in src  # data-testid prefix

    def test_comingsoon_eyebrow_b2c_present(self):
        src = (PWA / "extensions/payments/pp-topup-comingsoon-v1.js").read_text()
        assert "Mijn Wallet" in src
        assert "pp-topup-cs-eyebrow-b2c" in src

    def test_comingsoon_message_text_updated(self):
        src = (PWA / "extensions/payments/pp-topup-comingsoon-v1.js").read_text()
        # New phrasing must be present
        assert re.search(r"pas mogelijk na.*lancering", src), (
            "Popup must say 'Opwaarderen is pas mogelijk na de officiële lancering'"
        )
        # Old phrasing must be gone
        assert "op dit moment nog niet actief" not in src, (
            "Old 'op dit moment nog niet actief' string must be removed"
        )

    def test_b2b_shopify_fallback_still_present(self):
        """The Shopify checkout code MUST still exist below the intercept
        so removing the intercept at launch is enough to enable real topup."""
        src = B2B_FILE.read_text()
        assert "attributes%5Bwallet_topup_uid%5D=" in src
        assert "/cart/' + encodeURIComponent(variantId)" in src

    def test_b2c_shopify_fallback_still_present(self):
        src = B2C_FILE.read_text()
        assert "attributes%5Bb2c_wallet_topup_uid%5D=" in src
        assert "/cart/' + encodeURIComponent(variantId)" in src

    def test_only_three_allowed_callers_of_coming_soon_show(self):
        """Acceptable callers of PP_TopupComingSoon.show: the module
        itself + 2 wrappers + both wallets (B2B/B2C intercept). Any
        other file referencing it is a regression."""
        allowed = {
            PWA / "extensions/payments/pp-topup-comingsoon-v1.js",
            PWA / "extensions/payments/pp-topup-modal-router-v1.js",
            PWA / "extensions/payments/pp-brand-wallet-isolation-v1.js",
            PWA / "extensions/payments/pp-wallet-v1.js",
            PWA / "extensions/payments/pp-b2c-wallet-v1.js",
        }
        offenders = []
        for path in PWA.rglob("*.js"):
            if path in allowed:
                continue
            try:
                if "PP_TopupComingSoon.show" in path.read_text(encoding="utf-8", errors="ignore"):
                    offenders.append(str(path.relative_to(PWA)))
            except Exception:
                pass
        assert not offenders, f"Unexpected PP_TopupComingSoon.show callers: {offenders}"

    def test_zip_b2b_wallet_has_intercept(self):
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("extensions/payments/pp-wallet-v1.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert "PP_TopupComingSoon.show" in content
        assert re.search(r"source:\s*'b2b'", content)
        assert re.search(r"VERSION\s*:\s*'1\.5\.0'", content)

    def test_zip_b2c_wallet_has_intercept(self):
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("extensions/payments/pp-b2c-wallet-v1.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert "PP_TopupComingSoon.show" in content
        assert re.search(r"source:\s*'b2c'", content)
        assert re.search(r"VERSION\s*:\s*'1\.3\.0'", content)

    def test_zip_comingsoon_module_has_eyebrow(self):
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("extensions/payments/pp-topup-comingsoon-v1.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert re.search(r"VERSION\s*:\s*'1\.1\.0'", content)
        assert "pp-topup-cs-eyebrow-b2b" in content
        assert "pp-topup-cs-eyebrow-b2c" in content
        assert "Merken Campagne Wallet" in content
        assert "Mijn Wallet" in content

