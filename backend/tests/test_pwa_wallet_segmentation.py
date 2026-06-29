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
# v60.1.160: Uitgelicht product-image ratio fix
FEEDTABS_FILE = PWA / "extensions/placements/pp-feedtabs-v1.js"
# v60.1.164: Nav-Context & Brand-Logo Universalizer
NAV_CONTEXT = PWA / "extensions/profile/pp-nav-context-v1.js"
BRAND_PORTAL = PWA / "js/brand-portal-v1.js"
WALLET_FILE = PWA / "extensions/payments/pp-wallet-v1.js"


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
        # v60.1.160: pp-feedtabs-v1.js script tag carries the prod-img-contain cache key
        # pp-wallet-v1.js script tag still carries v60.1.159 cache key (untouched in v60.1.160/161/162/163/164)
        # v60.1.161: pp-brand-onboarding-checklist-v1.js script tag carries the new onb-wallet-bypass key
        # v60.1.162: pp-feedtabs-v1.js bumped to uitgelicht-no-date-filter (UNCHANGED in v60.1.164)
        # v60.1.164: pp-nav-context-v1.js NEW module added with nav-context cache key
        assert "pp-wallet-v1.js?v=60.1.159-direct-render-bypass" in src
        assert "pp-feedtabs-v1.js?v=60.1.162-uitgelicht-no-date-filter" in src
        assert "pp-brand-onboarding-checklist-v1.js?v=60.1.161-onb-wallet-bypass" in src
        assert "pp-nav-context-v1.js?v=60.1.164-nav-context" in src
        # v60.1.165: pp-merken-discoverability-v1.js NEW additive module
        assert "pp-merken-discoverability-v1.js?v=60.1.166-teaser-anchor" in src

    def test_sw_version(self):
        src = SW_FILE.read_text()
        # v60.1.165: SW VERSION bumped to merken-disc (Phase B)
        assert "VERSION       = 'v60.1.166-20260623-teaser-anchor'" in src or \
               "VERSION = 'v60.1.166-20260623-teaser-anchor'" in src


# ───────────────── Static audit: deploy zip ─────────────────
class TestDeployZip:
    def test_zip_exists_and_size(self):
        assert ZIP_FILE.exists()
        size = ZIP_FILE.stat().st_size
        assert 3 * 1024 * 1024 < size < 5 * 1024 * 1024, \
            f"zip should be between 3MB and 5MB, got {size} bytes"

    def test_zip_contains_v60_1_160_sw(self):
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("sw.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        # v60.1.165: SW VERSION bumped to merken-disc
        assert "v60.1.166-20260623-teaser-anchor" in content

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


# ───────── v60.1.160: UITGELICHT PRODUCT-IMAGE RATIO/FIT FIX ─────────
class TestUitgelichtProductImageRatio:
    """v60.1.160 user-reported bug fix (Dutch):
    'de afbeeldingen op de uitgelicht pagina worden afgesneden, zorg dat de
    afbeeldingen altijd volledig en in verhouding worden weergegeven'.

    The .pp-uitg-prod-img container previously used aspect-ratio:1/1 with
    object-fit:cover, which cropped portrait fashion photos at head/feet.
    Fix: change container to aspect-ratio:3/4 (portrait) and the inner
    <img> to object-fit:contain (full image letterboxed if needed). The
    neutral #0f0c08 background blends with the dark theme so letterbox
    bars are invisible. Only the two CSS string lines changed; the HTML
    output of paintProductenOverview is IDENTICAL.
    """

    def test_aspect_ratio_3_4_exactly_once(self):
        src = FEEDTABS_FILE.read_text()
        # exactly one occurrence of the new portrait aspect-ratio
        assert src.count("aspect-ratio:3/4") == 1, (
            "pp-feedtabs-v1.js must contain `aspect-ratio:3/4` exactly once"
        )

    def test_no_legacy_aspect_ratio_1_1(self):
        src = FEEDTABS_FILE.read_text()
        assert "aspect-ratio:1/1" not in src, (
            "v60.1.160: legacy `aspect-ratio:1/1` must be fully removed"
        )

    def test_object_fit_contain_exactly_once(self):
        src = FEEDTABS_FILE.read_text()
        assert src.count("object-fit:contain") == 1, (
            "pp-feedtabs-v1.js must contain `object-fit:contain` exactly once"
        )

    def test_no_legacy_object_fit_cover(self):
        src = FEEDTABS_FILE.read_text()
        assert "object-fit:cover" not in src, (
            "v60.1.160: legacy `object-fit:cover` must be fully removed"
        )

    def test_container_css_full_contract(self):
        """The container must still be display:flex centered with the
        neutral letterbox background and overflow:hidden + position:relative."""
        src = FEEDTABS_FILE.read_text()
        # Locate the .pp-uitg-prod-img selector block (NOT the inner img rule)
        m = re.search(r"\.pp-uitg-prod-img\{([^}]+)\}", src)
        assert m, "pp-uitg-prod-img CSS block must exist"
        block = m.group(1)
        assert "aspect-ratio:3/4" in block
        assert "background:#0f0c08" in block
        assert "display:flex" in block
        assert "align-items:center" in block
        assert "justify-content:center" in block
        assert "overflow:hidden" in block
        assert "position:relative" in block

    def test_img_css_contract(self):
        src = FEEDTABS_FILE.read_text()
        m = re.search(r"\.pp-uitg-prod-img img\{([^}]+)\}", src)
        assert m, "pp-uitg-prod-img img CSS block must exist"
        block = m.group(1)
        assert "width:100%" in block
        assert "height:100%" in block
        assert "object-fit:contain" in block
        assert "display:block" in block

    def test_index_html_carries_new_cache_version(self):
        src = INDEX_HTML.read_text()
        # v60.1.162 bumped pp-feedtabs-v1.js to uitgelicht-no-date-filter.
        # The product-image fix (v60.1.160) is still part of the file, so
        # the cache key tracks the latest version on this script.
        assert "pp-feedtabs-v1.js?v=60.1.162-uitgelicht-no-date-filter" in src, (
            "index.html must carry v=60.1.162-uitgelicht-no-date-filter for pp-feedtabs-v1.js"
        )

    def test_paint_product_html_dom_structure_unchanged(self):
        """Regression: HTML produced by paintProductenOverview must still wrap
        .pp-uitg-prod-img + .pp-uitg-prod-body inside .pp-uitg-prod-kaart."""
        src = FEEDTABS_FILE.read_text()
        assert '<a class="pp-uitg-prod-kaart"' in src
        assert '<div class="pp-uitg-prod-img">' in src
        assert '<div class="pp-uitg-prod-body">' in src
        # noimg fallback still present
        assert "pp-uitg-prod-noimg" in src

    def test_zip_contains_v60_1_160_feedtabs_css(self):
        """The Cloudflare deploy zip must contain the corrected pp-feedtabs-v1.js."""
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("extensions/placements/pp-feedtabs-v1.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert content.count("aspect-ratio:3/4") == 1
        assert "aspect-ratio:1/1" not in content
        assert content.count("object-fit:contain") == 1
        assert "object-fit:cover" not in content



# ───────── v60.1.161: ONBOARDING CHECKLIST WALLET BYPASS ─────────
class TestOnboardingChecklistWalletBypass:
    """v60.1.161 fixes the brand-dashboard onboarding-checklist 'Wallet
    opgeladen' step (data-testid='onb-go-wallet').

    Before the fix, step.route called only window.DY.navigeer('wallet'),
    which was absorbed by brand-portal-v1.js _renderLock guard — leaving
    the user on a stale B2C-flavoured wallet view instead of the B2B
    campagne-pakketten.

    The fix mirrors v60.1.159 brand-dash-wallet-card: call
    PP_Wallet.openWallet() FIRST (direct-render bypass), then fall back to
    DY.navigeer('wallet') only if PP_Wallet is not loaded.

    The other 3 onboarding steps (profiel/producten/campagne) navigate to
    brand_* routes that brand-portal-v1.js handles natively and must
    remain UNCHANGED.
    """

    def test_onboarding_module_version_bumped(self):
        """PP_BrandOnboarding.VERSION must be '1.1.0' in v60.1.161."""
        src = ONBOARDING.read_text()
        assert re.search(r"VERSION:\s*'1\.1\.0'", src), \
            "PP_BrandOnboarding.VERSION must be '1.1.0' in v60.1.161"

    def test_wallet_step_uses_pp_wallet_openwallet_bypass(self):
        """The wallet step.route MUST call PP_Wallet.openWallet() — the
        v60.1.159 direct-render bypass — to avoid being absorbed by the
        brand-portal _renderLock guard."""
        src = ONBOARDING.read_text()
        assert "PP_Wallet.openWallet()" in src, \
            "Wallet step.route must call PP_Wallet.openWallet() (v60.1.161 bypass)"

    def test_wallet_step_falls_back_to_dy_navigeer(self):
        """Backwards-compat fallback: if PP_Wallet is not loaded, the
        wallet step still must navigate via DY.navigeer('wallet')."""
        src = ONBOARDING.read_text()
        # Extract the wallet step block (key: 'wallet')
        m = re.search(r"key:\s*'wallet'.*?route:\s*function\s*\(\)\s*\{(.*?)\}\s*\}", src, re.DOTALL)
        assert m, "Could not isolate wallet step.route block"
        wallet_route = m.group(1)
        assert "PP_Wallet.openWallet()" in wallet_route, \
            "wallet step.route block must contain PP_Wallet.openWallet()"
        assert "DY.navigeer('wallet')" in wallet_route, \
            "wallet step.route must retain DY.navigeer('wallet') fallback"
        # Ensure openWallet appears BEFORE navigeer in the function body
        idx_open = wallet_route.index("PP_Wallet.openWallet()")
        idx_nav = wallet_route.index("DY.navigeer('wallet')")
        assert idx_open < idx_nav, \
            "PP_Wallet.openWallet() must be called BEFORE DY.navigeer('wallet') fallback"

    def test_wallet_step_clears_render_lock(self):
        """Defensive: the step also clears DY.brandPortal._renderLock so
        the navigeer fallback path isn't absorbed if PP_Wallet missing."""
        src = ONBOARDING.read_text()
        m = re.search(r"key:\s*'wallet'.*?route:\s*function\s*\(\)\s*\{(.*?)\}\s*\}", src, re.DOTALL)
        assert m
        assert "_renderLock" in m.group(1), \
            "wallet step.route must defensively clear DY.brandPortal._renderLock"

    def test_other_onboarding_steps_unchanged(self):
        """The 3 other onboarding steps (profiel/producten/campagne) must
        still use window.DY.navigeer('brand_xxx') — those routes are
        handled natively by brand-portal-v1.js without renderLock
        absorption, so no bypass is needed."""
        src = ONBOARDING.read_text()
        assert "window.DY.navigeer('brand_profiel')" in src, \
            "Profiel step must still use DY.navigeer('brand_profiel')"
        assert "window.DY.navigeer('brand_producten')" in src, \
            "Producten step must still use DY.navigeer('brand_producten')"
        assert "window.DY.navigeer('brand_campagnes')" in src, \
            "Campagne step must still use DY.navigeer('brand_campagnes')"
        # And those 3 steps must NOT call PP_Wallet.openWallet()
        for key in ("brand_profiel", "brand_producten", "brand_campagnes"):
            block_re = re.compile(
                r"key:\s*'(?:profiel|producten|campagne)'.*?route:\s*function\s*\(\)\s*\{[^}]*"
                + re.escape(key) + r"[^}]*\}", re.DOTALL)
            for m in block_re.finditer(src):
                assert "PP_Wallet" not in m.group(0), \
                    f"Step targeting {key} must NOT call PP_Wallet"

    def test_index_html_cache_bust(self):
        """index.html script tag for the onboarding checklist must carry
        the v60.1.161 cache key."""
        src = INDEX_HTML.read_text()
        assert "pp-brand-onboarding-checklist-v1.js?v=60.1.161-onb-wallet-bypass" in src, \
            "index.html must cache-bust pp-brand-onboarding-checklist-v1.js to v60.1.161"

    def test_pp_wallet_openwallet_still_exported(self):
        """Regression: v60.1.159 PP_Wallet.openWallet() must still be
        exported on window.PP_Wallet. The onboarding-checklist depends
        on it."""
        src = B2B_FILE.read_text()
        assert re.search(r"function\s+openWallet\s*\(", src), \
            "openWallet() function must be defined in pp-wallet-v1.js"
        assert "window.PP_Wallet" in src, \
            "window.PP_Wallet export must exist in pp-wallet-v1.js"
        # confirm openWallet is exposed on the export object
        m = re.search(r"window\.PP_Wallet\s*=\s*\{[^}]*\}", src, re.DOTALL)
        assert m and "openWallet" in m.group(0), \
            "openWallet must be exposed on window.PP_Wallet"

    def test_b2c_wallet_unchanged_no_onboarding_injection(self):
        """Regression: pp-b2c-wallet-v1.js v1.3.0 must NOT have been
        touched by this fix — no injection into the onboarding-checklist
        flow."""
        src = (PWA / "extensions/payments/pp-b2c-wallet-v1.js").read_text()
        assert re.search(r"VERSION:\s*'1\.3\.0'", src), \
            "B2C wallet must still be VERSION 1.3.0 in v60.1.161"
        assert "PP_BrandOnboarding" not in src, \
            "B2C wallet must NOT reference PP_BrandOnboarding"
        assert "onb-go-wallet" not in src, \
            "B2C wallet must NOT reference the onboarding-checklist testid"

    def test_zip_onboarding_checklist_contains_openwallet(self):
        """The Cloudflare deploy zip MUST contain the v60.1.161 fix:
        PP_Wallet.openWallet() literal in the onboarding-checklist
        module AND VERSION '1.1.0'."""
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("extensions/profile/pp-brand-onboarding-checklist-v1.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert "PP_Wallet.openWallet()" in content, \
            "ZIP'd onboarding-checklist must contain PP_Wallet.openWallet() literal"
        assert re.search(r"VERSION:\s*'1\.1\.0'", content), \
            "ZIP'd onboarding-checklist must be VERSION '1.1.0'"
        # Other steps still use the brand_* navigeer pattern in the zip
        assert "window.DY.navigeer('brand_profiel')" in content
        assert "window.DY.navigeer('brand_producten')" in content
        assert "window.DY.navigeer('brand_campagnes')" in content

    def test_zip_index_html_cache_bust(self):
        """The Cloudflare deploy zip's index.html must reference the
        v60.1.161 onb-wallet-bypass cache key for the checklist."""
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("index.html") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert "pp-brand-onboarding-checklist-v1.js?v=60.1.161-onb-wallet-bypass" in content

    def test_zip_md5_matches_expected(self):
        """Critical: zip MD5 must equal the agent-supplied value to
        guarantee the bundle published to Cloudflare is the exact one
        carrying the v60.1.163 fix."""
        import hashlib
        h = hashlib.md5()
        with open(ZIP_FILE, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        assert h.hexdigest() == "140eb3aa24ecc4145e755b0aedf9d95f", \
            f"deploy zip MD5 mismatch: got {h.hexdigest()}"


# ───────── v60.1.162: UITGELICHT — NO CLIENT-SIDE DATE FILTER ─────────
class TestUitgelichtNoDateFilter:
    """v60.1.162 user-reported bug (Dutch):
    Feed → Uitgelicht → 'Gesponsord door onze partners' toonde 'Nog geen
    actieve partner-campagnes' terwijl er een actieve campagne (status='live')
    in Firestore stond. Root cause: dubbele client-side date filter op
    c.startDatum.toMillis() / c.eindDatum.toMillis() faalde wanneer datums
    geen Firestore Timestamps waren (string/Date/null). Fix: client-side
    date-filter VERWIJDERD, vertrouwen we uitsluitend op de Firestore query
    `where('status','==','live')` die al backend-side filtert.
    """

    def _paint_uitgelicht_body(self):
        """Extract the paintUitgelicht function body for targeted assertions."""
        src = FEEDTABS_FILE.read_text()
        m = re.search(
            r"function\s+paintUitgelicht\s*\([^)]*\)\s*\{",
            src,
        )
        assert m, "paintUitgelicht function must exist in pp-feedtabs-v1.js"
        # Walk braces to find function end
        start = m.end()
        depth = 1
        i = start
        while i < len(src) and depth > 0:
            ch = src[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
            i += 1
        return src[start:i - 1]

    def test_no_start_datum_to_millis_in_paint_uitgelicht(self):
        body = self._paint_uitgelicht_body()
        assert "c.startDatum.toMillis()" not in body, \
            "v60.1.162: client-side c.startDatum.toMillis() filter must be removed"

    def test_no_eind_datum_to_millis_in_paint_uitgelicht(self):
        body = self._paint_uitgelicht_body()
        assert "c.eindDatum.toMillis()" not in body, \
            "v60.1.162: client-side c.eindDatum.toMillis() filter must be removed"

    def test_filter_is_only_status_live(self):
        body = self._paint_uitgelicht_body()
        assert "c.status === 'live'" in body, \
            "v60.1.162: filter must be `c && c.status === 'live'`"

    def test_diagnostic_console_log_present(self):
        body = self._paint_uitgelicht_body()
        assert "[pp-feedtabs] uitgelicht render:" in body, \
            "v60.1.162: diagnostic console.log must be present for future debugging"
        # Structured payload keys
        for key in ("ontvangen", "actief", "ids"):
            assert key in body, f"diagnostic log must include `{key}` key"

    def test_firestore_query_unchanged(self):
        """The Firestore query at ~line 272 must remain a status='live'
        query with limit(50). Only the client-side post-filter changed."""
        src = FEEDTABS_FILE.read_text()
        assert re.search(
            r"db\.collection\(\s*['\"]campaigns['\"]\s*\)\s*"
            r"\.where\(\s*['\"]status['\"]\s*,\s*['\"]==['\"]\s*,\s*['\"]live['\"]\s*\)\s*"
            r"\.limit\(\s*50\s*\)",
            src,
        ), "Firestore query `campaigns.where(status==live).limit(50)` must be intact"

    def test_cache_bust_in_index_html(self):
        src = INDEX_HTML.read_text()
        assert "pp-feedtabs-v1.js?v=60.1.162-uitgelicht-no-date-filter" in src, \
            "index.html must cache-bust pp-feedtabs-v1.js to v60.1.162"

    def test_sw_version_bumped(self):
        src = SW_FILE.read_text()
        # v60.1.165: sw.js bumped to merken-disc (Phase B; supersedes v60.1.164)
        assert "v60.1.166-20260623-teaser-anchor" in src, \
            "sw.js VERSION must be bumped to v60.1.165 (merken-disc)"

    def test_zip_no_to_millis_in_paint_uitgelicht(self):
        """Critical: deployed Cloudflare bundle must not contain the
        legacy client-side date filter anywhere in pp-feedtabs-v1.js."""
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("extensions/placements/pp-feedtabs-v1.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert "c.startDatum.toMillis()" not in content, \
            "ZIP'd pp-feedtabs-v1.js still contains c.startDatum.toMillis()"
        assert "c.eindDatum.toMillis()" not in content, \
            "ZIP'd pp-feedtabs-v1.js still contains c.eindDatum.toMillis()"
        assert "c.status === 'live'" in content, \
            "ZIP'd pp-feedtabs-v1.js must contain the new `c.status === 'live'` filter"

    def test_zip_pp_feedtabs_contains_v60_1_162(self):
        """ZIP'd pp-feedtabs-v1.js should carry v60.1.162 marker comment."""
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("extensions/placements/pp-feedtabs-v1.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert "v60.1.162" in content, \
            "ZIP'd pp-feedtabs-v1.js must contain v60.1.162 version marker"


# ───────── v60.1.162 REGRESSION: productflow + v60.1.160/161 fixes intact ─────────
class TestV60_162Regression:
    def test_v60_160_product_image_aspect_ratio_intact(self):
        """v60.1.160 fix: .pp-uitg-prod-img must still use aspect-ratio:3/4
        and object-fit:contain."""
        src = FEEDTABS_FILE.read_text()
        assert ".pp-uitg-prod-img" in src
        assert re.search(r"aspect-ratio\s*:\s*3\s*/\s*4", src), \
            "v60.1.160 product-image aspect-ratio:3/4 must still be present"
        assert re.search(r"object-fit\s*:\s*contain", src), \
            "v60.1.160 product-image object-fit:contain must still be present"

    def test_v60_161_onboarding_wallet_bypass_intact(self):
        """v60.1.161 onboarding wallet bypass must still be in place."""
        src = ONBOARDING.read_text()
        assert re.search(r"VERSION:\s*'1\.1\.0'", src), \
            "PP_BrandOnboarding.VERSION must remain '1.1.0' in v60.1.162"

    def test_product_flow_unchanged(self):
        """v60.1.162 is surgical: paintProductenOverview / .pp-uitg-prod-grid
        must remain present and unchanged in structure."""
        src = FEEDTABS_FILE.read_text()
        assert "paintProductenOverview" in src, \
            "paintProductenOverview must remain in pp-feedtabs-v1.js"
        assert "pp-uitg-prod-grid" in src, \
            "pp-uitg-prod-grid class must remain in pp-feedtabs-v1.js"



# ───────── v60.1.163: BRAND-PROFILE PRODUCT IMAGE RATIO FIX ─────────
BRAND_PROD_IMG_FIX_CSS = PWA / "extensions/profile/pp-brand-prod-img-fix.css"
BRAND_PORTAL_LEGACY = PWA / "js/brand-portal-v1.js"


class TestBrandProdImgFix:
    """v60.1.163 user-reported bug (Dutch):

    On the brand-profile 'Merken' tab (route brand_detail/merken_detail,
    rendered by legacy js/brand-portal-v1.js → bp-prod-grid), product
    photos were cropped — the head of the fashion-model disappeared.

    Mirrors the v60.1.160 fix (.pp-uitg-prod-img aspect-ratio:3/4 +
    object-fit:contain) but targets the legacy .bp-prod-img selector.
    Because brand-portal-v1.js may NOT be edited per strict additive
    architecture rules, this fix is applied via a NEW additive CSS file
    pp-brand-prod-img-fix.css loaded AFTER brand-portal.css in
    index.html so it wins via CSS specificity + order.
    """

    def test_brand_prod_img_fix_css_exists(self):
        assert BRAND_PROD_IMG_FIX_CSS.exists(), \
            "pp-brand-prod-img-fix.css must exist at /app/pwa/extensions/profile/"

    def test_brand_prod_img_aspect_ratio_3_4(self):
        src = BRAND_PROD_IMG_FIX_CSS.read_text()
        # .bp-prod-img block contains aspect-ratio:3/4
        m = re.search(r"\.bp-prod-img\s*\{([^}]+)\}", src)
        assert m, ".bp-prod-img CSS block must exist in pp-brand-prod-img-fix.css"
        body = m.group(1)
        assert re.search(r"aspect-ratio\s*:\s*3\s*/\s*4", body), \
            "v60.1.163: .bp-prod-img must declare aspect-ratio: 3 / 4"
        assert re.search(r"background\s*:\s*#0f0c08", body), \
            "v60.1.163: .bp-prod-img must declare neutral letterbox background #0f0c08"
        for required in (
            "display: flex",
            "align-items: center",
            "justify-content: center",
            "overflow: hidden",
            "position: relative",
        ):
            assert required in body, \
                f"v60.1.163: .bp-prod-img block must contain `{required}`"

    def test_brand_prod_img_inner_img_object_fit_contain(self):
        src = BRAND_PROD_IMG_FIX_CSS.read_text()
        m = re.search(r"\.bp-prod-img\s+img\s*\{([^}]+)\}", src)
        assert m, ".bp-prod-img img CSS block must exist in pp-brand-prod-img-fix.css"
        body = m.group(1)
        assert re.search(r"object-fit\s*:\s*contain", body), \
            "v60.1.163: .bp-prod-img img must declare object-fit: contain"
        assert re.search(r"width\s*:\s*100%", body), \
            "v60.1.163: .bp-prod-img img must declare width: 100%"
        assert re.search(r"height\s*:\s*100%", body), \
            "v60.1.163: .bp-prod-img img must declare height: 100%"
        assert re.search(r"display\s*:\s*block", body), \
            "v60.1.163: .bp-prod-img img must declare display: block"

    def test_index_html_links_brand_prod_img_fix_css(self):
        src = INDEX_HTML.read_text()
        # Exactly one <link> for the new css with v60.1.163 cache buster.
        link = '<link rel="stylesheet" href="/extensions/profile/pp-brand-prod-img-fix.css?v=60.1.163-brand-prod-img-fix">'
        assert link in src, \
            "index.html must include the pp-brand-prod-img-fix.css link with v=60.1.163-brand-prod-img-fix"
        # Ensure it appears exactly once (no duplicate injections).
        assert src.count("pp-brand-prod-img-fix.css") == 1, \
            "pp-brand-prod-img-fix.css must appear exactly once in index.html"

    def test_index_html_link_order_after_brand_portal_css(self):
        """The override file MUST load AFTER /brand-portal.css so legacy
        rules are overridden via natural CSS source-order specificity."""
        src = INDEX_HTML.read_text()
        legacy_idx = src.find("/brand-portal.css")
        fix_idx = src.find("pp-brand-prod-img-fix.css")
        assert legacy_idx != -1, "brand-portal.css link must exist in index.html"
        assert fix_idx != -1, "pp-brand-prod-img-fix.css link must exist in index.html"
        assert fix_idx > legacy_idx, \
            "pp-brand-prod-img-fix.css must load AFTER /brand-portal.css to win via source order"

    def test_legacy_brand_portal_v1_js_unchanged(self):
        """Legacy js/brand-portal-v1.js MUST NOT be touched — verify the
        bp-prod-img rendering at ~line 473 is still present unchanged."""
        assert BRAND_PORTAL_LEGACY.exists(), \
            "Legacy js/brand-portal-v1.js must exist"
        src = BRAND_PORTAL_LEGACY.read_text()
        assert '<div class="bp-prod-img"><img src="' in src, \
            "Legacy brand-portal-v1.js must still render <div class=\"bp-prod-img\"><img ...>"
        assert '<div class="bp-prod-img bp-prod-noimg">' in src, \
            "Legacy brand-portal-v1.js must still have the no-image fallback variant"

    def test_zip_contains_brand_prod_img_fix_css(self):
        """The Cloudflare deploy zip MUST contain the new CSS file with
        both required selectors and exact declarations."""
        with zipfile.ZipFile(ZIP_FILE) as z:
            names = z.namelist()
            assert "extensions/profile/pp-brand-prod-img-fix.css" in names, \
                "ZIP must contain extensions/profile/pp-brand-prod-img-fix.css"
            with z.open("extensions/profile/pp-brand-prod-img-fix.css") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert re.search(r"\.bp-prod-img\s*\{[^}]*aspect-ratio\s*:\s*3\s*/\s*4", content), \
            "ZIP'd pp-brand-prod-img-fix.css must contain .bp-prod-img with aspect-ratio:3/4"
        assert re.search(r"\.bp-prod-img\s+img\s*\{[^}]*object-fit\s*:\s*contain", content), \
            "ZIP'd pp-brand-prod-img-fix.css must contain .bp-prod-img img with object-fit:contain"

    def test_zip_index_html_links_brand_prod_img_fix_css(self):
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("index.html") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert "/extensions/profile/pp-brand-prod-img-fix.css?v=60.1.163-brand-prod-img-fix" in content, \
            "ZIP'd index.html must link pp-brand-prod-img-fix.css with v=60.1.163-brand-prod-img-fix"

    def test_zip_legacy_brand_portal_v1_js_unchanged(self):
        """Legacy file in zip must still contain the .bp-prod-img rendering."""
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("js/brand-portal-v1.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert '<div class="bp-prod-img"><img src="' in content, \
            "ZIP'd legacy brand-portal-v1.js must still render bp-prod-img"


# ───────── v60.1.163 REGRESSION: prior fixes (v60.1.159-162) intact ─────────
class TestV60_163Regression:
    def test_v60_159_pp_wallet_openwallet_intact(self):
        """v60.1.159 PP_Wallet.openWallet entry point must remain."""
        src = B2B_FILE.read_text()
        assert "openWallet" in src, "PP_Wallet.openWallet must still exist (v60.1.159)"
        assert re.search(r"VERSION\s*:\s*'1\.8\.0'", src), \
            "B2B PP_Wallet must remain VERSION 1.8.0 (v60.1.159)"

    def test_v60_160_uitg_prod_img_intact(self):
        """v60.1.160 .pp-uitg-prod-img aspect-ratio:3/4 + object-fit:contain still present."""
        src = FEEDTABS_FILE.read_text()
        # Locate the .pp-uitg-prod-img block
        m = re.search(r"\.pp-uitg-prod-img\{([^}]+)\}", src)
        assert m, "v60.1.160 .pp-uitg-prod-img CSS block must remain"
        assert re.search(r"aspect-ratio\s*:\s*3\s*/\s*4", m.group(1)), \
            "v60.1.160 aspect-ratio:3/4 must remain"
        m2 = re.search(r"\.pp-uitg-prod-img img\{([^}]+)\}", src)
        assert m2, "v60.1.160 .pp-uitg-prod-img img CSS block must remain"
        assert re.search(r"object-fit\s*:\s*contain", m2.group(1)), \
            "v60.1.160 object-fit:contain on inner img must remain"

    def test_v60_161_onboarding_wallet_bypass_intact(self):
        """v60.1.161 onboarding wallet bypass must remain."""
        src = ONBOARDING.read_text()
        assert re.search(r"VERSION:\s*'1\.1\.0'", src), \
            "PP_BrandOnboarding.VERSION must remain '1.1.0' (v60.1.161)"

    def test_v60_162_paint_uitgelicht_live_filter_intact(self):
        """v60.1.162 paintUitgelicht status='live' filter must remain."""
        src = FEEDTABS_FILE.read_text()
        assert "c.status === 'live'" in src, \
            "v60.1.162 c.status === 'live' filter must remain"
        # Legacy client-side date filter must NOT be reintroduced
        assert "c.startDatum.toMillis()" not in src, \
            "v60.1.162: legacy startDatum.toMillis filter must remain removed"
        assert "c.eindDatum.toMillis()" not in src, \
            "v60.1.162: legacy eindDatum.toMillis filter must remain removed"

    def test_only_additive_changes_in_v60_163(self):
        """v60.1.163 should only add 1 new CSS file + 1 line in index.html
        + sw.js VERSION bump. Verify by checking the new css link is
        present and the legacy brand-portal-v1.js is untouched.
        v60.1.164: sw.js VERSION bumped further to nav-context."""
        index_src = INDEX_HTML.read_text()
        assert index_src.count("pp-brand-prod-img-fix.css") == 1
        # sw.js carries v60.1.165 marker (Phase B; supersedes v60.1.163/164)
        assert "v60.1.166-20260623-teaser-anchor" in SW_FILE.read_text()


# ───────── v60.1.163: backend download endpoint smoke ─────────
class TestV60_163Download:
    def test_download_zip_endpoint_returns_200(self):
        if not BASE_URL:
            pytest.skip("REACT_APP_BACKEND_URL not configured")
        url = f"{BASE_URL}/api/downloads/01-paskamerpraat-pwa-cloudflare.zip"
        r = requests.get(url, stream=True, timeout=30)
        assert r.status_code == 200, \
            f"GET {url} expected 200, got {r.status_code}"
        # Read content to verify size; cap at 6MB to avoid runaway
        size = 0
        for chunk in r.iter_content(chunk_size=65536):
            size += len(chunk)
            if size > 6 * 1024 * 1024:
                break
        assert 3 * 1024 * 1024 < size < 5 * 1024 * 1024, \
            f"Downloaded zip size {size} not within 3-5MB"



# ═══════════════════════════════════════════════════════════════════════
# v60.1.164: NAV-CONTEXT & BRAND-LOGO UNIVERSALIZER
# ═══════════════════════════════════════════════════════════════════════
class TestNavContext:
    """v60.1.164 static audit for the new pp-nav-context-v1.js module:
    (1) "Terug naar merken" capture-phase delegator that bypasses brand-portal
        _renderLock by calling DY.brandPortal.renderMerken() directly.
    (2) brandLogoFor() Promise resolver with 5-min TTL cache reading
        brands/{uid}.logo from Firestore.
    (3) MutationObserver that patches .pp-uitg-kaart cards with data-brand-id
        extracted from openCamp() onclick handler and replaces .pp-uitg-logo
        innerHTML with real <img> tags.
    """

    def test_module_file_exists(self):
        assert NAV_CONTEXT.exists(), "pp-nav-context-v1.js must exist"

    def test_version_1_0_0(self):
        src = NAV_CONTEXT.read_text()
        assert "VERSION:           '1.0.0'" in src or \
               "VERSION: '1.0.0'" in src, \
               "PP_NavContext.VERSION must be '1.0.0' in v60.1.164"

    def test_iife_idempotent_guard(self):
        src = NAV_CONTEXT.read_text()
        assert "window.__ppNavContextInit" in src, \
               "Module must guard against double-init via __ppNavContextInit"

    def test_public_api_exports(self):
        src = NAV_CONTEXT.read_text()
        # Must expose PP_NavContext with all 4 documented functions
        assert "window.PP_NavContext" in src
        for fn in ("openMerken", "resolveBackRoute", "brandLogoFor", "injectLogos"):
            assert fn in src, f"PP_NavContext public API must export {fn}"

    def test_openMerken_clears_renderLock_and_renders_directly(self):
        """openMerken() must clear _renderLock and call BP.renderMerken()
        directly — bypasses brand-portal absorption (analoog v60.1.159
        PP_Wallet.openWallet pattern)."""
        src = NAV_CONTEXT.read_text()
        assert "DY.brandPortal._renderLock = false" in src, \
               "openMerken must clear brand-portal _renderLock"
        assert "DY._laatstGerenderd = null" in src or \
               "window.DY._laatstGerenderd = null" in src, \
               "openMerken must clear DY._laatstGerenderd"
        assert "DY.pagina = 'merken'" in src or \
               "window.DY.pagina = 'merken'" in src, \
               "openMerken must set DY.pagina = 'merken'"
        assert "DY.brandPortal.renderMerken()" in src, \
               "openMerken must call DY.brandPortal.renderMerken() directly"

    def test_openMerken_pushState_pagina_merken(self):
        src = NAV_CONTEXT.read_text()
        assert "searchParams.set('pagina', 'merken')" in src, \
               "openMerken must set ?pagina=merken via pushState"
        assert "searchParams.delete('id')" in src, \
               "openMerken must delete &id from URL"
        assert "history.pushState" in src

    def test_openMerken_no_feed_fallback(self):
        """openMerken() must NOT contain a hardcoded navigeer('feed')
        call — feed is only allowed as last fallback in resolveBackRoute."""
        src = NAV_CONTEXT.read_text()
        # Extract the openMerken function block
        m = re.search(r"function openMerken\(\)\s*\{(.*?)\n  \}\n", src, re.S)
        assert m, "openMerken function not found"
        body = m.group(1)
        assert "navigeer('feed')" not in body, \
               "openMerken must NOT call navigeer('feed') — that's the bug being fixed"

    def test_capture_phase_back_button_delegator(self):
        """setupBackButtonDelegator MUST install a document-level capture-phase
        listener (3rd arg = true) on click events targeting
        [data-testid='brand-detail-back'] via .closest()."""
        src = NAV_CONTEXT.read_text()
        assert "[data-testid=\"brand-detail-back\"]" in src, \
               "Delegator must target [data-testid='brand-detail-back']"
        # Capture-phase: addEventListener( 'click', fn, true );
        assert re.search(r"addEventListener\(\s*['\"]click['\"][\s\S]+?,\s*true\s*\)", src), \
               "Click listener must be installed in capture phase (3rd arg true)"
        assert "preventDefault" in src and "stopPropagation" in src, \
               "Delegator must call preventDefault + stopPropagation"
        assert ".closest(" in src, "Delegator must use .closest() to match button"

    def test_brandLogoFor_promise_signature(self):
        src = NAV_CONTEXT.read_text()
        assert "function brandLogoFor(brandId)" in src
        # Falsy brandId → Promise.resolve(null)
        assert "if (!brandId) return Promise.resolve(null)" in src
        # No db → Promise.resolve(null)
        assert "if (!d) return Promise.resolve(null)" in src

    def test_brandLogoFor_5min_ttl_cache(self):
        src = NAV_CONTEXT.read_text()
        assert "LOGO_CACHE" in src
        assert "5 * 60 * 1000" in src, "TTL must be 5*60*1000 ms (5 minutes)"
        assert "LOGO_TTL_MS" in src

    def test_brandLogoFor_reads_firestore_brands_logo(self):
        src = NAV_CONTEXT.read_text()
        assert "firebase.firestore()" in src
        assert ".collection('brands').doc(brandId).get()" in src, \
               "brandLogoFor must read from brands/{brandId} Firestore doc"
        assert "data.logo" in src, "Must read .logo field from doc data"

    def test_brandLogoFor_caches_failures(self):
        """Cache must store both success and failure results so we don't
        re-fetch on every render."""
        src = NAV_CONTEXT.read_text()
        # Both .then and .catch should populate LOGO_CACHE
        catch_block = re.search(r"\.catch\(function[\s\S]+?\}\)", src)
        assert catch_block, "brandLogoFor must have .catch handler"
        assert "LOGO_CACHE[brandId]" in catch_block.group(0), \
               "Failure path must also cache (url:null) to avoid repeated fetches"

    def test_patchUitgelichtCards_extracts_brandId_from_onclick(self):
        src = NAV_CONTEXT.read_text()
        assert "data-pp-brand-id-set" in src, \
               "patchUitgelichtCards must use [data-pp-brand-id-set] guard attribute"
        assert ".pp-uitg-kaart" in src
        # Regex extracting 2nd arg of openCamp('cid','bid')
        assert "openCamp" in src
        assert re.search(r"openCamp\\\('\[\^'\]\*','\(\[\^'\]\*\)'", src), \
               "Must extract brandId via regex on openCamp('cid','bid') onclick"

    def test_injectLogos_replaces_innerHTML_with_img(self):
        src = NAV_CONTEXT.read_text()
        assert "data-pp-logo-checked" in src, \
               "injectLogos must use [data-pp-logo-checked] guard attribute"
        assert "[data-brand-id]" in src
        assert ".pp-uitg-logo" in src
        assert "document.createElement('img')" in src
        assert "object-fit:cover" in src, "img must use object-fit:cover styling"
        assert "img.onerror" in src, "Must have onerror fallback for broken images"

    def test_resolveBackRoute_brand_detail_returns_merken(self):
        """brand_*, merken_detail, brand_detail contexts return
        {route:'merken', handler:openMerken}. Wallet returns
        brand_dashboard. Fallback is history.back(), NOT hardcoded feed."""
        src = NAV_CONTEXT.read_text()
        assert "function resolveBackRoute" in src
        assert "/^brand_/" in src or "^brand_" in src
        assert "merken_detail" in src
        assert "brand_detail" in src
        assert "route: 'merken'" in src
        assert "brand_dashboard" in src, "wallet context must return brand_dashboard"
        assert "history.back()" in src, "fallback must use history.back() not feed"

    def test_resolveBackRoute_feed_only_as_last_fallback(self):
        """navigeer('feed') is allowed ONLY inside the history-fallback
        branch (when history.length <= 1). It must NOT appear in the
        brand_/merken_detail branch."""
        src = NAV_CONTEXT.read_text()
        # Count occurrences — should be exactly 1 (history fallback)
        feed_count = src.count("navigeer('feed')")
        assert feed_count == 1, \
               f"navigeer('feed') should appear exactly once (last fallback), got {feed_count}"

    def test_init_uses_mutation_observer(self):
        """MutationObserver must observe document.body subtree and call
        patchUitgelichtCards + injectLogos on every mutation."""
        src = NAV_CONTEXT.read_text()
        assert "new MutationObserver" in src
        assert "obs.observe(document.body" in src or "observe(document.body" in src
        assert "subtree: true" in src
        assert "childList: true" in src
        assert "patchUitgelichtCards" in src
        assert "injectLogos" in src

    def test_index_html_links_after_route_safety(self):
        """pp-nav-context-v1.js must be loaded AFTER pp-route-safety-v1.js
        so route-safety guards register first."""
        src = INDEX_HTML.read_text()
        rs_pos = src.find("pp-route-safety-v1.js")
        nc_pos = src.find("pp-nav-context-v1.js")
        assert rs_pos > 0 and nc_pos > 0, \
               "Both pp-route-safety-v1.js and pp-nav-context-v1.js must be linked"
        assert nc_pos > rs_pos, \
               "pp-nav-context-v1.js must be loaded AFTER pp-route-safety-v1.js"

    def test_index_html_cache_key(self):
        src = INDEX_HTML.read_text()
        assert "pp-nav-context-v1.js?v=60.1.164-nav-context" in src

    def test_brand_portal_unchanged_back_button(self):
        """brand-portal-v1.js is the LEGACY file (UNCHANGED in v60.1.164).
        It still contains the [data-testid='brand-detail-back'] button
        — the delegator in pp-nav-context-v1.js handles it via capture-phase."""
        src = BRAND_PORTAL.read_text()
        assert 'data-testid="brand-detail-back"' in src, \
               "brand-portal-v1.js must still emit the back button"
        # The legacy onclick is still navigeer('merken') — that's fine because
        # capture-phase delegator pre-empts it.
        assert "DY.navigeer(\\'merken\\')" in src or \
               "DY.navigeer('merken')" in src

    def test_wallet_v1_8_0_unchanged(self):
        """pp-wallet-v1.js v1.8.0 must remain UNCHANGED — its openWallet
        bypass pattern is the reference for the new openMerken bypass."""
        src = WALLET_FILE.read_text()
        assert "VERSION:      '1.8.0'" in src or "VERSION: '1.8.0'" in src
        assert "openWallet" in src

    def test_feedtabs_v60_162_unchanged(self):
        """pp-feedtabs-v1.js (v60.1.162) remains UNCHANGED — it still emits
        the .pp-uitg-kaart cards with openCamp onclick which our patcher
        post-processes."""
        src = FEEDTABS_FILE.read_text()
        assert "pp-uitg-kaart" in src
        assert "openCamp" in src

    def test_only_additive_changes_in_v60_164(self):
        """v60.1.164 must be purely additive: 1 new module file + 1 new
        script tag in index.html + sw.js VERSION bump. No changes to
        brand-portal, wallet, feedtabs, onboarding."""
        # Exactly one script tag for pp-nav-context-v1.js
        assert INDEX_HTML.read_text().count("pp-nav-context-v1.js") == 1
        # sw.js carries v60.1.165 marker (superseded by Phase B; nav-context module still v60.1.164 cache key)
        assert "v60.1.166-20260623-teaser-anchor" in SW_FILE.read_text()


# ─── v60.1.164: ZIP bundle audit for nav-context module ───
class TestNavContextZip:
    def test_zip_contains_nav_context_module(self):
        with zipfile.ZipFile(ZIP_FILE) as z:
            names = z.namelist()
            assert "extensions/profile/pp-nav-context-v1.js" in names, \
                   "ZIP must bundle the new pp-nav-context-v1.js module"
            with z.open("extensions/profile/pp-nav-context-v1.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert "PP_NavContext" in content
        assert "openMerken" in content
        assert "brandLogoFor" in content
        # Capture-phase delegator (3rd arg true)
        assert re.search(r"addEventListener\(\s*['\"]click['\"][\s\S]+?,\s*true\s*\)", content)

    def test_zip_index_html_links_nav_context(self):
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("index.html") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert "pp-nav-context-v1.js?v=60.1.164-nav-context" in content

    def test_zip_sw_has_v60_164_version(self):
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("sw.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert "v60.1.166-20260623-teaser-anchor" in content



# ═══════════════════════════════════════════════════════════════════════════
# v60.1.165 Phase B: Merken Discoverability (Uitgelicht A-Z teaser + Merken
#                    ← Terug knop)
# ═══════════════════════════════════════════════════════════════════════════
MERKEN_DISC = PWA / "extensions/profile/pp-merken-discoverability-v1.js"


class TestMerkenDiscoverability:
    """Static audit of /app/pwa/extensions/profile/pp-merken-discoverability-v1.js"""

    def test_module_file_exists(self):
        assert MERKEN_DISC.exists(), \
            "pp-merken-discoverability-v1.js must exist (Phase B v60.1.165)"

    def test_module_version(self):
        src = MERKEN_DISC.read_text()
        assert "VERSION:" in src and "'1.1.0'" in src, \
            "PP_MerkenDiscoverability.VERSION must be '1.1.0' (v60.1.166)"

    def test_window_export_surface(self):
        src = MERKEN_DISC.read_text()
        assert "window.PP_MerkenDiscoverability" in src, \
            "Must export window.PP_MerkenDiscoverability namespace"
        assert "gotoMerken" in src
        assert "backFromMerken" in src

    def test_letters_array_27_elements(self):
        """LETTERS must be exactly ['0-9','A',...,'Z'] (27 items)."""
        src = MERKEN_DISC.read_text()
        m = re.search(r"LETTERS\s*=\s*'([^']+)'\s*\.split\(','\)", src)
        assert m, "LETTERS const must be defined as comma-joined string .split(',')"
        items = m.group(1).split(",")
        assert len(items) == 27, f"LETTERS must have 27 entries (0-9 + A-Z), got {len(items)}"
        assert items[0] == "0-9", "First LETTERS entry must be '0-9'"
        assert items[-1] == "Z", "Last LETTERS entry must be 'Z'"
        # All A-Z uppercase letters present
        for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
            assert ch in items, f"LETTERS missing uppercase '{ch}'"

    # ─────── injectUitgelichtTeaser (v60.1.166: anchored on Gesponsord header) ───────
    def test_teaser_anchor_is_gesponsord_header(self):
        """v60.1.166: teaser anchor is now the .pp-uitg-header containing the
        h2 'Gesponsord door onze partners' — NOT the .pp-uitg-feed-grid grid."""
        src = MERKEN_DISC.read_text()
        # NEW anchor logic must be present
        assert "querySelectorAll('.pp-uitg-header')" in src, \
            "injectUitgelichtTeaser must iterate document.querySelectorAll('.pp-uitg-header')"
        assert ".pp-uitg-titel" in src, \
            "anchor lookup must query .pp-uitg-titel inside each header"
        assert re.search(r"/Gesponsord door onze partners/i", src), \
            "anchor lookup must match h2 text via /Gesponsord door onze partners/i regex"
        # OLD grid-based logic must be GONE
        assert ".pp-uitg-feed-grid" not in src, \
            "v60.1.166: legacy '.pp-uitg-feed-grid' anchor lookup MUST be removed"
        assert "grid.parentNode.insertBefore" not in src, \
            "v60.1.166: legacy `grid.parentNode.insertBefore` MUST be removed"

    def test_inject_teaser_idempotent_skip(self):
        src = MERKEN_DISC.read_text()
        assert "getElementById(TEASER_ID)" in src, \
            "injectUitgelichtTeaser must skip when teaser already present (idempotency)"

    def test_teaser_inserts_before_gesponsord_header(self):
        """v60.1.166: insertion must use anchor.parentNode.insertBefore(box, anchor)
        — i.e., the teaser is placed EXACTLY above the Gesponsord header block."""
        src = MERKEN_DISC.read_text()
        assert "anchor.parentNode.insertBefore(box, anchor)" in src, \
            "teaser must be inserted via anchor.parentNode.insertBefore(box, anchor)"

    def test_inject_teaser_intro_string_literal(self):
        src = MERKEN_DISC.read_text()
        assert "Ontdek merken die speciaal voor de Tall &amp; Plus Size community ontworpen zijn." in src, \
            "Dutch intro string must be present (escaped &amp; for HTML safety)"

    def test_inject_teaser_27_buttons_data_letter(self):
        src = MERKEN_DISC.read_text()
        # Buttons constructed via LETTERS.map → <button data-letter='X'>
        assert "data-letter=" in src
        assert "LETTERS.map" in src
        # Delegated click handler reads data-letter
        assert "closest('button[data-letter]')" in src
        assert "btn.getAttribute('data-letter')" in src

    def test_inject_teaser_delegated_click_calls_gotoMerken(self):
        src = MERKEN_DISC.read_text()
        # Within the addEventListener handler we must invoke gotoMerken with the letter
        assert re.search(r"gotoMerken\(\s*btn\.getAttribute\(\s*['\"]data-letter['\"]\s*\)\s*\)", src), \
            "delegated click handler must invoke gotoMerken with the data-letter value"

    # ─────── injectMerkenBackBtn ───────
    def test_inject_back_btn_guard_pagina_merken(self):
        src = MERKEN_DISC.read_text()
        assert "DY.pagina !== 'merken'" in src or "DY.pagina!=='merken'" in src, \
            "injectMerkenBackBtn must guard with DY.pagina === 'merken'"

    def test_inject_back_btn_targets_dy_main_bp_page(self):
        src = MERKEN_DISC.read_text()
        assert "querySelector('#dy-main .bp-page')" in src, \
            "back-btn injector must scope to #dy-main .bp-page"

    def test_inject_back_btn_idempotent(self):
        src = MERKEN_DISC.read_text()
        assert "querySelector('#' + BACK_BTN_ID)" in src, \
            "back-btn injector must early-return when button already exists"

    def test_inject_back_btn_inserted_before_header(self):
        src = MERKEN_DISC.read_text()
        assert "querySelector('.bp-header')" in src
        assert "page.insertBefore(btn, header)" in src, \
            "back btn must be inserted BEFORE .bp-header via parent.insertBefore"

    def test_back_btn_dom_attributes(self):
        src = MERKEN_DISC.read_text()
        assert "'merken-back-btn'" in src and "data-testid" in src, \
            "back-btn must carry data-testid='merken-back-btn'"
        assert "&larr;" in src, "back-btn must render '&larr;' (left arrow entity)"
        assert "Terug" in src, "back-btn label must contain 'Terug'"

    def test_back_btn_id_constant(self):
        src = MERKEN_DISC.read_text()
        assert "BACK_BTN_ID" in src and "'pp-merken-back-btn'" in src
        assert "TEASER_ID" in src and "'pp-merken-teaser-uitg'" in src

    # ─────── gotoMerken (NavContext bypass) ───────
    def test_gotoMerken_prefers_PP_NavContext(self):
        src = MERKEN_DISC.read_text()
        # PP_NavContext.openMerken must be attempted first
        ctx_pos = src.find("PP_NavContext.openMerken")
        dy_pos  = src.find("DY.navigeer('merken')")
        assert ctx_pos > 0, "gotoMerken must attempt PP_NavContext.openMerken (Phase A bypass)"
        assert dy_pos  > 0, "gotoMerken must have DY.navigeer('merken') fallback"
        assert ctx_pos < dy_pos, \
            "PP_NavContext.openMerken must be tried BEFORE DY.navigeer('merken') fallback"

    def test_gotoMerken_sessionStorage_prefill(self):
        src = MERKEN_DISC.read_text()
        assert "sessionStorage.setItem('pp-merken-az-prefill'" in src, \
            "selected letter must be stored at sessionStorage['pp-merken-az-prefill']"

    # ─────── backFromMerken (history.back priority) ───────
    def test_backFromMerken_history_first(self):
        src = MERKEN_DISC.read_text()
        hist_pos = src.find("history.back()")
        feed_pos = src.find("DY.navigeer('feed')")
        assert hist_pos > 0, "backFromMerken must invoke history.back() as primary path"
        assert feed_pos > 0, "backFromMerken must fall back to DY.navigeer('feed')"
        assert hist_pos < feed_pos, \
            "history.back() MUST appear BEFORE feed fallback (correct priority)"
        # history.length guard present
        assert "history.length" in src, \
            "must guard history.back() with history.length > 1 check"

    def test_no_direct_feed_routing_as_primary(self):
        """Ensures backFromMerken doesn't hardcode feed routing before history.back()."""
        src = MERKEN_DISC.read_text()
        # Slice from start of backFromMerken to the start of injectUitgelichtTeaser
        start = src.index("function backFromMerken")
        end = src.index("function injectUitgelichtTeaser", start)
        body = src[start:end]
        assert "history.back()" in body and "DY.navigeer('feed')" in body, \
            "backFromMerken must reference both history.back() and DY.navigeer('feed')"
        assert body.index("history.back()") < body.index("DY.navigeer('feed')"), \
            "Inside backFromMerken, history.back() must precede DY.navigeer('feed')"

    # ─────── injectCss ───────
    def test_inject_css_idempotent_and_id(self):
        src = MERKEN_DISC.read_text()
        assert "getElementById('pp-merken-disc-css')" in src, \
            "injectCss must early-return when <style id='pp-merken-disc-css'> already present"
        assert "id = 'pp-merken-disc-css'" in src or "s.id = 'pp-merken-disc-css'" in src

    def test_inject_css_rules_teaser_and_back_btn(self):
        src = MERKEN_DISC.read_text()
        # Teaser styling
        assert "margin:8px 0 18px" in src or "padding:14px 16px" in src, \
            "teaser CSS rule must define margin/padding"
        assert "linear-gradient(" in src, "teaser must use linear-gradient background"
        assert "border:1px solid rgba(212,145,10" in src or "border-radius:14px" in src, \
            "teaser border styling missing"
        # Back-btn styling
        assert "display:inline-flex" in src, "back-btn must use display:inline-flex"
        assert "border-radius:999px" in src, "back-btn must use border-radius:999px (pill)"

    # ─────── Init flow ───────
    def test_init_uses_mutation_observer(self):
        src = MERKEN_DISC.read_text()
        assert "new MutationObserver(" in src
        assert "obs.observe(document.body" in src
        assert "childList: true" in src and "subtree: true" in src, \
            "observer must watch childList+subtree on document.body"

    def test_init_has_setTimeout_500ms(self):
        src = MERKEN_DISC.read_text()
        assert re.search(r"setTimeout\(\s*function[\s\S]+?,\s*500\s*\)", src), \
            "init must call setTimeout(..., 500) as initial injection attempt"

    def test_init_idempotency_guard(self):
        src = MERKEN_DISC.read_text()
        assert "window.__ppMerkenDiscInit" in src, \
            "module must guard with window.__ppMerkenDiscInit to prevent double-init"

    # ─────── index.html & sw.js wiring ───────
    def test_index_html_script_tag(self):
        src = INDEX_HTML.read_text()
        assert "pp-merken-discoverability-v1.js?v=60.1.166-teaser-anchor" in src, \
            "index.html must include pp-merken-discoverability-v1.js with v60.1.165 cache key"

    def test_index_html_script_tag_after_nav_context(self):
        """pp-merken-discoverability-v1.js depends on PP_NavContext (Phase A v60.1.164);
        the script tag must appear AFTER pp-nav-context-v1.js in document order."""
        src = INDEX_HTML.read_text()
        nav_pos  = src.find("pp-nav-context-v1.js")
        disc_pos = src.find("pp-merken-discoverability-v1.js")
        assert nav_pos > 0 and disc_pos > 0
        assert nav_pos < disc_pos, \
            "pp-merken-discoverability-v1.js script tag must come AFTER pp-nav-context-v1.js"

    def test_index_html_only_one_script_tag(self):
        src = INDEX_HTML.read_text()
        assert src.count("pp-merken-discoverability-v1.js") == 1, \
            "index.html must include the new module exactly once"

    def test_sw_version_bumped_v60_165(self):
        src = SW_FILE.read_text()
        assert "v60.1.166-20260623-teaser-anchor" in src, \
            "sw.js VERSION must be bumped to v60.1.166-20260623-teaser-anchor"


# ─── v60.1.165 REGRESSION: legacy files MUST be UNCHANGED ───
class TestPhaseBRegressionUnchanged:
    def test_brand_portal_renderMerken_intact(self):
        src = BRAND_PORTAL.read_text()
        assert "BP.renderMerken" in src, \
            "brand-portal-v1.js must still define BP.renderMerken (legacy preserved)"

    def test_brand_portal_no_back_button_added(self):
        """Phase B MUST NOT modify brand-portal-v1.js to add a back button —
        the back button is injected via the new module's MutationObserver."""
        src = BRAND_PORTAL.read_text()
        assert "pp-merken-back-btn" not in src, \
            "brand-portal-v1.js must NOT reference pp-merken-back-btn (legacy untouched)"

    def test_feedtabs_unchanged_uitg_grid(self):
        src = FEEDTABS_FILE.read_text()
        # The new module hooks .pp-uitg-feed-grid emitted by pp-feedtabs
        assert ".pp-uitg-feed-grid" in src, \
            "pp-feedtabs-v1.js must still emit .pp-uitg-feed-grid (untouched)"
        # And it must NOT contain the new teaser/back ids
        assert "pp-merken-teaser-uitg" not in src
        assert "pp-merken-back-btn" not in src

    def test_nav_context_phase_a_unchanged(self):
        src = NAV_CONTEXT.read_text()
        assert "PP_NavContext" in src
        assert "openMerken" in src
        # No back-btn / teaser logic leaked into Phase A module
        assert "pp-merken-teaser-uitg" not in src
        assert "pp-merken-back-btn" not in src

    def test_wallet_unchanged(self):
        src = WALLET_FILE.read_text()
        assert "B2B_ALLOWED_AMOUNTS" in src, \
            "pp-wallet-v1.js untouched in Phase B (still has B2B amounts)"
        assert "pp-merken-teaser-uitg" not in src

    def test_phase_b_additive_only_in_index_html(self):
        src = INDEX_HTML.read_text()
        # Exactly one new script tag, no rewrite of other tags
        assert src.count("pp-merken-discoverability-v1.js") == 1
        # Phase A v60.1.164 nav-context tag still at its existing key
        assert "pp-nav-context-v1.js?v=60.1.164-nav-context" in src


# ─── v60.1.165 ZIP bundle audit ───
class TestMerkenDiscZip:
    EXPECTED_MD5 = "140eb3aa24ecc4145e755b0aedf9d95f"

    def test_zip_md5(self):
        import hashlib
        h = hashlib.md5(ZIP_FILE.read_bytes()).hexdigest()
        assert h == self.EXPECTED_MD5, \
            f"ZIP MD5 mismatch: expected {self.EXPECTED_MD5}, got {h}"

    def test_zip_bundles_new_module(self):
        with zipfile.ZipFile(ZIP_FILE) as z:
            names = z.namelist()
            assert "extensions/profile/pp-merken-discoverability-v1.js" in names, \
                "ZIP must bundle the new pp-merken-discoverability-v1.js module"
            with z.open("extensions/profile/pp-merken-discoverability-v1.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        # Required literals from the request
        assert "PP_MerkenDiscoverability" in content
        assert "pp-merken-teaser-uitg" in content
        assert "pp-merken-back-btn" in content
        assert "Ontdek merken" in content

    def test_zip_index_html_links_new_module(self):
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("index.html") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert "pp-merken-discoverability-v1.js?v=60.1.166-teaser-anchor" in content

    def test_zip_sw_version_v60_165(self):
        with zipfile.ZipFile(ZIP_FILE) as z:
            with z.open("sw.js") as f:
                content = f.read().decode("utf-8", errors="ignore")
        assert "v60.1.166-20260623-teaser-anchor" in content

    def test_zip_still_contains_nav_context_phase_a(self):
        """Phase B did NOT remove Phase A — nav-context module must still be present."""
        with zipfile.ZipFile(ZIP_FILE) as z:
            names = z.namelist()
            assert "extensions/profile/pp-nav-context-v1.js" in names
