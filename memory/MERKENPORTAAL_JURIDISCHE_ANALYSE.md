# Deepdive & Juridische Analyse - Paskamer Praat Merkenportaal

> Gebaseerd op de werkelijke functionaliteit in de codebase (v60.1.70 - feb 2026).
> Bedoeld als basis voor: Gebruikersreglement, Algemene Voorwaarden Merken,
> Campagnevoorwaarden, AUP, Privacybepalingen en Moderatiebeleid.

---

## Fase 1 - Functionele inventarisatie per module

### 1. Account & toegang

**Aanwezige functionaliteit (codebase):**
- Firebase Auth registratie/login (email + wachtwoord, Google OAuth)
- Merkprofiel creatie (`users` collection, `isBrand: true`)
- Bedrijfsgegevens veld: `bedrijfsnaam`, `kvk`, `btw`, `adres`, `website`
- Logo upload via Firebase Storage (`brand_logos/{uid}/...`)
- 1 brand = 1 account (geen multi-user/team-rollen nog)
- Admin-override emails via env (`ADMIN_PREMIUM_EMAILS`)
- Sessie-isolatie + cross-tab logout (`pp-session-cleanup-v1.js`)

**Juridische aandachtspunten:**
- Bevoegdheidsverklaring vereist bij registratie
- Account-overdraagbaarheid: verboden
- Wachtwoordbeveiliging is verantwoordelijkheid van merk
- Misbruik via geleende account → merk aansprakelijk

**Voorbeeld bepaling:**
> Het merk verklaart bij registratie bevoegd te zijn om namens de
> onderneming op te treden. Het merk is volledig verantwoordelijk voor
> alle activiteiten die plaatsvinden onder het account, ongeacht of deze
> door hemzelf of door derden zijn verricht.

---

### 2. Content upload - Producten & Campagnes

**Aanwezige functionaliteit:**
- `brand_products` collection: titel, beschrijving, prijs, afbeeldingen[],
  url, categorie, status (concept/actief/gepauzeerd), createdAt
- `campaigns` collection: naam, boodschap, doelgroep, plaatsingen[],
  startDatum, eindDatum, status (concept/live/eind), brandId, plaatsingen
- Upload via Firebase Storage met composite path `brand_products/{uid}/{productId}/img_{ts}_{i}`
- Status-gebaseerde Firestore rules - alleen `status==actief` zichtbaar publiekelijk

**Juridische aandachtspunten:**
- Eigendomsverklaring afbeeldingen vereist
- Recht op portret (modelvrijwaring) bij personen op foto's
- Auteursrecht textiel/print designs
- Misleidende reclame verboden (Reclamecode + Wft + Wam)
- Productinformatie moet kloppen (prijs, beschikbaarheid, eigenschappen)

**Voorbeeld bepaling:**
> Het merk verklaart en garandeert dat:
> (a) alle geüploade content vrij is van rechten van derden;
> (b) afgebeelde personen schriftelijke toestemming hebben gegeven;
> (c) productinformatie waarheidsgetrouw, actueel en niet misleidend is;
> (d) prijzen inclusief alle wettelijk verplichte toeslagen worden
>     weergegeven (BTW, verzendkosten waar van toepassing).
>
> Het merk verleent Paskamer Praat een wereldwijde, niet-exclusieve,
> royalty-vrije licentie om de aangeleverde content te tonen, technisch
> te verwerken, te resizen, te cachen en beschikbaar te maken binnen de
> functionaliteiten van het platform en gerelateerde marketing.

---

### 3. Campagnes & promoties

**Aanwezige functionaliteit:**
- Campagne-creatie wizard in Brand Portal
- Plaatsingen: feed, stories, ai_assist, outfit_review, similar
- Doelgroep-filters (in development)
- Budgetbeheer via Wallet (`wallet_balance` veld)
- Universal Renderer plaatst campagnes in geselecteerde placements
- Live status-validatie: `status==live` + binnen `startDatum/eindDatum`
- Impressies + clicks worden geregistreerd in `events` collection
- Admin-diagnose tool (`pp-campagne-diagnose-v1.js`)

**Juridische aandachtspunten:**
- Reclamecode Commissie Nederland (RCC) naleving
- Vergelijkende reclame regels
- Promotiecode/aanbieding-voorwaarden moeten duidelijk zijn
- Influencer-disclosure regels indien samenwerking met community
- Budget-besteed garantie alleen voor toonbeurten, NIET voor resultaten

**Voorbeeld bepaling:**
> Het merk blijft volledig verantwoordelijk voor de inhoud en juridische
> juistheid van commerciële communicatie. Paskamer Praat treedt op als
> technisch publicatieplatform en niet als adverteerder. Het merk
> vrijwaart Paskamer Praat tegen iedere aanspraak van derden voortvloeiend
> uit de campagne-inhoud.

---

### 4. Wallet, betalingen & abonnementen

**Aanwezige functionaliteit:**
- `wallet_balance` op user-document (in cent)
- Top-up via Shopify (geplaatste hooks, integratie pending)
- Premium subscriptie via Stripe (€4,99/mnd, `premium_users` collection)
- Idempotente premium-grant via `session_id` check
- Customer Portal: nog niet beschikbaar (placeholder)
- Stripe webhook handler met signature-verificatie
- Audit log via `stripe_events` collection
- Admin grant/revoke endpoints

**Juridische aandachtspunten:**
- BTW verlegd (B2B) of inclusief (B2C)?
- Reflectierecht: B2C 14 dagen herroeping bij digitale diensten?
  → Vermijd door expliciete toestemming bij aankoop + leveringsstart
- Automatische verlenging Stripe - wettelijke herinneringsplicht
- Restitutiebeleid bij technische storingen / niet-geleverde campagnes
- Wallet-saldo niet uitbetaalbaar, alleen besteedbaar binnen platform

**Voorbeeld bepalingen:**
> Wallet-saldo is uitsluitend besteedbaar binnen Paskamer Praat voor
> campagne-plaatsingen en aanvullende diensten. Uitbetaling van resterend
> saldo is uitgesloten, behoudens in geval van wettelijke verplichting.
>
> Premium-abonnementen worden maandelijks automatisch verlengd via Stripe.
> Opzegging is op ieder moment mogelijk via mail naar
> support@paskamerpraat.nl en wordt verwerkt per eerstvolgende
> verlengdatum. Reeds betaalde periodes worden niet gerestitueerd.

---

### 5. Analytics & resultaatrapportage

**Aanwezige functionaliteit:**
- Impressies + clicks per campagne in `events` collection
- Aggregaties in Brand Portal dashboard
- Performance audit document beschikbaar
- Click-tracking via `DY.brandPortal._trackClick()`

**Juridische aandachtspunten:**
- Geen garantie op bereik of conversie (alleen ad-tech standaard)
- Meetmethodiek transparant maken
- Statistieken indicatief, niet bindend voor financiële afrekening
- Geen toegang tot persoonsgegevens van klikkers (alleen aggregaten)

**Voorbeeld bepaling:**
> Analytics worden samengesteld op basis van beschikbare meetgegevens
> via de Universal Campaign Renderer. Cijfers zijn indicatief en kunnen
> afwijken van interne metingen van het merk. Paskamer Praat garandeert
> geen specifiek bereik, conversie of omzetresultaat.

---

### 6. AI-functionaliteiten

**Aanwezige functionaliteit:**
- AI Outfit Score (gemini/gpt via Emergent LLM Key)
- AI Wardrobe Recommend (`/api/wardrobe/recommend`)
- AI Style Assistant (placeholder, stub-endpoint)
- AI Similar Items (placeholder)
- Brand Portal AI-suggesties (in development)
- Image generation via admin (`/api/admin/generate-image`)

**Juridische aandachtspunten:**
- AI Act (EU) - geen autonome beslissingen over personen
- Output-disclaimer verplicht
- Brongegevens van Emergent LLM Key: Anthropic/OpenAI/Google policies
- Geen garantie op accuraatheid
- Merk verantwoordelijk voor publicatie van AI-output

**Voorbeeld bepaling:**
> AI-functionaliteiten leveren ondersteunende suggesties. Paskamer Praat
> garandeert niet de juistheid, volledigheid of toepasbaarheid van AI-
> output. Het merk dient AI-suggesties zelfstandig te beoordelen voordat
> deze worden gepubliceerd of commercieel benut. AI-output mag niet
> worden gebruikt voor autonome beslissingen die rechtsgevolgen hebben
> voor natuurlijke personen.

---

### 7. Community-interactie

**Aanwezige functionaliteit:**
- Merken kunnen verhalen (community posts) bekijken
- Geen directe DM-functionaliteit tussen merk en gebruiker (nog)
- Universal Renderer toont campagne-content tussen community feed
- Brand-profielpagina (`/merken/{brandId}`) zichtbaar voor alle users
- Klik op merk-kaart → opent merk-detail (publiek)

**Juridische aandachtspunten:**
- Spam-verbod (Telecommunicatiewet art. 11.7)
- Geen geautomatiseerde manipulatie van likes/reviews
- Affiliate-disclosure verplicht
- Geen ongevraagde benadering van community-leden
- Verboden: scraping van gebruikersdata

**Voorbeeld AUP-clausule:**
> Het is het merk verboden om:
> (a) gebruikers ongevraagd commercieel te benaderen;
> (b) reviews, beoordelingen of likes te manipuleren via betaalde
>     of geautomatiseerde middelen;
> (c) gebruikersdata, profielinformatie of community-content te
>     scrapen, te kopiëren of te exporteren buiten het platform;
> (d) zich uit te geven als een gebruiker;
> (e) misleidende affiliate-content te plaatsen zonder duidelijke
>     "Gesponsord"-disclosure (al automatisch via tag).

---

### 8. Verboden gebruik (Acceptable Use Policy)

**Te integreren in voorwaarden:**

> Het is niet toegestaan om Paskamer Praat te gebruiken voor:
> 1. Illegale producten of diensten
> 2. Inbreuk op auteursrechten, merkrechten of portretrechten
> 3. Onrechtmatige verwerking van persoonsgegevens
> 4. Misleidende, oneerlijke of agressieve handelspraktijken
> 5. Promotie van gokken, alcohol of tabak buiten wettelijke kaders
> 6. Discriminerende, haatzaaiende of beledigende uitingen
> 7. Inhoud schadelijk voor minderjarigen
> 8. Reverse engineering, scraping of geautomatiseerde data-extractie
> 9. Omzeiling van beveiligingsmaatregelen of rate-limits
> 10. Delen van toegangsgegevens met onbevoegden
> 11. Pump-and-dump, kettingbrieven of pyramidemarketing
> 12. Concurrentie-onderzoek dat normale platform-werking verstoort

---

### 9. Moderatie & handhaving

**Aanwezige functionaliteit:**
- Admin dashboard met campagne-diagnose
- Mogelijkheid om campagne-status te wijzigen
- Wallet adjust endpoints (`/api/wallet/admin/adjust`)
- Premium grant/revoke door admin
- Audit log: `premium_audit`, `stripe_events`, `client_errors`

**Voorbeeld bepalingen:**
> Paskamer Praat behoudt zich het recht voor om, zonder voorafgaande
> kennisgeving en zonder restitutieplicht:
> (a) content of campagnes te verwijderen die in strijd zijn met
>     wetgeving, deze voorwaarden of de veiligheid van het platform;
> (b) accounts tijdelijk of permanent te blokkeren bij gegrond vermoeden
>     van misbruik;
> (c) onderzoek uit te voeren naar gemelde overtredingen;
> (d) gegevens te overleggen aan opsporingsinstanties indien wettelijk
>     verplicht.
>
> Bij minder ernstige overtredingen wordt het merk eerst aangesproken
> met een herstelmogelijkheid binnen 14 dagen.

---

### 10. Privacy & gegevensverwerking

**Verwerkte data van merken:**
- Bedrijfsgegevens (KvK, BTW, adres)
- Inloggegevens (email, gehashed wachtwoord via Firebase)
- Betalingsgegevens (via Stripe - Paskamer Praat krijgt alleen tokens)
- IP-adressen + UA voor security logs
- Campagne-prestatiedata
- Communicatie met support

**Rolverdeling AVG:**
- **Verwerkingsverantwoordelijke** (Controller): Paskamer Praat (NL)
- **Verwerker**: Firebase/Google, Stripe (EU/US), Emergent LLM providers
- **Sub-verwerkers** moeten in privacyverklaring worden vermeld

**Internationale doorgifte:**
- Stripe (Ierland) - SCC's
- Google Firebase (EU regio) - vereist EU-data-residency check
- OpenAI/Anthropic via Emergent LLM Key - risico op US-doorgifte → SCC's nodig

**Verplichte documenten (apart op te leveren):**
- Privacyverklaring (publiek)
- Cookiebeleid
- Verwerkersovereenkomst (DPA) voor merken die persoonsgegevens via
  campagnes verwerken (bv. lead-formulieren)
- Sub-verwerkerslijst
- Functionaris voor Gegevensbescherming (FG) indien >250 medewerkers
  of structurele monitoring

---

## Fase 2 - Factcheck (controlepunten)

| Vraag | Antwoord (op basis van codebase) | Juridische impact |
|---|---|---|
| Welke landen worden bediend? | Primair NL (Dutch UI), bereikbaar EU-breed | NL-recht + EU-regelgeving |
| Alleen Nederlands of EU-breed? | NL-only content, geen geo-block | EU consumentenrecht waar van toepassing |
| Merken = consument of zakelijk (B2B)? | **Strikt B2B** (KvK-veld verplicht) | Geen 14-dagen herroeping, B2B-voorwaarden |
| Worden producten direct verkocht? | **Nee** - alleen promotie/redirect | Geen marketplace-liability; merk = verkoper |
| Betalingen via? | Stripe (live), Shopify (geplaatst) | PCI-DSS via Stripe, geen kaartdata bij ons |
| Worden gebruikersdata gedeeld met merken? | **Alleen aggregaten** (impressies/clicks) | Geen DPA voor merken nodig op platform-niveau |
| Influencers gekoppeld? | Geen formele influencer-koppeling (nog) | Disclosure-verplichting via "Gesponsord"-tag |
| AI commerciële beslissingen? | Suggesties, geen autonome beslissingen | AI-Act laag-risico, output-disclaimer voldoende |
| Abonnementen of losse campagnes? | **Beide**: Premium subscription + ad-hoc campagne-budget | Twee aparte sets betalingsvoorwaarden |

---

## Fase 3 - Definitieve oplevering (next steps)

Op basis van bovenstaande analyse moeten de volgende documenten worden
opgeleverd (apart, in juridische taal door advocaat/jurist te reviewen):

1. **Gebruikersreglement Merkenportaal** - registratie, account-beheer,
   moderatie, beëindiging
2. **Algemene Voorwaarden Merken** (B2B) - diensten, prijzen,
   aansprakelijkheid, IE-rechten, toepasselijk recht (Nederlands recht,
   rechtbank Amsterdam)
3. **Campagnevoorwaarden** - booking, budget, plaatsingen, resultaat-
   indicatie, annulering
4. **Contentrichtlijnen** - beeldspecs, beschrijvings-regels, reclame-
   ethiek, inclusiviteit
5. **Acceptable Use Policy** - wat mag wel/niet (zie sectie 8)
6. **Privacyverklaring + Cookiebeleid** - AVG-compliant
7. **Verwerkersovereenkomst (DPA)** - voor merken die zelf persoons-
   gegevens via formulieren verzamelen
8. **Sanctie- en Moderatiebeleid** - escalatieladder, beroep, hersteltermijn

---

## Aanbevelingen voor implementatie

### Direct technisch implementeerbaar
- ✅ "Akkoord met voorwaarden" checkbox bij merk-registratie (verplicht)
- ✅ Versie-tracking van voorwaarden (`tos_version_accepted` veld)
- ✅ Bij content-upload: bevestigingsdialoog met IE-rechten-verklaring
- ✅ Footer-link naar voorwaarden + privacy in elke pagina
- ✅ Mailtemplate bij premium-aankoop met factuur + voorwaarden

### Procedureel
- Juridische review door gespecialiseerde IT-/advertentie-jurist
- Wijzigingen-procedure met 30 dagen aankondigingstermijn
- Helpdesk e-mail support@paskamerpraat.nl voor klachten/opzegging
- Klachten-loket conform WBR (B2B) en geschillencommissie aansluiting

### Audit & compliance
- Jaarlijkse review voorwaarden + sub-verwerkerslijst
- Maandelijkse review `client_errors` collection voor security-incidenten
- Quarterly audit van AI-output op accuraatheid/bias
- Backup-policy voor `campaigns`, `payment_transactions`, `premium_users`

---

**Versie**: v1.0 - 14 februari 2026
**Status**: Functionele inventarisatie compleet - juridische teksten
te schrijven door juridisch specialist.
**Eigenaar**: Paskamer Praat / Doubleyou Tailored for Tall & Plus Size
