# Index - Juridische documenten Paskamer Praat Merkenportaal

**Versie**: v1.0 - 14 februari 2026
**Status**: ⚠️ **CONCEPT - review door juridisch specialist vereist
voordat publicatie.**

---

## 📋 Documenten in deze map

| # | Bestand | Doel | Versie |
|---|---|---|---|
| 0 | `../MERKENPORTAAL_JURIDISCHE_ANALYSE.md` | Functionele + juridische inventarisatie (basis voor alle docs) | 1.0 |
| 1 | `01-gebruikersreglement-merken.md` | Hoofd-gebruikersovereenkomst voor Merken | 1.0 |
| 2 | `02-acceptable-use-policy.md` | Wat mag wel/niet - AUP | 1.0 |
| 3 | `03-privacyverklaring-cookiebeleid.md` | AVG-compliant privacy + cookies | 1.0 |
| 4 | `04-algemene-voorwaarden-merken-B2B.md` | Zakelijke voorwaarden (B2B) | 1.0 |
| 5 | `05-campagnevoorwaarden.md` | Specifiek voor advertentie-/campagne-diensten | 1.0 |

---

## Volgordeling bij merk-registratie (technisch implementeren)

```
Registratiestap 3 - Akkoord:

☐ Ik heb het Gebruikersreglement gelezen en ga akkoord
☐ Ik heb het Acceptable Use Policy gelezen en ga akkoord
☐ Ik heb de Privacyverklaring & Cookiebeleid gelezen en ga akkoord
☐ Ik heb de Algemene Voorwaarden (B2B) gelezen en ga akkoord
☐ Ik verklaar bevoegd te zijn om namens [bedrijfsnaam] te handelen

[Registreren]
```

**Database**: bewaar in `users/{uid}`:
```js
{
  tos_version_accepted: "v1.0",
  tos_accepted_at: ISO_timestamp,
  tos_accepted_ip: "1.2.3.4",
  aup_version_accepted: "v1.0",
  privacy_version_accepted: "v1.0",
  av_version_accepted: "v1.0",
  signing_authority_confirmed: true
}
```

---

## Bij elke campagne-aanmaak

```
Campagnevoorwaarden v1.0 zijn van toepassing.
Bij doorgaan accepteert u deze voorwaarden voor deze campagne.

[Bekijken] [Doorgaan]
```

---

## Wijzigingsprocedure

1. Wijziging opstellen door product/legal team
2. Versie verhoogt (1.0 → 1.1 voor minor, 2.0 voor major)
3. **30 dagen** voor inwerkingtreding aankondiging via:
   - E-mail aan alle Merken
   - Banner in Merkenportaal
   - "Wat is nieuw"-pagina
4. Op ingangsdatum: nieuwe checkbox bij volgende login
5. Bij wezenlijke wijziging: opt-out mogelijkheid met kosteloze
   beëindiging binnen 30 dagen

---

## Aan-te-leveren door juridisch specialist (vervolgwerk)

- [ ] **Definitieve juridische review** alle 5 documenten
- [ ] **Verwerkersovereenkomst (DPA)** voor Merken die zelf
      persoonsgegevens via lead-formulieren of integraties verwerken
- [ ] **Sub-verwerkerslijst** met EU-doorgifte-garanties (publiek
      via paskamerpraat.nl/subprocessors)
- [ ] **Transfer Impact Assessment (TIA)** voor Stripe/Shopify/AI
      providers met US-doorgifte
- [ ] **Records of Processing Activities (RoPA)** - AVG art. 30
- [ ] **Datalek-protocol** met 72u-meldingsprocedure
- [ ] **Aansluiting geschillencommissie** of mediation-route (B2B
      conflicten)
- [ ] **BTW-advies** B2B EU-grensoverschrijdend (Stripe Ierland →
      Nederland)
- [ ] **Stripe Customer Portal** activeren (voor self-service
      opzegging - vereist live Stripe key + dashboard config)
- [ ] **Reclamecode-aansluiting** (Stichting Reclame Code)

---

## Technische integratie van voorwaarden

### Op te leveren door development team
- [ ] `/voorwaarden/gebruikersreglement` route
- [ ] `/voorwaarden/aup` route
- [ ] `/voorwaarden/privacy` route
- [ ] `/voorwaarden/algemeen` route
- [ ] `/voorwaarden/campagnes` route
- [ ] Footer-links naar alle 5 documenten op iedere pagina
- [ ] Verplichte checkbox-component bij registratie
- [ ] `tos_version_accepted` veld in `users` collection
- [ ] E-mail-template bij aanvaarding + factuur
- [ ] Cookie-banner met opt-in voor analytische cookies
- [ ] "Mijn data downloaden" knop in account-instellingen
      (dataportabiliteit)
- [ ] "Account verwijderen" flow met 30-dagen grace-periode
- [ ] Audit-log van toestemming-versies

---

## Contactpunten

| Onderwerp | E-mail |
|---|---|
| Algemene support | support@paskamerpraat.nl |
| Privacy-vragen | privacy@paskamerpraat.nl |
| Juridisch | legal@paskamerpraat.nl |
| Beveiligingsmeldingen | security@paskamerpraat.nl |

---

*Einde index*
