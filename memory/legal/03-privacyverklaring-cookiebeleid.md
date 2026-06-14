# Privacyverklaring & Cookiebeleid - Paskamer Praat

**Versie 1.0 - 14 februari 2026**
**Verwerkingsverantwoordelijke**: Doubleyou Tailored for Tall & Plus Size h.o.d.n. *Paskamer Praat*
**Contact AVG**: privacy@paskamerpraat.nl

> ⚠️ Concept - juridische review door privacy-jurist aanbevolen voor
> definitieve publicatie. Aansluiting bij Autoriteit Persoonsgegevens
> en mogelijke DPO-aanstelling te onderzoeken.

---

## 1. Wie wij zijn

Paskamer Praat is een community-platform en merken-marktplaats voor
tall & plus-size kleding. Wij verwerken persoonsgegevens van:
- **Community-leden** (consumenten die outfits delen)
- **Merken** (B2B-accounts met producten en campagnes)
- **Bezoekers** (anonieme gebruikers van de website)

---

## 2. Welke gegevens verwerken wij?

### 2.1 Van community-leden
- Naam (display name), e-mailadres
- Profielfoto, biografie
- Geüploade foto's en outfit-data
- Likes, opgeslagen items, AI-scoringgeschiedenis
- IP-adres, browser-/device-informatie
- Login- en sessietijdstippen

### 2.2 Van Merken
- Bedrijfsnaam, KvK-nummer, BTW-nummer, vestigingsadres
- Contactpersoon (naam, e-mail, telefoon)
- Inloggegevens (e-mail + gehashed wachtwoord via Firebase)
- Bedrijfslogo, productafbeeldingen, beschrijvingen
- Campagne-prestatiedata (aggregaten)
- Betalingsmetagegevens via Stripe (geen kaartdata!)
- Communicatie met support

### 2.3 Van anonieme bezoekers
- IP-adres
- Browser-/device-informatie
- Bezochte pagina's, klik-events
- Anonieme session-ID (cookie)

---

## 3. Doeleinden en rechtsgronden

| Doel | Gegevens | Rechtsgrond AVG |
|---|---|---|
| Accountcreatie en login | E-mail, wachtwoord | Uitvoering overeenkomst (art. 6.1.b) |
| Tonen van content | Profielfoto, posts | Uitvoering overeenkomst |
| Campagne-plaatsing | Bedrijfsgegevens, Content | Uitvoering overeenkomst |
| Betalingen | Stripe-tokens, factuurgegevens | Uitvoering overeenkomst + wettelijke plicht (Wba) |
| Statistieken Merken | Aggregaat-impressies, klikken | Gerechtvaardigd belang (art. 6.1.f) |
| Beveiliging en fraudepreventie | IP, UA, login-logs | Gerechtvaardigd belang |
| Productverbetering | Geanonimiseerde gebruiksdata | Gerechtvaardigd belang |
| AI-suggesties | Geüploade foto's, voorkeuren | Uitvoering overeenkomst + (waar nodig) toestemming |
| Marketing per e-mail | E-mailadres | Toestemming (opt-in) of soft opt-in (klant) |
| Wettelijke verplichtingen | Diversen | Wettelijke verplichting (art. 6.1.c) |

---

## 4. Bewaartermijnen

| Categorie | Bewaartermijn |
|---|---|
| Actief account | Voor duur van het account |
| Inactief account (community) | 24 maanden na laatste login |
| Inactief Merk-account | 12 maanden na laatste login |
| Betalingsgegevens | 7 jaar (wettelijke bewaarplicht) |
| Support-tickets | 24 maanden |
| Beveiligingslogs | 12 maanden |
| Geanonimiseerde aggregaten | Onbeperkt |

Na de bewaartermijn worden gegevens verwijderd of geanonimiseerd,
behoudens wettelijke verplichting tot langere bewaring.

---

## 5. Ontvangers en sub-verwerkers

Wij delen gegevens met de volgende verwerkers:

| Sub-verwerker | Doel | Vestiging | Doorgifte-garantie |
|---|---|---|---|
| Google Firebase (Auth, Firestore, Storage) | Hosting, database, opslag | EU (Belgium/Frankfurt) | DPA + EU-residency |
| Cloudflare | CDN, DNS, beveiliging | EU/US | SCC's |
| Stripe Ireland | Betalingsverwerking | Ierland | DPA |
| Shopify | Wallet-top-ups | Ierland/Canada | SCC's |
| Emergent LLM (OpenAI/Anthropic/Google) | AI-functionaliteiten | EU/US | SCC's + DPA |
| Resend / SendGrid (e-mail) | Transactionele e-mails | EU/US | SCC's |

Wij verkopen of verhuren persoonsgegevens nooit aan derden.

### Doorgifte buiten EU
Voor doorgifte naar de VS worden Standard Contractual Clauses (SCC's)
gebruikt, aangevuld met technische maatregelen (encryptie in transit
en at rest). Een Transfer Impact Assessment (TIA) is beschikbaar op
verzoek.

---

## 6. Cookies en vergelijkbare technieken

### 6.1 Functionele cookies (altijd actief - geen toestemming nodig)
| Cookie | Doel | Bewaartermijn |
|---|---|---|
| `firebase:authUser:*` | Login-sessie | Tot logout |
| `dy_consent` | Cookie-keuze opslaan | 12 maanden |
| `dy_locale` | Taal-voorkeur | 12 maanden |
| `dy_theme` | UI-thema | 12 maanden |

### 6.2 Analytische cookies (anoniem - soft opt-in)
| Cookie | Doel | Bewaartermijn |
|---|---|---|
| `_ga`, `_gid` (indien actief) | Aggregatie pageviews | 14 maanden |
| `dy_item_poll_id` | Anonieme poll-tracking | 6 maanden |

### 6.3 Marketing/tracking cookies
Op dit moment plaatsen wij **geen** marketing- of tracking-cookies van
derden. Indien dit in de toekomst verandert, wordt expliciete
toestemming gevraagd via een cookiebanner.

### 6.4 Localstorage
Het Platform gebruikt browser localStorage voor:
- Caching van premium-status (TTL 30s, owner-tagged)
- AI-outfit-scores (per outfit, gewist bij logout)
- UI-state (welke pagina actief)

Bij logout wordt localStorage volledig opgeschoond (zie
`pp-session-cleanup-v1.js`).

---

## 7. Uw rechten

U heeft het recht om:

| Recht | Hoe uit te oefenen |
|---|---|
| **Inzage** in uw gegevens | privacy@paskamerpraat.nl |
| **Rectificatie** (correctie) | Via account-instellingen of mail |
| **Verwijdering** ("recht op vergetelheid") | Mail met identificatie |
| **Beperking** van verwerking | Mail |
| **Bezwaar** tegen verwerking | Mail (bij gerechtvaardigd belang) |
| **Dataportabiliteit** | Mail; export in JSON binnen 30 dagen |
| **Intrekken toestemming** | Account-instellingen of mail |
| **Klacht** bij toezichthouder | autoriteitpersoonsgegevens.nl |

Wij reageren binnen 30 dagen op verzoeken. Identificatie kan worden
gevraagd om misbruik te voorkomen.

---

## 8. Beveiliging

Wij nemen passende technische en organisatorische maatregelen:
- ✅ TLS-encryptie voor alle data in transit (HTTPS-only)
- ✅ Encryption-at-rest via Firebase
- ✅ Wachtwoord-hashing (bcrypt via Firebase Auth)
- ✅ Strict Content Security Policy (CSP)
- ✅ Owner-aware session caching
- ✅ Cross-tab logout synchronisatie
- ✅ Idempotente betalingsverwerking
- ✅ Audit-logs voor admin-acties
- ✅ Toegang tot productie alleen voor bevoegd personeel
- ✅ Regelmatige security-reviews

### Datalekken
Een datalek wordt binnen 72 uur gemeld aan de Autoriteit
Persoonsgegevens en bij hoge waarschijnlijkheid ook aan getroffen
betrokkenen, conform AVG art. 33 en 34.

---

## 9. Geautomatiseerde besluitvorming

Het Platform gebruikt AI voor suggesties (outfit-score, style-
assistant). Deze suggesties hebben **geen rechtsgevolgen** voor
natuurlijke personen en zijn niet bindend.

Er vindt **geen autonome besluitvorming** plaats over personen op basis
van profilering die rechtsgevolgen heeft.

---

## 10. Bijzondere categorieën

Het Platform is **niet bedoeld** voor het verwerken van bijzondere
persoonsgegevens (gezondheid, religie, etniciteit etc.). Gebruikers
worden verzocht dergelijke gegevens niet vrijwillig te delen.

Het Platform is **niet bedoeld voor kinderen onder de 16 jaar**.
Indien wij vaststellen dat een gebruiker minderjarig is, wordt het
account verwijderd, tenzij geverifieerde ouderlijke toestemming wordt
aangeleverd.

---

## 11. Contact

**Verwerkingsverantwoordelijke:**
Doubleyou Tailored for Tall & Plus Size
[adres invullen]
KvK: [invullen]
privacy@paskamerpraat.nl

**Functionaris voor Gegevensbescherming (FG)**:
Aanstelling onder evaluatie. Tot die tijd: privacy@paskamerpraat.nl.

**Toezichthouder:**
Autoriteit Persoonsgegevens
Postbus 93374, 2509 AJ Den Haag
autoriteitpersoonsgegevens.nl

---

## 12. Wijzigingen

Deze Privacyverklaring kan worden gewijzigd. De actuele versie is
altijd beschikbaar via paskamerpraat.nl/privacy. Materiële wijzigingen
worden minimaal 30 dagen vooraf aangekondigd via e-mail en in-app
notificatie.

---

*Einde Privacyverklaring & Cookiebeleid*

---

## Aanvullende documenten (separaat te leveren)

- **Verwerkersovereenkomst (DPA)** - voor Merken die zelf
  persoonsgegevens via campagne-lead-formulieren verwerken
- **Sub-verwerkerslijst** - actueel overzicht, gepubliceerd op
  paskamerpraat.nl/subprocessors
- **Transfer Impact Assessment (TIA)** - voor doorgifte buiten EU
- **Records of Processing Activities (RoPA)** - interne registratie
  van verwerkingen (AVG art. 30)
