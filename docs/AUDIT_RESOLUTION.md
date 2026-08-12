# Audit resolution — CWS Planning 2.0.0

Datum: 12 augustus 2026

Deze matrix koppelt iedere bevinding uit de volledige pakketaudit aan de reparatie en de lokale acceptatieproef. “Opgelost” betekent dat de broncode, migraties, release-output en lokale tests zijn hersteld. Cloudflare-accountinstellingen en productiegegevens blijven externe deploymentvoorwaarden.

| ID | Status | Reparatie | Acceptatiebewijs |
|---|---|---|---|
| B-01 | Opgelost | `pages_build_output_dir="dist"`; vaste build-allowlist; SQL-back-ups, interne documenten, historische rapporten en testartefacten verwijderd. | Buildcontrole: 71 toegestane bestanden; bekende bron-/back-uppaden geven HTTP 404. |
| B-02 | Opgelost | Exacte server-side `baseVersion`-controle en HTTP 409 bij een verouderde writer. | Integratie- en browserproef: twee writers op dezelfde basis leveren exact `[200, 409]`. |
| B-03 | Opgelost | Eén centrale state-opslagmodule; chunks, commit, pointer en retentie in één D1-`batch()`; SHA-256-checksum en rollback. | Foutinjectie-, corruptieherstel- en gelijktijdigheidstests slagen. |
| B-04 | Opgelost | Playwright exact gepind; volledige lockfile; eigen XLSX-implementatie; afzonderlijke unit-, integratie-, statische en E2E-commando’s. | 16 unit-, 16 integratie-, 13 statische tests en echte browseracceptatie slagen. |
| H-01 | Opgelost | Aantalheuristiek verwijderd; lege en kleine geldige states zijn toegestaan; catastrofale vervanging vereist aparte admin-intentie. | Tests voor lege D1, kleine states en destructieve vervanging slagen. |
| H-02 | Opgelost | Onbekende identiteiten worden deny-by-default geweigerd; uitsluitend het expliciete bootstrapadres kan de eerste admin worden. | Onbekende gebruiker krijgt 403 en wordt niet stil aangemaakt. |
| H-03 | Opgelost in code; live configuratie vereist | Access-JWT wordt gecontroleerd op RS256, handtekening, issuer, audience en tijdclaims; losse e-mailheader is onvoldoende. | Unit- en integratietests weigeren ontbrekende, vervalste en ongeldige tokens. |
| H-04 | Opgelost | Cleanup is POST-only, admin-only, same-origin, bodybevestigd en aanvullend beveiligd met onderhoudstoken. | GET/planner/onbekend/ontbrekend token worden geblokkeerd; beheerflow is getest. |
| H-05 | Opgelost | Runtime-DDL verwijderd; geversioneerde niet-destructieve migraties; historische schema-upgrade behoudt state, audit en gebruikers. | Migratietests controleren rijbehoud en vereiste tabellen/triggers. |
| H-06 | Opgelost | API-validatie en D1-triggers beschermen de laatste actieve admin; invoervelden zijn begrensd. | Degradatie, deactivatie en verwijdering van de laatste admin worden geweigerd. |
| H-07 | Opgelost | Logo’s worden centraal beperkt tot begrensde PNG/JPEG-data-URL’s; SVG/actieve inhoud en attribuutinjectie worden verwijderd/geweigerd. | Unit-, statische en statevalidatietests slagen. |
| H-08 | Opgelost | `postMessage` valideert origin én source; wildcard-targets en globale onbetrouwbare beheeropdrachten zijn verwijderd. | Browserproef bevestigt dat een onbetrouwbaar bericht geen dialoog of datamutatie activeert. |
| H-09 | Opgelost | Actor, auteur en tijd worden server-side bepaald; audit- en revisiepayloads zijn begrensd en rollen worden afgedwongen. | API-integratietests controleren viewer-/planner-/adminrechten en metadata. |
| H-10 | Opgelost | Consistente CSP, HSTS, nosniff, frame-, referrer-, permissions-, COOP- en CORP-headers; geen wildcard-CORS; mutaties same-origin. | Statische controles en browserresponseheaders slagen. |
| M-01 | Opgelost | XLSX/ZIP-import heeft limieten voor bestandsgrootte, entries, uitgepakte omvang en compressieratio. | Importbeveiliging wordt statisch en met unit-tests gecontroleerd. |
| M-02 | Opgelost | CSV/spreadsheet-export neutraliseert formuleprefixen. | Unit- en statische tests dekken `=`, `+`, `-` en `@`. |
| M-03 | Opgelost | JSON-, SQL- en CSV-imports hebben byte-, structuur-, complexiteits- en payloadlimieten. | Validatie- en importtests slagen. |
| M-04 | Opgelost voor de release | Statische controls hebben labels of toegankelijke namen; desktop- en mobiele runtime zijn browsermatig gecontroleerd. | Twee statische toegankelijkheidscontroles en mobiele 390×844-proef slagen. |
| M-05 | Opgelost voor de release | Historische ballast en dubbele preflights verwijderd; centrale modules, actuele tests en beheer-/deploymentdocumentatie toegevoegd. | Release-structuurtest staat alleen de actuele scripts en `tests/release/` toe. |

## Lokale release-uitkomst

- Syntax- en securitylint: geslaagd.
- Unit-tests: 16 van 16 geslaagd.
- Integratietests: 16 van 16 geslaagd.
- Statische releasetests: 13 van 13 geslaagd.
- Buildverificatie: 71 van 71 releasebestanden toegestaan.
- Browseracceptatie: 11 samengestelde controles geslaagd, waaronder alle 21 productiemodules en mobiel 390×844.

## Externe productievoorwaarden

De reparatie wijzigt geen live Cloudflare-account. Vóór productie moeten daarom de Access-app, bescherming van `pages.dev`/previews, productievariabelen, D1-binding, remote migratie, herstelpunt en eerdere deployments worden gecontroleerd volgens `docs/DEPLOYMENT.md` en `docs/RECOVERY.md`.
