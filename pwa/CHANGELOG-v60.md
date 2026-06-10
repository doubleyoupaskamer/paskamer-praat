# Paskamer Praat — v60 Changelog

## ✨ Nieuw: Server-side Client Errors in Admin Panel

De errors die `error-logger-v1.js` naar `/api/client-error` stuurt
(opgeslagen in MongoDB op de Emergent backend) zijn nu zichtbaar in
het bestaande admin panel onder tab **Errors**.

### Wat zie je?
- Tabel met de laatste **200** client-side errors (real-time).
- Per regel: tijd, type, bericht (met uitklapbare stack-trace),
  bron-URL + line:col, user-agent en een **✕ verwijder**-knop.
- Filter op type (runtime-error / unhandled-rejection / console-error /
  resource-error / manual).
- Zoeken in message (regex, case-insensitive).
- Auto-refresh elke **30 seconden** (uit te zetten).
- Knoppen: **🧹 > 24u wissen** en **🗑 Wis alles**.

### Backend
- `GET  /api/client-error/recent?limit=&kind=&q=` → lijst + `total`
- `DELETE /api/client-error/{id}`               → één wissen
- `DELETE /api/client-error?older_than_hours=24` → bulk wissen

### Bestanden
| Bestand | Wijziging |
|---|---|
| `admin.html` | `<script src="js/admin-errors-v1.js?v=60">` toegevoegd |
| `js/admin-errors-v1.js` | **NIEUW** — companion script, ~270 regels |
| `backend/server.py` | GET uitgebreid + 2 DELETE-routes |
| `index.html` | Alle `?v=59` → `?v=60` |
| `sw.js` | `VERSION = 'v60-…'` |

### Niet aangeraakt
- ✅ Core bundle `pwa-v463-*.js` ongewijzigd.
- ✅ Bestaande Firestore-error-tabel (`er-tbody`) blijft werken.
- ✅ Companion script wordt naast `admin-logic-v177.js` geladen.
