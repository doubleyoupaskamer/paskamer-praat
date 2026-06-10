# Paskamer Praat — v46 Growth + Retention + UX Bundle (FULL)

**Datum:** 2026-02-13
**Type:** v44 + v45 + v46 in één pakketje. Non-invasief. `pwa-v463-*.js` NIET aangepast.

## Wat is nieuw in v46

### 1. Affiliate auto-tagger (`js/affiliate-tagger-v1.js`)
- Detecteert outbound links naar Zalando, Bol, AboutYou, Wehkamp, H&M, ASOS, Omoda, Sacha, Zara
- Voegt automatisch jouw affiliate-tag toe (idempotent — bewaart originele href)
- Logt elke click naar Firestore `kai_events` collection (`eventType: 'affiliate_click'`)
- Werkt ook op links die later dynamisch in feed-cards verschijnen (MutationObserver)
- **Configureerbaar** via `window.DY.affiliateConfig` — overschrijf default params/values:
  ```js
  window.DY.affiliateConfig = {
    enabled: true,
    networks: {
      'zalando.nl': { param: 'wmc', value: 'PASKAMERPRAAT_XYZ' },
      'bol.com':    { param: 'Referrer', value: 'PASKAMERPRAAT' }
      // ... etc
    }
  };
  ```
  Plaats deze snippet in `index.html` BOVEN `affiliate-tagger-v1.js` of in een eigen script.
- **TODO voor jou:** vervang de placeholder waarden (`PASKAMERPRAAT`) door je echte affiliate IDs van Awin/PartnerStack/Tradedoubler.

### 2. Web Vitals tracker (`js/web-vitals-v1.js`)
- Captured LCP, INP, CLS, FCP, TTFB via PerformanceObserver
- Verzendt 1 beacon per sessie naar `kai_events` (`eventType: 'web_vitals'`) op `visibilitychange:hidden` / `pagehide` / 12s timer
- Werkt ook zonder Firebase (debug log naar console)
- Public API: `DY.vitals.current()`, `DY.vitals.flush()`
- **Dashboard tip:** filter Firestore op `eventType == 'web_vitals'` voor je perf-trend over tijd

### 3. Skeleton loaders + Retry toast (`js/skeletons-v1.js`)
- Toont skeleton-cards in feed als content > 1.5s uitblijft
- Auto-removed zodra echte feed-cards verschijnen (MutationObserver)
- Safety: na 30s sowieso opruimen
- **Public API:** `DY.retryToast.show(callback, 'Even niet gelukt')`
  - Toast met "Opnieuw" knop, auto-hide na 8s, één tegelijk
  - Te gebruiken in jouw API call sites bij `.catch()`

### 4. Custom Add-to-Home-Screen prompt (`js/a2hs-prompt-v1.js`)
- **Android/Desktop:** vangt `beforeinstallprompt` → eigen on-brand bottom sheet "Installeer Paskamer Praat"
- **iOS:** toont instructie modal ("Tik op delen → Voeg toe aan beginscherm")
- Verschijnt 8s na page-load
- Dismiss onthouden in localStorage voor 14 dagen
- Niet getoond als app al standalone draait
- Public API: `DY.a2hs.forceShow()`, `DY.a2hs.resetDismiss()`, `DY.a2hs.isStandalone()`

### 5. Cache-buster bump → v46
- Alle `?v=45` → `?v=46`
- `sw.js VERSION = 'v46-20260213-growth-retention-vitals-affiliate'`

## Wat zit ook in deze bundle (van v44 + v45)

| Versie | Feature | File |
|---|---|---|
| v44 | Offline fallback pagina | `offline.html` + `sw.js` |
| v44 | Image lazy-loading | `js/lazy-images-v1.js` |
| v44 | Network status toast | `js/network-status-v1.js` |
| v44 | Background Sync queue | `js/bg-sync-v1.js` |
| v44 | Hero preload + Anthropic preconnect | `index.html` |
| v45 | Global error boundary | `js/error-boundary-v1.js` |
| v45 | Zoek-mijnmaat race + retry-cap fix | `js/zoek-mijnmaat-v1.js` |
| v45 | extra-menu nuker timer leak fix | `js/extra-menu-v3.js` |
| v45 | Lazy-images observer scope fix | `js/lazy-images-v1.js` |
| v45 | Inline nuker timer leak fix | `index.html` |

## Bestanden in deze ZIP (flat root)

```
index.html
sw.js
offline.html
CHANGELOG-v46.md
js/
  ├─ error-boundary-v1.js       (v45)
  ├─ lazy-images-v1.js          (v44/v45)
  ├─ network-status-v1.js       (v44)
  ├─ bg-sync-v1.js              (v44)
  ├─ affiliate-tagger-v1.js     (v46 ★)
  ├─ web-vitals-v1.js           (v46 ★)
  ├─ skeletons-v1.js            (v46 ★)
  ├─ a2hs-prompt-v1.js          (v46 ★)
  ├─ extra-menu-v3.js           (v45)
  └─ zoek-mijnmaat-v1.js        (v45)
```

> Niet meegestuurd (gelijk aan productie v43): `pwa-v463-*.js`, `firebase-*.js`, `dsp-*.js`, `dy-tracking.js`, `dy-presence.js`, `admin-logic-v177.js`, `share-target-v1.js`, `sw-auto-update-v1.js`, `ai-fit-chat-v3.js`, `push-notifications-v3.js`, `app-badge-v1.js`, `composer-autosave-v1.js`. **Upload alleen wat in deze ZIP zit.**

## Smoke test (uitgevoerd)

```
{
  "affiliate": true,      "vitals": true,
  "skeletons": true,      "retryToast": true,
  "a2hs": true,           "errors": true,
  "netStatus": true,      "bgSync": true,
  "extraMenu": true,      "errCount": 0,
  "vitalsCurrent": { "lcp": 364, "fcp": 364, "ttfb": 137, "cls": 0 },
  "affiliateNetworks": 11
}
JS PAGEERRORS: 0
unhandled: []
```

Alle 9 publieke API's actief. 0 fouten. ✅

## Upload instructie

1. Upload **alleen** de bestanden in deze ZIP — overschrijf bestaande.
2. **Niet** `pwa-v463-*.js` aanraken.
3. Na deploy → open `/vernieuw.html` één keer op test-device → forceert SW purge.
4. Verifieer DevTools → Application → SW status `pp-static-v46-…`.

## Wat ik NIET kon afmaken in deze v46 (heb input van je nodig)

| Feature | Wat ik nodig heb |
|---|---|
| **Echte affiliate IDs** | Je daadwerkelijke partner-ID's per netwerk (Awin/PartnerStack). Nu staan placeholders. |
| **Premium tier (Stripe)** | Stripe Publishable key + keuze: per-AI-call paywall of maandabonnement |
| **Virtual Try-On (Gemini)** | Backend endpoint (FastAPI of Firebase Function) die Nano Banana aanroept; ik kan client + backend bouwen als je Gemini API key + hosting deelt |
| **Guest AI Chat backend** | Keuze: Firebase Anonymous Auth (1 klik) vs publieke Firestore rules op `kai_chats` |
