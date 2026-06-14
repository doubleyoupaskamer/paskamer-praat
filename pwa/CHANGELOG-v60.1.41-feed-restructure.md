# v60.1.41 — Feed Card/Overlay Menu Restructure

## Doel
Gecontroleerde herschikking knopstructuur. **Geen redesign, geen logica wijziging — alleen UI-verplaatsingen + verwijderingen.**

## Wijzigingen

### Feed kaart (DY.verhaalKaart, ~r4750)
- ❌ **Verwijderd**: Delen-knop (papieren vliegtuig)
- ❌ **Verwijderd**: Rapporteren-knop (cirkel met uitroepteken)
- ❌ **Verwijderd via patch**: Outfit Analyse-knop (ster) — was injected
- ❌ **Verwijderd via patch**: Opslaan-knop (bookmark) — was injected
- ✅ **Behouden**: Like-knop, Direct Message-knop (volgorde: Like boven Bericht)

### Feed overlay (DY.toonVerhaalPopup, ~r5292)
- ❌ **Verwijderd**: Deel-knop uit acties-rij
- ❌ **Verwijderd**: Rapporteren-knop uit acties-rij
- ❌ **Verwijderd**: Delen-knop uit topnav
- ❌ **Verwijderd**: "Klik hier voor een outfit analyse" trigger button (wrapper + panel blijven voor result-rendering)
- ❌ **Verwijderd via patch**: Opslaan-knop injectie in actie-rij
- ✅ **Behouden**: Like-knop, Reageer-knop (volgorde: Like boven Reageer)

### Card-hub popover (extra-menu-v3.js)
- ❌ **Verwijderd**: "Vraag style score" item
- ✅ **Toegevoegd**: "Outfit analyse" item (zelfde positie als score had)
- ✅ **Behouden**: Probeer aan, Deel deze look, Bewaar, Vergelijkbaar zoeken, AI Style Assistent, Notificaties, Verberg, Rapporteren, Blokkeer

### Card-actions handler (card-actions-v1.js)
- ✅ **Toegevoegd**: `outfit_analyse(kaart)` handler — leest docId + foto uit kaart-DOM, roept bestaande `DY._feedOutfitReview(docId, foto)` aan
- ✅ **Behouden**: alle bestaande handlers (tryon, score, share, bewaar, similar, verberg, report, block)

## Behouden functionaliteit (verified via code inspectie)
- `DY.deelVerhaal()` blijft intact (gebruikt door popover share-actie)
- `DY._toonMeldModalFromEl()` blijft intact (gebruikt door popover report-actie)
- `DY._toonBookmarkSheet()` blijft intact (gebruikt door popover bewaar-actie)
- `DY._feedOutfitReview()` aangepast: werkt nu zonder triggerBtn (alleen op panelEl wachten)
- `DY.toonAIAnalyse()` ongewijzigd
- `DY.laadBookmarkStatus()` + `DY._updateBookmarkBtns()` blijven actief voor popover-state sync
- Like / Reageer / DM API-calls ongewijzigd
- Bookmark Firestore queue / state ongewijzigd
- Analytics / events ongewijzigd

## Risico's / regressies geverifieerd
- Node `--check` op alle 3 gewijzigde bestanden: ✅
- Geen verwijderde handlers/imports/utilities — alleen UI-elementen verwijderd
- Backwards-compat: `dy-ai-trigger` listener block in patch blijft (no-op als element niet bestaat)

## Files
- `/app/pwa/js/pwa-v463-1780765770.js` — 5 edits
- `/app/pwa/js/extra-menu-v3.js` — 1 edit (score → outfit_analyse)
- `/app/pwa/js/card-actions-v1.js` — 1 edit (add outfit_analyse handler)
- `/app/pwa/index.html` — cache `?v=60.1.41-feed-restructure`
- `/app/pwa/sw.js` — VERSION bumped
