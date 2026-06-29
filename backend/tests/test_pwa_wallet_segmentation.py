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
        # v60.1.157: old <h2 class="bp-section-titel">Kies een campagne-pakket</h2>
        # was replaced by the new hero block "Voor merken / Campagne-pakketten".
        assert "Kies een campagne-pakket" not in src, \
            "v60.1.157: old 'Kies een campagne-pakket' title must be REMOVED"
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
        # v60.1.157: only pp-wallet-v1.js was modified for the merken-campagne
        # layout — its script tag must carry the new cache key. The other
        # payments modules (b2c wallet, comingsoon, modal-router, isolation)
        # may still carry v60.1.156-restore-coming-soon-popup because their
        # source files were not modified in v60.1.157.
        # v60.1.159: pp-wallet-v1.js script tag carries the new direct-render-bypass cache key
        assert "pp-wallet-v1.js?v=60.1.159-direct-render-bypass" in src

    def test_sw_version(self):
        src = SW_FILE.read_text()
        assert "VERSION       = 'v60.1.159-20260623-direct-render-bypass'" in src or \
               "VERSION = 'v60.1.159-20260623-direct-render-bypass'" in src


# ───────────────── Static audit: deploy zip ─────────────────
class TestDeployZip:
    def test_zip_exists_and_size(self):
        assert ZIP_FILE.exists()
        size = ZIP_FILE.stat().st_size
        assert 3 * 1024 * 1024 < size < 5 * 1024 * 1024, \
            f"zip should be between 3MB and 5MB, got {size} bytes"

    def test_zip_contains_v60_1_159_sw(self):
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("sw.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert "v60.1.159-20260623-direct-render-bypass" in content

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

    def test_b2b_version_bumped_to_1_8_0(self):
        src = B2B_FILE.read_text()
        assert re.search(r"VERSION\s*:\s*'1\.8\.0'", src), "B2B wallet VERSION must be 1.8.0 in v60.1.159"

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
        # v60.1.159: B2B wallet module bumped to 1.8.0 (direct-render-bypass)
        assert re.search(r"VERSION\s*:\s*'1\.8\.0'", content)

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


# ───────── v60.1.157: MERKEN CAMPAGNE-PAKKETTEN LAYOUT ─────────
class TestMerkenCampagneLayout:
    """v60.1.157 adds the public Campagne-pakketten hero layout INSIDE the
    B2B Merken wallet Opwaarderen tab so it matches the public landing
    pp-merken-pakketten-v1.js 1-to-1 (eyebrow 'Voor merken' + h2
    'Campagne-pakketten' + intro + 4 cards Starter/Groei/Pro/Ultimate).
    CTA text changed from 'Wallet opwaarderen' → 'Opwaarderen'."""

    def test_b2b_opwaarderen_hero_present(self):
        src = B2B_FILE.read_text()
        assert 'wallet-campagne-hero' in src, \
            "Opwaarderen tab must contain hero with data-testid 'wallet-campagne-hero'"
        assert 'pp-b2b-campagne-hero' in src, \
            "Hero must carry the pp-b2b-campagne-hero class for visual parity with public landing"

    def test_b2b_opwaarderen_hero_h2_literal(self):
        src = B2B_FILE.read_text()
        assert '<h2>Campagne-pakketten</h2>' in src, \
            "Opwaarderen hero must contain literal '<h2>Campagne-pakketten</h2>'"

    def test_b2b_opwaarderen_eyebrow_voor_merken(self):
        src = B2B_FILE.read_text()
        # The eyebrow 'Voor merken' must appear inside the new hero block
        assert '<span class="bp-header-eyebrow">Voor merken</span>' in src, \
            "Opwaarderen hero must contain eyebrow 'Voor merken'"

    def test_b2b_opwaarderen_intro_text(self):
        src = B2B_FILE.read_text()
        assert "Kies het pakket dat past bij je doelen" in src, \
            "Opwaarderen hero must contain the intro paragraph"
        assert "Saldo wordt gebruikt voor advertenties, placements en boosts" in src

    def test_b2b_pkg_grid_present(self):
        src = B2B_FILE.read_text()
        assert 'data-testid="wallet-pkg-grid"' in src
        assert 'pp-b2c-pkg-grid' in src  # reused grid class for visual consistency

    def test_b2b_cta_text_is_opwaarderen_not_wallet_opwaarderen(self):
        src = B2B_FILE.read_text()
        # The string 'Wallet opwaarderen' must be FULLY REMOVED from the file.
        assert "Wallet opwaarderen" not in src, \
            "v60.1.157: 'Wallet opwaarderen' must be removed; CTA text is now 'Opwaarderen'"
        # And the new CTA text 'Opwaarderen' is rendered next to the topup() onclick.
        assert re.search(
            r"PP_Wallet\.topup\([^)]+\)\"[^>]*data-testid=\"wallet-topup-[^\"]+\"\s*>\s*'\s*\+\s*\n?\s*'Opwaarderen'",
            src,
        ) or "'Opwaarderen'" in src, "CTA must render 'Opwaarderen' label"

    def test_old_section_title_removed(self):
        src = B2B_FILE.read_text()
        # The OLD '<h2 class="bp-section-titel">Kies een campagne-pakket</h2>'
        # must be GONE — replaced by the new hero block.
        assert 'bp-section-titel' not in src or 'Kies een campagne-pakket' not in src
        assert 'Kies een campagne-pakket' not in src, \
            "Old 'Kies een campagne-pakket' title must be removed in v60.1.157"

    def test_b2b_packages_default_match_screenshot(self):
        src = B2B_FILE.read_text()
        # Starter
        assert "id: 'starter-25'" in src
        assert "'Starter Campagne'" in src
        assert "Beperkte testronde voor één campagne of placement." in src
        # Groei (with popular:true)
        assert "id: 'groei-50'" in src
        assert "'Groei Campagne'" in src
        assert "Meer campagne-impressies en ruimte voor A/B-testing." in src
        # Pro
        assert "id: 'pro-100'" in src
        assert "'Pro Campagne'" in src
        assert "Sterke aanwezigheid en hogere kans op brand-recognition." in src
        # Ultimate
        assert "id: 'ultimate-250'" in src
        assert "'Ultimate Campagne'" in src
        assert "Maximale campagne-impact en langlopende zichtbaarheid." in src

    def test_only_groei_has_popular_true(self):
        src = B2B_FILE.read_text()
        # Exactly one occurrence of `popular: true` in PP_B2B_PACKAGES_DEFAULT
        popular_count = len(re.findall(r"popular:\s*true", src))
        assert popular_count == 1, \
            f"Exactly one B2B package must be popular:true (groei-50), found {popular_count}"

    def test_topup_data_testids_per_card(self):
        src = B2B_FILE.read_text()
        # Each card CTA must carry data-testid=wallet-topup-<amount>
        assert 'data-testid="wallet-topup-' in src
        # And call PP_Wallet.topup(<amount>)
        assert 'onclick="PP_Wallet.topup(' in src

    def test_top_level_saldo_hero_preserved(self):
        """The top-level wallet hero (eyebrow 'Merken wallet' + h1 'Saldo')
        must still be rendered BEFORE the tabs — so the page hierarchy
        is: Saldo hero → tabs → Opwaarderen tab with NEW Campagne hero."""
        src = B2B_FILE.read_text()
        assert '<span class="bp-header-eyebrow">Merken wallet</span>' in src, \
            "Top-level Saldo hero eyebrow 'Merken wallet' must remain"
        # Two hero blocks total
        assert src.count('bp-wallet-hero') >= 2, \
            "Two hero blocks expected: top-level Saldo + nested Campagne-pakketten"

    # ───── ZIP-level verification ─────
    def test_zip_b2b_wallet_contains_new_hero(self):
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("extensions/payments/pp-wallet-v1.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert "wallet-campagne-hero" in content
        assert "<h2>Campagne-pakketten</h2>" in content
        assert '<span class="bp-header-eyebrow">Voor merken</span>' in content
        assert "Wallet opwaarderen" not in content, \
            "ZIP must not contain old 'Wallet opwaarderen' string"
        assert "Kies een campagne-pakket" not in content, \
            "ZIP must not contain old 'Kies een campagne-pakket' h2"

    def test_zip_b2b_wallet_version_1_8_0(self):
        # v60.1.159 bumps the B2B wallet module to 1.8.0 (direct-render-bypass
        # via PP_Wallet.openWallet() to skip legacy navigation wrappers).
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("extensions/payments/pp-wallet-v1.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert re.search(r"VERSION\s*:\s*'1\.8\.0'", content), \
            "ZIP'd pp-wallet-v1.js must be VERSION 1.8.0"


# ───────── v60.1.157: Public landing UNCHANGED (regression) ─────────
class TestMerkenLandingUnchanged:
    """The original public Campagne-pakketten landing page
    /app/pwa/extensions/admin/pp-merken-pakketten-v1.js (for non-logged-in
    visitors) must be UNCHANGED in v60.1.157 — it is the visual reference
    for the new wallet layout, not a copy target."""

    MERKEN_LANDING = PWA / "extensions/admin/pp-merken-pakketten-v1.js"

    def test_landing_file_exists(self):
        assert self.MERKEN_LANDING.exists(), \
            "Public Campagne-pakketten landing must still exist"

    def test_landing_cta_logged_in_and_out(self):
        src = self.MERKEN_LANDING.read_text()
        assert "Naar merkenportaal" in src, \
            "Logged-in CTA 'Naar merkenportaal' must remain on public landing"
        assert "Aanmelden als merk" in src, \
            "Logged-out CTA 'Aanmelden als merk' must remain on public landing"


# ───────── v60.1.157: amount-segregation regression ─────────
class TestAmountSegregationStillIntact:
    """Defense-in-depth: v60.1.157 only touched layout in pp-wallet-v1.js;
    the amount-whitelist constants must be unchanged. B2B = {25,50,100,250}
    only; no 5/10/15 keys; B2C = {5,10,15,25,50} only; no 100/250 keys."""

    def test_b2b_no_5_10_15_keys_in_allowed_amounts(self):
        src = B2B_FILE.read_text()
        m = re.search(r"B2B_ALLOWED_AMOUNTS\s*=\s*\{([^}]+)\}", src)
        assert m, "B2B_ALLOWED_AMOUNTS missing"
        body = m.group(1)
        # Use word-boundary regex to avoid matching '5: 1' inside '25: 1'.
        for forbidden in ("5", "10", "15"):
            assert not re.search(rf"(?<!\d){forbidden}\s*:\s*1", body), \
                f"B2B_ALLOWED_AMOUNTS must not contain key '{forbidden}'"

    def test_b2b_render_filter_still_present(self):
        src = B2B_FILE.read_text()
        # _renderB2BPackagesHTML must still filter on B2B_ALLOWED_AMOUNTS
        assert re.search(
            r"_renderB2BPackagesHTML[\s\S]*?B2B_ALLOWED_AMOUNTS",
            src,
        ), "_renderB2BPackagesHTML must still filter on B2B_ALLOWED_AMOUNTS"


# ───────── v60.1.158: BRAND-DASHBOARD WALLET CARD HARDENED ─────────
class TestBrandDashWalletCardHardened:
    """v60.1.158 rewrites the brand-dashboard Wallet card injection so it is
    bulletproof against race conditions with brand-portal-v1.js's _renderLock.

    Changes:
      * <button> instead of <a href="javascript:void(0)"> for grid parity
        with the other bp-quick buttons.
      * Inline onclick attribute (visible in DOM-inspector) instead of a
        DOM-property .onclick (invisible + lost on re-render).
      * The onclick clears DY.brandPortal._renderLock before calling
        DY.navigeer('wallet') so concurrent brand-portal renders cannot
        absorb the navigation.
      * NEW document-level capture-phase click delegator
        (setupWalletClickDelegator) as defense-in-depth: catches ANY click
        on [data-testid="brand-dash-wallet"] even when the inline onclick
        was wiped by a re-render.
    """

    # Extract the injectDashboardCard function body once for laser-focused
    # assertions; using string-search on the whole file is too lenient.
    @staticmethod
    def _inject_body():
        src = B2B_FILE.read_text()
        m = re.search(
            r"function\s+injectDashboardCard\s*\(\s*\)\s*\{([\s\S]*?)\n  \}\s*\n",
            src,
        )
        assert m, "injectDashboardCard function not found in pp-wallet-v1.js"
        return m.group(1)

    # (a) <button> element
    def test_uses_button_element(self):
        body = self._inject_body()
        assert "createElement('button')" in body, (
            "injectDashboardCard must use createElement('button') in v60.1.158"
        )
        assert re.search(r"\.type\s*=\s*'button'", body), (
            "Card must set .type = 'button'"
        )

    # (b) Inline onclick attribute via setAttribute('onclick', ...)
    def test_inline_onclick_attribute(self):
        body = self._inject_body()
        assert re.search(
            r"setAttribute\(\s*['\"]onclick['\"]\s*,",
            body,
        ), "Card must set inline 'onclick' attribute via setAttribute"

    # (c) Inline onclick contains literal navigeer('wallet')
    def test_inline_onclick_contains_navigeer_wallet(self):
        body = self._inject_body()
        # the literal string within the onclick attribute value
        assert "navigeer('wallet')" in body, (
            "Inline onclick must contain literal navigeer('wallet')"
        )

    # (d) Inline onclick contains _renderLock=false cleanup
    def test_inline_onclick_clears_render_lock(self):
        body = self._inject_body()
        # tolerate optional whitespace around '='
        assert re.search(r"_renderLock\s*=\s*false", body), (
            "Inline onclick must clear brandPortal._renderLock = false"
        )

    # (e) OLD anchor patterns removed
    def test_old_anchor_pattern_gone(self):
        body = self._inject_body()
        assert "createElement('a')" not in body, (
            "OLD createElement('a') must be removed from injectDashboardCard"
        )
        assert "javascript:void(0)" not in body, (
            "OLD href='javascript:void(0)' must be removed"
        )
        assert not re.search(r"\.href\s*=", body), (
            "Card must not set .href anymore"
        )
        assert not re.search(r"\.onclick\s*=\s*function", body), (
            "Card must not use DOM-property .onclick = function() anymore"
        )

    # (f) setupWalletClickDelegator exists + called from init()
    def test_setup_wallet_click_delegator_defined_and_called(self):
        src = B2B_FILE.read_text()
        assert re.search(
            r"function\s+setupWalletClickDelegator\s*\(\s*\)\s*\{",
            src,
        ), "setupWalletClickDelegator function must be defined"
        # init() must call setupWalletClickDelegator after registerRoute()
        m = re.search(
            r"function\s+init\s*\(\s*\)\s*\{([\s\S]*?)\n  \}\s*\n",
            src,
        )
        assert m, "init() function not found"
        init_body = m.group(1)
        # ordering: registerRoute → setupWalletClickDelegator → new MutationObserver
        reg_idx = init_body.find("registerRoute()")
        del_idx = init_body.find("setupWalletClickDelegator()")
        obs_idx = init_body.find("new MutationObserver")
        assert reg_idx != -1, "init() must call registerRoute()"
        assert del_idx != -1, "init() must call setupWalletClickDelegator()"
        assert obs_idx != -1, "init() must instantiate MutationObserver"
        assert reg_idx < del_idx < obs_idx, (
            "Call order must be registerRoute → setupWalletClickDelegator → MutationObserver"
        )

    # (g) Delegator uses capture-phase = true
    def test_delegator_uses_capture_phase(self):
        src = B2B_FILE.read_text()
        # extract setupWalletClickDelegator body
        m = re.search(
            r"function\s+setupWalletClickDelegator\s*\(\s*\)\s*\{([\s\S]*?)\n  \}\s*\n",
            src,
        )
        assert m, "setupWalletClickDelegator body not found"
        deleg = m.group(1)
        # capture=true: trailing 'true' after listener fn → optional whitespace
        assert re.search(
            r"addEventListener\(\s*['\"]click['\"]\s*,[\s\S]+?,\s*true\s*\)",
            deleg,
        ), "Delegator must register click listener with capture=true"

    # (h) Delegator targets [data-testid="brand-dash-wallet"] via .closest()
    def test_delegator_targets_brand_dash_wallet(self):
        src = B2B_FILE.read_text()
        m = re.search(
            r"function\s+setupWalletClickDelegator\s*\(\s*\)\s*\{([\s\S]*?)\n  \}\s*\n",
            src,
        )
        assert m
        deleg = m.group(1)
        assert re.search(
            r"\.closest\(\s*['\"]\[data-testid=[\"']brand-dash-wallet[\"']\]['\"]",
            deleg,
        ), "Delegator must detect target via .closest('[data-testid=\"brand-dash-wallet\"]')"
        assert "DY.navigeer('wallet')" in deleg, (
            "Delegator must call DY.navigeer('wallet') for B2B route"
        )
        assert "_renderLock" in deleg, (
            "Delegator must proactively clear _renderLock"
        )

    # Idempotency guard
    def test_delegator_idempotency_guard(self):
        src = B2B_FILE.read_text()
        assert "__ppWalletDelegatorInstalled" in src, (
            "Delegator must use window.__ppWalletDelegatorInstalled idempotency guard"
        )

    # Card DOM contract: 3 inner divs (icon, title, sub)
    def test_card_inner_dom_contract(self):
        body = self._inject_body()
        assert "bp-quick-icon" in body and "💰" in body
        assert "bp-quick-titel" in body and ">Wallet<" in body
        assert "bp-quick-sub" in body and "Saldo &amp; opwaarderen" in body or \
               "Saldo & opwaarderen" in body
        assert "data-testid" in body and "brand-dash-wallet" in body
        assert "bp-quick" in body

    # ZIP regression: deploy zip carries the new hardened module
    def test_zip_contains_button_injection_and_delegator(self):
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("extensions/payments/pp-wallet-v1.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert "createElement('button')" in content, (
            "Deploy zip must contain new <button> injection"
        )
        assert "createElement('a')" not in content, (
            "Deploy zip must NOT contain old <a> injection"
        )
        assert "setupWalletClickDelegator" in content, (
            "Deploy zip must contain setupWalletClickDelegator"
        )
        assert "brand-dash-wallet" in content
        assert "navigeer('wallet')" in content

    # B2C wallet unchanged: no brand-dash-wallet injection there
    def test_b2c_wallet_does_not_inject_brand_dash_card(self):
        src = B2C_FILE.read_text()
        assert "brand-dash-wallet" not in src, (
            "B2C wallet must NOT inject the brand-dashboard Wallet card"
        )
        # And it must not register the 'wallet' route (only 'b2c_wallet')
        assert not re.search(r"pagina\s*===\s*'wallet'", src), (
            "B2C wallet must not intercept the 'wallet' route"
        )


# ───────── v60.1.159: DIRECT RENDER BYPASS via PP_Wallet.openWallet() ─────────
class TestDirectRenderBypassOpenWallet:
    """v60.1.159 introduces PP_Wallet.openWallet() that bypasses the entire
    DY.navigeer → DY.toonPagina → brand-portal._renderLock → pp-nav-fix chain
    by directly setting DY state and invoking renderWallet() locally. Both
    the inline onclick and the document-level capture-phase delegator now
    prefer openWallet over navigeer, with a graceful fallback if PP_Wallet
    is not loaded."""

    # (a) openWallet function defined
    def test_openwallet_function_exists(self):
        src = B2B_FILE.read_text()
        assert re.search(r"function\s+openWallet\s*\(\s*\)\s*\{", src), (
            "openWallet() function must be defined in v60.1.159"
        )

    # (b) openWallet exported on window.PP_Wallet
    def test_openwallet_exported_on_pp_wallet(self):
        src = B2B_FILE.read_text()
        m = re.search(r"window\.PP_Wallet\s*=\s*\{([\s\S]*?)\}\s*;", src)
        assert m, "window.PP_Wallet export block missing"
        export_body = m.group(1)
        for fn in ("renderWallet", "openWallet", "topup", "openTopup", "refresh", "switchTab"):
            assert fn in export_body, f"PP_Wallet must export {fn}"

    # (c) openWallet body: sets pagina='wallet', clears _laatstGerenderd + _renderLock,
    # pushState, calls renderWallet() DIRECTLY
    def test_openwallet_body_direct_render(self):
        src = B2B_FILE.read_text()
        m = re.search(
            r"function\s+openWallet\s*\(\s*\)\s*\{([\s\S]*?)\n  \}\s*\n",
            src,
        )
        assert m, "openWallet body not found"
        body = m.group(1)
        # B2B route literal
        assert re.search(r"DY\.pagina\s*=\s*['\"]wallet['\"]", body), \
            "openWallet must set DY.pagina='wallet'"
        # Force re-render flag cleared
        assert re.search(r"DY\._laatstGerenderd\s*=\s*null", body), \
            "openWallet must clear DY._laatstGerenderd"
        # brand-portal lock cleared
        assert re.search(r"_renderLock\s*=\s*false", body), \
            "openWallet must clear brandPortal._renderLock"
        # history.pushState with ?pagina=wallet
        assert "history.pushState" in body, \
            "openWallet must push to history"
        assert re.search(r"searchParams\.set\(\s*['\"]pagina['\"]\s*,\s*['\"]wallet['\"]\s*\)", body), \
            "openWallet must update ?pagina=wallet in URL"
        # Direct call to renderWallet (NOT via DY.navigeer / DY.toonPagina)
        assert re.search(r"\brenderWallet\s*\(\s*\)", body), \
            "openWallet must DIRECTLY call renderWallet()"

    # (d) openWallet has try/catch fallback to DY.navigeer('wallet')
    def test_openwallet_has_navigeer_fallback(self):
        src = B2B_FILE.read_text()
        m = re.search(
            r"function\s+openWallet\s*\(\s*\)\s*\{([\s\S]*?)\n  \}\s*\n",
            src,
        )
        assert m
        body = m.group(1)
        # There must be a catch block that calls DY.navigeer('wallet')
        assert re.search(r"catch[\s\S]*?DY\.navigeer\(\s*['\"]wallet['\"]\s*\)", body), \
            "openWallet must have a try/catch fallback to DY.navigeer('wallet')"

    # (e) openWallet does NOT call DY.toonPagina (the wrapped one)
    def test_openwallet_does_not_call_toonpagina(self):
        src = B2B_FILE.read_text()
        m = re.search(
            r"function\s+openWallet\s*\(\s*\)\s*\{([\s\S]*?)\n  \}\s*\n",
            src,
        )
        assert m
        body = m.group(1)
        assert "DY.toonPagina" not in body, (
            "openWallet must NOT call DY.toonPagina (wrapped by pp-nav-fix)"
        )

    # (f) openWallet does NOT touch B2C state
    def test_openwallet_does_not_touch_b2c_state(self):
        src = B2B_FILE.read_text()
        m = re.search(
            r"function\s+openWallet\s*\(\s*\)\s*\{([\s\S]*?)\n  \}\s*\n",
            src,
        )
        assert m
        body = m.group(1)
        assert "b2c_wallet_balance" not in body, \
            "openWallet must NOT touch b2c_wallet_balance"
        assert "b2c_wallet" not in body, \
            "openWallet must NOT reference b2c_wallet route"
        assert "PP_B2CWallet" not in body, \
            "openWallet must NOT reference PP_B2CWallet"

    # (g) Inline onclick first calls PP_Wallet.openWallet() with return false
    def test_inline_onclick_calls_openwallet(self):
        src = B2B_FILE.read_text()
        # Find the setAttribute('onclick', ...) call in injectDashboardCard
        m = re.search(
            r"setAttribute\(\s*['\"]onclick['\"]\s*,\s*([\s\S]*?)\)\s*;\s*\n",
            src,
        )
        assert m, "inline onclick setAttribute not found"
        onclick_args = m.group(1)
        # Must literally call PP_Wallet.openWallet() with return false
        assert "PP_Wallet.openWallet();return false" in onclick_args, (
            "Inline onclick must contain literal `PP_Wallet.openWallet();return false`"
        )
        # Must still have the navigeer fallback chain
        assert "DY.brandPortal._renderLock=false" in onclick_args or \
               re.search(r"_renderLock\s*=\s*false", onclick_args), (
            "Inline onclick must still clear _renderLock in fallback"
        )
        assert "DY.navigeer('wallet')" in onclick_args or \
               'navigeer("wallet")' in onclick_args, (
            "Inline onclick must still have DY.navigeer('wallet') as fallback"
        )

    # (h) Delegator now prevents default AND stops propagation
    def test_delegator_now_prevents_default(self):
        src = B2B_FILE.read_text()
        m = re.search(
            r"function\s+setupWalletClickDelegator\s*\(\s*\)\s*\{([\s\S]*?)\n  \}\s*\n",
            src,
        )
        assert m
        deleg = m.group(1)
        assert "e.preventDefault()" in deleg, (
            "v60.1.159: delegator must call e.preventDefault()"
        )
        assert "e.stopPropagation()" in deleg, (
            "v60.1.159: delegator must call e.stopPropagation()"
        )

    # (i) Delegator first calls PP_Wallet.openWallet(), then falls back
    def test_delegator_calls_openwallet(self):
        src = B2B_FILE.read_text()
        m = re.search(
            r"function\s+setupWalletClickDelegator\s*\(\s*\)\s*\{([\s\S]*?)\n  \}\s*\n",
            src,
        )
        assert m
        deleg = m.group(1)
        # Must check PP_Wallet first
        assert re.search(
            r"window\.PP_Wallet\s*&&\s*typeof\s+PP_Wallet\.openWallet\s*===\s*['\"]function['\"]",
            deleg,
        ), "Delegator must guard `window.PP_Wallet && typeof PP_Wallet.openWallet === 'function'`"
        assert "PP_Wallet.openWallet()" in deleg, (
            "Delegator must call PP_Wallet.openWallet()"
        )
        # Hard fallback still calls DY.navigeer('wallet')
        assert "DY.navigeer('wallet')" in deleg, (
            "Delegator must keep DY.navigeer('wallet') hard fallback"
        )
        # Capture phase still true
        assert re.search(
            r"addEventListener\(\s*['\"]click['\"]\s*,[\s\S]+?,\s*true\s*\)",
            deleg,
        ), "Delegator must remain in capture phase (true)"

    # (j) Idempotency: renderWallet only writes DOM, no accumulating state
    def test_renderwallet_idempotent_shape(self):
        """openWallet may be called twice (capture delegator + inline onclick).
        renderWallet must be idempotent. Smoke-check: it should overwrite a
        container (innerHTML / appendChild on a known root) rather than
        push to a growing array or counter."""
        src = B2B_FILE.read_text()
        m = re.search(
            r"function\s+renderWallet\s*\(\s*\)\s*\{([\s\S]*?)\n  \}\s*\n",
            src,
        )
        # Don't require an exact body, just ensure it exists and either
        # writes innerHTML on a container or queries an existing root.
        assert m, "renderWallet body must be defined"
        body = m.group(1)
        assert ("innerHTML" in body) or ("appendChild" in body) or ("querySelector" in body), \
            "renderWallet must perform DOM writes/queries (idempotent overwrite, not accumulate)"

    # (k) ZIP regression: openWallet present in deployed bundle
    def test_zip_contains_openwallet(self):
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("extensions/payments/pp-wallet-v1.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        # function definition exactly once
        assert len(re.findall(r"function\s+openWallet\s*\(\s*\)\s*\{", content)) == 1, (
            "ZIP'd pp-wallet-v1.js must define openWallet() exactly once"
        )
        # PP_Wallet.openWallet() called at least twice (inline onclick + delegator)
        assert content.count("PP_Wallet.openWallet()") >= 2, (
            "ZIP must contain ≥2 invocations of PP_Wallet.openWallet() "
            "(inline onclick + capture delegator)"
        )
        # preventDefault in delegator
        assert "e.preventDefault()" in content, (
            "ZIP delegator must call e.preventDefault()"
        )
        assert "e.stopPropagation()" in content, (
            "ZIP delegator must call e.stopPropagation()"
        )
        # PP_Wallet export block contains openWallet
        assert re.search(r"openWallet:\s*openWallet", content), (
            "ZIP'd PP_Wallet export must expose openWallet"
        )

    # (l) B2C wallet remains UNCHANGED — no openWallet there
    def test_b2c_wallet_has_no_openwallet(self):
        src = B2C_FILE.read_text()
        assert "openWallet" not in src, (
            "B2C wallet must NOT define or export openWallet (B2B-only API)"
        )

    # (m) Cache-bust uniformity — only pp-wallet bumped this iteration
    def test_only_pp_wallet_cache_bumped_to_159(self):
        src = INDEX_HTML.read_text()
        assert "pp-wallet-v1.js?v=60.1.159-direct-render-bypass" in src
        # B2C wallet & comingsoon NOT bumped to 159 (only pp-wallet was touched)
        assert "pp-b2c-wallet-v1.js?v=60.1.159" not in src, (
            "Only pp-wallet was touched in v60.1.159; pp-b2c-wallet must not be re-cached"
        )
