# v60.1.34 — Homepage Hero Overlay Fix

## Problem
- Desktop: hero layout was broken — the previous "magazine cover" attempt placed the content panel before the mobile-first base styles, so `.dy-hm-hero-content { max-width: 480px; }` overrode the desktop override (last rule wins in CSS), squeezing content into a tiny column.
- Mobile: tekst over de foto ("Tall, Plus & Inclusieve Mode") had te weinig contrast met heldere stukken van de afbeelding (huid/lucht), waardoor de tekst wegviel.
- Bonus bug: duplicate text rendered both in `.dy-hm-hero-text-overlay` AND `.dy-hm-hero-text-desktop` (no CSS hid one), causing double titel/sub on mobile and desktop.

## Fix
**app.css**
- Removed broken magazine-style desktop block (was placed before base styles → cascade lost).
- New desktop block placed AFTER mobile base styles (~line 11205) so overrides actually apply.
- Desktop hero: 16:10 aspect ratio image with text-overlay (eyebrow + titel + sub) at bottom and dark gradient for legibility. CTAs panel below in normal column flow within the existing `.dy-main` app-frame (680–1000px).
- Mobile text-overlay: strengthened bottom gradient (0.45 → 0.97 alpha) and added explicit `text-shadow` on eyebrow, titel and sub for guaranteed contrast on any photo region.
- `.dy-hm-hero-text-desktop { display: none; }` added as a base rule (HTML duplicate is now always hidden; overlay is the single source of truth for hero text).

## Files touched
- `/app/pwa/app.css` — hero CSS only (lines ~11081 and ~11205)
- `/app/pwa/index.html` — bumped `?v=` to `60.1.34-hero-overlay-fix`
- `/app/pwa/sw.js` — bumped `VERSION` to `v60.1-20260214-brand-portal-v1.34-hero-overlay-fix`

## Verification
- Desktop 1440×900: hero binnen `.dy-main` frame (~1000px max), tekst-overlay leesbaar, CTA's onder.
- Mobile 390×844: foto vol-breed met sterke gradient, tekst goed contrasterend.
- Geen JS aanpassingen (HTML structuur ongewijzigd).
