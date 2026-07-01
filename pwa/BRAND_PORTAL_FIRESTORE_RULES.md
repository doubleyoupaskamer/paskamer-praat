# Firestore Security Rules Brand Portal v1 (ADDITIEF)

Voeg de onderstaande regels toe aan je bestaande `firestore.rules` (v10), **vóór de afsluitende `}` van `match /databases/{database}/documents`**.

**Niets aan bestaande regels wijzigen.** Deze toevoeging is volledig additief.

```javascript
    // ══════════════════════════════════════════════════════════════════
    // BRAND PORTAL v1 additieve regels (geen impact op bestaande paden)
    // ══════════════════════════════════════════════════════════════════

    // ── Helpers brand-portal ──────────────────────────────────────────
    function isApprovedBrand(brandId) {
      return isIngelogd()
        && request.auth.uid == brandId
        && exists(/databases/$(database)/documents/brands/$(brandId))
        && get(/databases/$(database)/documents/brands/$(brandId)).data.status == 'approved';
    }
    function isBrandOwner(brandId) {
      return isIngelogd() && request.auth.uid == brandId;
    }

    // ── BRANDS ────────────────────────────────────────────────────────
    // Document-id == owning user uid (1 brand-account per user)
    match /brands/{brandId} {
      // Goedgekeurde merken zijn publiek leesbaar (voor /merken pagina).
      // Pending/rejected merken kunnen alleen door eigenaar of admin gelezen worden.
      allow read: if (resource.data.status == 'approved')
                  || isBrandOwner(brandId)
                  || isAdmin();

      // Eigenaar mag eigen brand-doc aanmaken (status moet pending zijn) of bijwerken
      // (behalve status, dat is admin-only).
      allow create: if isBrandOwner(brandId)
                    && request.resource.data.status == 'pending';
      allow update: if (
                      // Eigenaar mag eigen profielvelden updaten NIET status
                      isBrandOwner(brandId)
                      && !(request.resource.data.diff(resource.data).affectedKeys()
                            .hasAny(['status','moderatedBy','moderatedAt',
                                     'goedgekeurdAt','afgekeurdReden','suspendReden']))
                    ) || isAdmin();
      allow delete: if isAdmin();
    }

    // ── BRAND_PRODUCTS ────────────────────────────────────────────────
    match /brand_products/{productId} {
      // Actieve producten zijn publiek leesbaar; concept/verwijderd alleen owner+admin
      allow read: if resource.data.status == 'actief'
                  || (isIngelogd() && resource.data.brandId == request.auth.uid)
                  || isAdmin();

      allow create: if isApprovedBrand(request.resource.data.brandId)
                    && request.resource.data.brandId == request.auth.uid;

      allow update: if (
                      isIngelogd()
                      && resource.data.brandId == request.auth.uid
                      && request.resource.data.brandId == request.auth.uid
                    ) || isAdmin();

      allow delete: if isAdmin();
    }

    // ── CAMPAIGNS ─────────────────────────────────────────────────────
    match /campaigns/{campaignId} {
      // Live campagnes publiek leesbaar (voor rendering in app), overige alleen
      // owner + admin
      allow read: if (resource.data.status == 'live')
                  || (isIngelogd() && resource.data.brandId == request.auth.uid)
                  || isAdmin();

      allow create: if isApprovedBrand(request.resource.data.brandId)
                    && request.resource.data.brandId == request.auth.uid
                    && (request.resource.data.status == 'draft'
                        || request.resource.data.status == 'review');

      // Brand mag eigen velden updaten maar NIET goedkeuren naar 'live' of
      // moderator-velden zetten (admin-only).
      allow update: if (
                      isIngelogd()
                      && resource.data.brandId == request.auth.uid
                      && request.resource.data.brandId == request.auth.uid
                      && !(request.resource.data.diff(resource.data).affectedKeys()
                            .hasAny(['moderatedBy','moderatedAt','impressies','clicks','spend','omzet']))
                      && (request.resource.data.status == 'draft'
                          || request.resource.data.status == 'review'
                          || request.resource.data.status == 'paused')
                    ) || isAdmin();

      allow delete: if isAdmin();
    }

    // ── CAMPAIGN_EVENTS (append-only impressie/click log) ─────────────
    match /campaign_events/{eventId} {
      // Iedereen mag een event loggen (impressie/click) write-only voor users.
      // Lezen alleen admin (en de eigenaar via de campagne-aggregaten).
      allow read:   if isAdmin();
      allow create: if request.resource.data.keys().hasAny(['type'])
                    && request.resource.data.type in ['impression','product_click','campaign_click'];
      allow update: if false;
      allow delete: if isAdmin();
    }

    // ── BRAND_ADMIN_LOG (audit log) ───────────────────────────────────
    match /brand_admin_log/{logId} {
      allow read:   if isAdmin();
      // Iedereen ingelogde mag eigen events loggen (registratie, campaign-events
      // door owner). Server-side validatie via cloud function later.
      allow create: if isIngelogd();
      allow update: if false;
      allow delete: if isAdmin();
    }
```

---

## Firebase Storage rules additie

Voeg toe aan je `storage.rules` (binnen `match /b/{bucket}/o`):

```javascript
    // Brand-logo's en product-images: alleen eigenaar mag uploaden, iedereen mag lezen
    match /brands/{uid}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null
                   && request.auth.uid == uid
                   && request.resource.size < 3 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }
    match /brand_products/{uid}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null
                   && request.auth.uid == uid
                   && request.resource.size < 3 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }
```

---

## Firestore Indexes aanbevolen (niet verplicht)

Maak in Firebase Console → Indexes onderstaande composite indexes aan:

| Collectie | Velden | Order |
|---|---|---|
| `brand_products` | `brandId` (asc), `aangemaakt` (desc) | |
| `brand_products` | `brandId` (asc), `status` (asc) | |
| `campaigns` | `brandId` (asc), `aangemaakt` (desc) | |
| `brands` | `status` (asc), `aangemaakt` (desc) | |

Firebase Console toont automatisch een "create index"-link als een query een ontbrekende index nodig heeft je kunt ook gewoon één query uitvoeren en op die link klikken.

---

## Deployment

```bash
firebase deploy --only firestore:rules,storage
```

## Rollback

Als je terug wilt naar v10 zonder brand portal:
1. Verwijder de brand-portal blok uit `firestore.rules`
2. `firebase deploy --only firestore:rules,storage`
3. In de PWA: `localStorage.setItem('dy_brand_portal','0')` schakelt de UI uit
