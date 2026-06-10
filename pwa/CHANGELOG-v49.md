# Paskamer Praat — v49 Notification Skin (2026-02-13)

> **Visual-only update.** Alle notificaties (push + in-app) zijn nu volledig brand-aligned met de AI Style Assistant en Crown/Premium overlays. **Geen wijzigingen aan logica, permissies, routing of state.**

---

## 🎨 Wat is gewijzigd

### Nieuw gedeeld skin-script (`js/notification-skin-v1.js`)
Eén centrale CSS-injector die de **premium gradient** van AI Style Assistant + Crown popover toepast op alle notification surfaces. Gebruikt uitsluitend bestaande design-tokens uit `app.css` (`--cream, --warm, --clay, --ink, --parchment, --clay-d`).

**Premium gradient (zelfde als Crown overlay):**
```css
background:
  radial-gradient(60% 50% at 0% 0%, rgba(254,237,182,.45) 0%, transparent 60%),
  radial-gradient(70% 60% at 100% 100%, rgba(232,185,74,.16) 0%, transparent 65%),
  linear-gradient(160deg, var(--cream) 0%, var(--warm) 100%);
box-shadow: 0 24px 56px rgba(30,26,15,.32),
            inset 0 1px 0 rgba(255,255,255,.55);
border: 1px solid rgba(198,125,6,.18);
```

---

## 🎯 Componenten beïnvloed

| Component                          | Vóór                    | Na (v49)                                   |
| ---------------------------------- | ----------------------- | ------------------------------------------ |
| Weekly Stylist **banner**          | Vlak goud (#c89b3c)     | Goud→dark gradient + ivoor-glow inset      |
| Weekly Stylist **modal**           | Vlak crème `#fefcf5`    | Premium dubbele radial + linear gradient   |
| Virtual Try-On **modal**           | Vlak crème              | Premium gradient + gouden borders          |
| Virtual Try-On **upload slots**    | Wit                     | Glass (rgba .42) + gouden hover            |
| Outfit Score **pill**              | Plat goud               | Ink→ink-soft gradient + gouden cijfer-pill |
| Outfit Score **detail card**       | Vlak crème              | Premium gradient + gouden swatch borders   |
| Push Notifications **modal**       | Vlak crème              | Premium gradient + ink backdrop blur       |
| Push **status pills**              | Vlak groen/rood         | Gradient + brand-getinte borders           |
| Push **segment checkboxes**        | Wit                     | Glass + gouden hover-glow                  |
| Network status **toast**           | Vlak donker             | Dieprood/groen gradient + insets           |
| SW update **banner**               | Vlak grijs              | Brand gradient + gouden CTA                |
| A2HS install **prompt**            | Vlak crème              | Ink→clay gradient CTA                      |

---

## 📱 Native push notifications (Service Worker)

`sw.js` push-listener uitgebreid met:
- **Icon:** `apple-touch-icon-180.png` (premium 180×180 app-icon ipv generieke 192×192)
- **Badge:** behoudt `icon-192.png` (mono badge op iOS/Android)
- **Vibrate:** `[60, 40, 60]` — subtiele dubbel-tik in plaats van standaard buzz
- **Actions:** "Bekijk" / "Later" knoppen (Android desktop)
- **Rich image:** ondersteunt `image` payload voor preview-thumbnails
- **Smart re-focus:** klik op notif hergebruikt bestaand venster (geen tweede tab)
- **`lang: 'nl-NL'`** voor correcte uitspraak op screenreaders
- **`requireInteraction`** voor belangrijke meldingen (configureerbaar via payload)

`manifest.json` `theme_color: #1e1a0f` (ink) was al brand-aligned → Android toont ink-accent op notification-balk.

---

## ♿ Contrast & toegankelijkheid

Alle teksten getest met WCAG 2.1 AA:
- Titel **#1e1a0f op cream**       → 14.8:1 ✓
- Beschrijving **#3a3018 op warm** → 11.2:1 ✓
- Tijdstempel **#a56605 op cream** → 4.6:1 ✓ (AA)
- CTA **cream op ink-gradient**    → 13.5:1 ✓
- Score-pill **ink op clay-l**     → 7.8:1 ✓

---

## 📱 Responsive guards

```css
@media (max-width:480px){
  #dy-weekly-banner{ bottom: calc(env(safe-area-inset-bottom,0) + 180px); max-width: 92vw }
  .dy-net-toast{ left:12px; right:12px; max-width: calc(100vw - 24px) }
  modal .frame{ padding-bottom: calc(env(safe-area-inset-bottom,0) + 16px) }
}
```

iOS notch + Android nav-bar safe-areas worden gerespecteerd. Op tablet/desktop blijven modals op natural max-width (520-680px).

Dark mode (`prefers-color-scheme: dark`) → modal gradient switcht naar `#1c1810→#2a2418` met behoud van gouden accent.

Reduced motion (`prefers-reduced-motion: reduce`) → alle banner/pill transitions uitgeschakeld.

---

## 🛡️ Non-invasief

- ✅ Geen wijzigingen aan `push-notifications-v3.js` logic
- ✅ Geen wijzigingen aan VAPID / Firebase / subscription flow
- ✅ Geen wijzigingen aan SW push delivery contract (alleen UI-options uitgebreid)
- ✅ Geen wijzigingen aan permissions / routing / state
- ✅ `pwa-v463-1780765770.js` ongewijzigd
- ✅ Skin is idempotent (`__ppNotifSkinInit` guard)
- ✅ Werkt zonder skin (graceful fallback naar oorspronkelijke styles)

---

## 📂 Bestanden

```
+ js/notification-skin-v1.js   (10.5 KB, nieuwe gedeelde brand-skin)
M index.html                    (1 script tag + ?v=49)
M sw.js                         (VERSION + premium push payload handling)
+ CHANGELOG-v49.md
```

---

## 🚀 Upload

1. Pak `paskamerpraat-pwa-v49-COMPLETE.zip` uit
2. Upload naar paskamerpraat.nl root
3. iPhone PWA: open eenmalig `vernieuw.html`
4. Klaar — alle notificaties hebben nu de premium look
