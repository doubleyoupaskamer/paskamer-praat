# Paskamer Praat Backend Deploy Gids (v47)

Je hebt 4 manieren om de FastAPI AI-backend te hosten. Kies wat past:

---

## Optie A Emergent Deploy (snelst, 5 min)

1. Open je Emergent chat workspace
2. Klik op **"Deploy"** rechtsboven
3. Volg de wizard → krijg `https://jouw-app.emergentagent.com`
4. `EMERGENT_LLM_KEY` is **automatisch** geconfigureerd
5. Test: `curl https://jouw-app.emergentagent.com/healthz` → `{"status":"ok","emergent_key_configured":true}`
6. Open `index.html` in deze ZIP, regel ~828, vervang:
   ```html
   window.DY.apiBase = 'https://jouw-app.emergentagent.com';
   ```
7. Upload PWA-bundel naar je hosting (paskamerpraat.nl)

**Kosten:** ~$20/maand all-in.
**CORS:** open `*` werkt direct vanaf paskamerpraat.nl.

---

## Optie B Render (gratis tier mogelijk)

1. Push de `backend/` map naar een GitHub-repo
2. https://dashboard.render.com → **New + → Blueprint** → kies repo
3. Render detecteert `render.yaml` automatisch
4. **Environment Variables** → voeg toe: `EMERGENT_LLM_KEY = sk-emergent-xxx`
5. Deploy → krijg `https://paskamer-ai.onrender.com`
6. CNAME `api.paskamerpraat.nl` → `paskamer-ai.onrender.com`
7. In `index.html`: `window.DY.apiBase = 'https://api.paskamerpraat.nl';`

**Kosten:** $0 (free tier, slaapt na 15 min idle) of $7/mnd (always-on).
**Region:** Frankfurt (ams) lage latency voor NL.

---

## Optie C Railway (eenvoudigste UX)

1. Push `backend/` naar GitHub
2. https://railway.app → **New Project → Deploy from GitHub**
3. Railway detecteert `railway.json` + `Dockerfile`
4. **Variables** → `EMERGENT_LLM_KEY = sk-emergent-xxx`
5. **Settings → Networking → Generate Domain** → krijg `*.up.railway.app`
6. (Optioneel) Custom domain `api.paskamerpraat.nl`
7. In `index.html`: zet `window.DY.apiBase`

**Kosten:** $5/mnd credit, ~$3-5 effectief gebruik.

---

## Optie D Fly.io (laagste latency NL)

```bash
cd backend
flyctl auth login
flyctl launch --no-deploy   # bewerk fly.toml als nodig
flyctl secrets set EMERGENT_LLM_KEY=sk-emergent-xxx
flyctl deploy
flyctl certs add api.paskamerpraat.nl
```

Voeg AAAA + A records toe volgens Fly's instructie.

**Kosten:** ~$0-3/mnd (shared-cpu-1x, 512 MB, auto-stop).
**Region:** `ams` (Amsterdam) sub-30ms naar NL gebruikers.

---

## Optie E Eigen VPS / Docker

```bash
cd backend
docker build -t paskamer-ai .
docker run -d --restart=always \
  -e EMERGENT_LLM_KEY=sk-emergent-xxx \
  -p 8001:8001 \
  --name paskamer-ai \
  paskamer-ai
```

Reverse proxy (Caddy/Nginx) naar `api.paskamerpraat.nl`:

**Caddy** (`/etc/caddy/Caddyfile`):
```
api.paskamerpraat.nl {
    reverse_proxy localhost:8001
}
```

---

## ⚙️ DNS-config (alle opties)

Voeg deze CNAME toe bij je domain-registrar:
```
api.paskamerpraat.nl  CNAME  <jouw-host>.<provider>.com
```

---

## ✅ Verificatie na deploy

```bash
# Healthcheck
curl https://api.paskamerpraat.nl/healthz

# Test endpoint (kost ~1 LLM call)
curl -X POST https://api.paskamerpraat.nl/api/weekly-stylist \
  -H "Content-Type: application/json" \
  -d '{"user_context":"170cm vrouw, smaak: minimalistisch"}'
```

Verwacht: `{"week":"2026-Wxx","intro":"...","picks":[{...},{...},{...}]}`

---

## 🔑 Waar krijg ik EMERGENT_LLM_KEY?

Als je deploy via **Emergent Deploy** doet → key wordt **automatisch geïnjecteerd**.

Voor zelf-host:
1. Ga naar https://app.emergent.sh
2. Profile → **Universal Key** (Emergent LLM Key)
3. Kopieer `sk-emergent-...`
4. Voldoende balans aanwezig? Anders: Profile → Add Balance / Auto Top-Up

De key werkt voor:
- ✅ Gemini Nano Banana (try-on)
- ✅ Gemini Vision (outfit score)
- ✅ Gemini text (weekly stylist)
- ❌ NIET voor Stripe, FAL, etc.

---

## 🛟 Problemen?

| Probleem                              | Oplossing                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------- |
| 503 "EMERGENT_LLM_KEY ontbreekt"      | Env-var niet gezet check secrets in dashboard                           |
| 502 "AI service fout"                 | Universal Key budget op Profile → Add Balance                           |
| CORS error in browser console         | `apiBase` wijst naar verkeerde URL of typo                                |
| Try-on duurt >60s                     | Normaal voor Nano Banana; verhoog frontend timeout indien gewenst         |
| Score-pill verschijnt niet            | Check `console.log` op `__ppOutfitScoreInit` + dat feed-cards `<img>` hebben |
