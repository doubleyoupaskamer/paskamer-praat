# Placements System pp-placements-v1.js

## Wat het is
Centrale helper-module om campaign-plaatsingen te gaten zonder bestaande
brand-portal code te wijzigen.

## Hoe te integreren (NIET-INVASIEF)
Voeg ÉÉN regel toe aan `/app/pwa/index.html` (vóór sluitende `</body>`):

```html
<script defer src="/extensions/placements/pp-placements-v1.js?v=1.0.0"></script>
```

Daarna is `window.PP_Placements` globaal beschikbaar.

## API

```js
// Per-user check
if (PP_Placements.isPlacementEnabled(user, 'stories')) {
  renderStoriesRing(user);
}

// Global check (zonder user)
if (PP_Placements.isPlacementActive('ai_assist')) {
  loadAiAssistant();
}

// Filter campaign-array op user's enabled placements
var visibleCamps = PP_Placements.filterByEnabledPlacements(allCampaigns, currentUser);

// Lijst alle placements
PP_Placements.getAllPlacements();
// → ['feed', 'stories', 'outfit_review', 'ai_assist', 'similar_items']
```

## Auto-subscribe
Wanneer Firebase al is geïnitialiseerd voor de script load, abonneert de
helper zich automatisch op `admin_settings/global.placements_enabled` voor
real-time updates. Bij latere init: roep handmatig
`PP_Placements.subscribeAdminPlacements(firebase.firestore())`.

## Backward compatibility
- `user.plaatsingen` ontbreekt → alle placements aan (huidig gedrag)
- `user.plaatsingen` lege array → alle aan (sane default)
- `admin_settings.placements_enabled.X` ontbreekt → placement actief
- Bestaande campaign queries blijven werken placement filtering is opt-in
