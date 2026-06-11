# v60.1.10 — Separation of Duties (Self-Approval Block)

## 🔴 Kritieke security fix
Een admin (of in geval van foutieve rules: een gebruiker) kon z'n eigen merkaanvraag goedkeuren. Dit is een **separation-of-duties violation** en is nu volledig geblokkeerd op **drie lagen**.

## Wat is er gewijzigd?

### Laag 1 — Firestore Rules (server-side, échte beveiliging)

`/brands/{brandId}` update:
```
allow update: if (
  isBrandOwner(brandId)
  && !(diff.affectedKeys().hasAny(['status','moderatedBy','moderatedAt',
                                    'goedgekeurdAt','afgekeurdReden','suspendReden']))
) || (
  isAdmin()
  && request.auth.uid != brandId   // ← NIEUW: admin kan eigen status niet wijzigen
);
allow delete: if isAdmin() && request.auth.uid != brandId;
```

`/campaigns/{campaignId}` update:
```
allow update: if (
  brand-owner constraints
) || (
  isAdmin()
  && resource.data.brandId != request.auth.uid   // ← NIEUW
);
allow delete: if isAdmin() && resource.data.brandId != request.auth.uid;
```

### Laag 2 — UI (defense in depth)

In `renderAdminBrands`:
- Voor elke merkrij waar `b.id === DY.user.uid` worden de knoppen **Goedkeuren / Afwijzen / Blokkeer** weggelaten
- In plaats daarvan een grijze badge: **"⚠ Eigen aanvraag — vereist tweede admin"**

In `renderAdminCampagnes`:
- Idem voor campagnes waar `c.brandId === DY.user.uid`
- Knoppen Goedkeur/Pauzeer/Hervat/Beëindig/Budget worden weggelaten
- Badge: **"⚠ Eigen campagne — vereist tweede admin"**

### Laag 3 — JS Guards (UX feedback voor de admin)

In `BP.adminBrand`:
```js
if (brandId === uid()) {
  toast('Je mag je eigen merkaanvraag niet modereren. Vraag een tweede admin om dit te beoordelen.', true);
  return;
}
```

In `BP.adminCamp` en `BP.adminCampBudget`:
```js
var docSnap = await DY.db.collection('campaigns').doc(id).get();
if (docSnap.exists && docSnap.data().brandId === uid()) {
  toast('Je mag je eigen campagne niet modereren. Vraag een tweede admin.', true);
  return;
}
```

## Permissie-matrix (volledige audit)

| Actie | Guest | Gebruiker | Brand-owner | Admin (anderen) | Admin (eigen) |
|---|:-:|:-:|:-:|:-:|:-:|
| Brand registreren | ❌ | ✅ | ✅ | ✅ | ✅ |
| Eigen brand-profiel updaten (NIET status) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Brand-status wijzigen (approve/reject/suspend) | ❌ | ❌ | ❌ | ✅ | **❌** ← NIEUW |
| Brand verwijderen | ❌ | ❌ | ❌ | ✅ | **❌** ← NIEUW |
| Campagne aanmaken (eigen) | ❌ | ❌ | ✅ (approved) | ✅ | ✅ |
| Campagne approve naar live | ❌ | ❌ | ❌ | ✅ | **❌** ← NIEUW |
| Campagne pauzeren/hervatten | ❌ | ❌ | ✅ (own→paused) | ✅ | **❌** ← NIEUW |
| Campagne budget wijzigen | ❌ | ❌ | ❌ | ✅ | **❌** ← NIEUW |
| Brand admin log lezen | ❌ | ❌ | ❌ | ✅ | ✅ |

Alle bovenstaande regels worden **server-side** afgedwongen door Firestore Rules. Frontend respecteert ze ook, maar zelfs als iemand de frontend bypasst (DevTools console), blokkeert Firestore de write.

## Rol-definities

- **`DY._isAdmin()`** (frontend): `DY.user.email in ['williamdevriesis@gmail.com']`
- **Firestore `isAdmin()`** (backend): `request.auth.uid == 'ahtVa6qvFheIy3yDVpDXCz2INwq1' || exists(admin_access/{uid})`

⚠️ **Aanbeveling**: zorg dat deze twee identiek zijn. Als je `williamdevriesis@gmail.com` correct hebt geconfigureerd als UID `ahtVa6qvFheIy3yDVpDXCz2INwq1`, klopt het. Anders krijg je dat de UI knoppen toont die Firestore vervolgens weigert (UX-issue, geen security-issue).

## Acceptatiecriteria

✅ Gebruiker kan nooit eigen aanvraag goedkeuren (UI + JS + Firestore Rules blokkeren alle 3)
✅ Admin kan z'n eigen aanvraag NIET goedkeuren (separation of duties — server-side geforceerd)
✅ Admin ziet duidelijke melding waarom z'n eigen aanvraag niet goedkeurbaar is
✅ Rollen werken correct (zie matrix hierboven)
✅ Geen JS errors (`node --check` OK)
✅ Geen Firestore rules regressies (alleen `brands` + `campaigns` aangepast)

## Deployment
1. Download ZIP: `paskamerpraat-pwa-v60.1.10-brand-portal.zip`
2. Upload naar Cloudflare Pages
3. **CRITICAL**: deploy nieuwe Firestore rules: `firebase deploy --only firestore:rules`
4. Test door zelf in te loggen als admin, een brand te registreren, en te proberen 'm goed te keuren → UI toont de "vereist tweede admin" badge en alle knoppen zijn weg
