# Paskamer Praat — Fixes pack (8 juni 2026)

Deze build bevat alle 5 quick wins uit de PWA‑scan.

## ✅ 1. Hero image — alt + AVIF/WebP/PNG met `<picture>`
- **Files gewijzigd:** `js/pwa-v463-1780765770.js` (lines ~2143–2150)
- **Nieuwe assets:**
  - `hero-model-480.avif` (29 KB) · `hero-model-800.avif` (65 KB) · `hero-model-1024.avif` (100 KB)
  - `hero-model-480.webp` (34 KB) · `hero-model-800.webp` (77 KB) · `hero-model-1024.webp` (118 KB)
  - Originele `hero-model.png` (226 KB) blijft als fallback
- Hero image heeft nu een betekenisvolle **`alt`**, `width`/`height` (geen CLS), `decoding="async"` en houdt `fetchpriority="high"`.

**Verwachte LCP‑winst op mobiel:** 226 KB PNG → 29 KB AVIF (~87% minder bytes).

## ✅ 2. Onboarding modal — niet langer agressief
- **File gewijzigd:** `js/pwa-v463-1780765770.js` rondom `// Onboarding overlay voor gasten`
- Modal verschijnt nu pas **na 25 s op de pagina** of **bij scroll‑diepte > 40%** (wat eerst komt).
- Sluiten ("Doorgaan zonder account") slaat dismissal **30 dagen** op in `localStorage` (`dy_overlay_dismissed_until`).
- Voorkomt Google's *intrusive interstitial* penalty op mobiele SERP.

## ✅ 3. Manifest — screenshots + maskable icon
- **Files:** `manifest.json` (overschreven), nieuwe assets:
  - `screenshot-narrow.jpg` 720×1280 (`form_factor: narrow`)
  - `screenshot-wide.jpg` 1280×720 (`form_factor: wide`)
  - `icons/icon-maskable-512.png` (dedicated maskable met 20% safe‑zone)
  - `icons/apple-touch-icon-180.png` (Apple's preferred 180×180)
- Manifest gebruikt nu **één maskable icon** (correct gepad), en **één apart `any` icon set**.
- Android Chrome toont nu de rijke install‑prompt met screenshot‑carousel ipv standaard banner.
- **Bonus:** `<html lang="nl">` → `<html lang="nl-NL"></html>` (consistent met manifest).
- **Bonus:** `apple-touch-icon` 180×180 toegevoegd voor iOS.

## ✅ 4. Firebase compat → modular migratie
- **File:** `FIREBASE_MIGRATION.md` (volledig stappenplan).
- Bevat zoek‑vervang tabel, voor/na code, CSP‑update en een pragmatisch tussenstap (compat v11.0.2 — ~30–50 KB winst zonder code changes).
- **Niet automatisch toegepast** omdat dit 25k regels code raakt; doe dit in een aparte sprint met testdekking.

## ✅ 5. Service worker — runtime caching
- **File:** `sw.js` (overschreven, v21).
- Strategieën per resource type:
  - **HTML / navigaties:** network‑first met 3 s timeout → altijd verse content na deploy, maar offline fallback uit cache.
  - **Versioned JS (`/js/*-v*.js`):** cache‑first, immutable.
  - **CSS + Google Fonts:** stale‑while‑revalidate.
  - **Images (eigen + lh3.googleusercontent.com avatars):** cache‑first, LRU max 60 entries.
  - **Firebase / Firestore / Storage / Anthropic / Workers:** **network‑only** (zoals het hoort).
- Veilig i.c.m. je versioned filenames (`pwa-v463-1780765770.js`) — nieuwe deploy = nieuwe filename = automatisch nieuwe fetch.
- Push notifications + `SKIP_WAITING` behouden. Extra `CLEAR_CACHES` message handler toegevoegd voor noodgevallen.

## 🎁 Bonus
- **HSTS header** toegevoegd in `_headers`: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.

## Deploy checklist

1. Upload alle files in deze zip naar je Cloudflare Pages / hosting.
2. Forceer een hard refresh op je dev‑device: in DevTools → Application → Service Workers → **Unregister**, dan F5.
3. Controleer in DevTools:
   - **Network → manifest.json** geeft 200, geen 304 met oude content.
   - **Application → Manifest** toont nu 2 screenshots en `icons[].purpose: maskable` aparte entry.
   - **Application → Service Workers** toont `v21-20260608` als actief.
   - **Network** filter op `Img` → hero komt als `.avif` op een AVIF‑capable browser.
4. Test op een echt mobiel device:
   - Eerste bezoek: GEEN modal binnen 5 s, wel na scrollen of 25 s wachten.
   - Sluit met "Doorgaan zonder account" → 30 dagen niet meer zien.
   - Add to homescreen → install‑prompt met screenshots.
5. Run **Lighthouse** opnieuw, vergelijk Performance + LCP + Best Practices score.

## Verwachte impact

| Metric | Voor | Na (verwacht) |
|---|---|---|
| LCP (mobiel 4G) | ~1.6 s | ~0.7 s |
| Total page weight | 221 KB | ~80 KB |
| Lighthouse Best Practices | ~83 | ~95 |
| Lighthouse PWA installability | 7/10 | 10/10 |
| Mobile bounce rate (modal) | ↑ | ↓ |
| Returning visitor TTI | ~1.2 s | ~0.3 s (uit cache) |
