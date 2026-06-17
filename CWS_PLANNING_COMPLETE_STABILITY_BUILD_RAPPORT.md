# CWS Planning Complete Stability Build Rapport

## 1. Samenvatting

- Eindstatus: akkoord voor PR op basis van lokale build, preflight en echte Chrome/CDP E2E.
- Grootste fixes: Gantt balk/label dubbelklik hersteld binnen de pointer lifecycle, Auditlog-modal sluit betrouwbaar, D1-conflictstatus heeft expliciete acties, complete stability E2E toegevoegd.
- Grootste resterende risico: live productie kon vanuit deze omgeving niet datadragend worden getest door Cloudflare Access sign-in HTML op `/`, `/api/health` en `/api/state`.

## 2. Root cause

- Drag/resize: de bestaande V74/V75 lifecycle was aanwezig, maar een gewone pointerdown op de balk startte ook bij dubbelklik de drag-route. Daardoor kon de native `dblclick` bij echte pointerevents worden onderdrukt.
- D1 save: de centrale queue uit V88 voorkwam parallelle saves al. De conflictmelding had nog geen expliciete herstelactie in de shell.
- Capaciteit: de bestaande route rekent uit `gantt.hoursByDay` en `gantt.sourcesByDay`. De nieuwe E2E bewijst dat mutaties in Gantt deze bronnen wijzigen en WHY bronregels toont.
- Mobiel/tablet: bestaande responsive hardening was aanwezig. De nieuwe E2E borgt de gevraagde viewports als echte regressietest.
- Auditlog: de sluitknoplistener werd statisch gebonden terwijl de modalmarkup later in het bestand staat. Daardoor kon de X-knop zonder handler blijven; Escape werkte via de open lifecycle.

## 3. Aangepaste bestanden

- `index.html`: buildmarker bijgewerkt, legacy V86/V87 markers behouden en D1-conflictacties toegevoegd.
- `js/core/store.js`: conflictstatus uitgebreid en `retryRemoteSave` / `loadServerVersion` toegevoegd.
- `layers/laag4_gantt.html`: snelle tweede klik op balk/label opent taakpopup zonder drag te starten; pointercommit geeft duidelijke capaciteit/save feedback.
- `layers/laag10_instellingen.html`: Auditlog controls lazy gebonden bij openen, zodat X/backdrop/search altijd bestaan voordat listeners worden gezet.
- `package.json`: `test:e2e` uitgebreid met complete stability E2E en `preflight:v89` toegevoegd.
- `scripts/v89-complete-stability-build-preflight.mjs`: statische guard voor deze stabiliteitsbuild.
- `tests/e2e/complete-stability.mjs`: echte Chrome/CDP test voor Gantt drag/resize, dubbelklik, capaciteit, viewports en Auditlog.

## 4. Gantt resultaat

- Verplaatsen taak: getest met echte pointerevents op project `19158 - Sportcentrum Zernike te Groningen`.
- Resize links: getest met echte pointerevents.
- Resize rechts: getest met echte pointerevents.
- Dubbelklik taakpopup: getest op taakrij, taakbalk en taaklabel.
- Na refresh behouden: lokaal bewezen via reload zonder fixture en projectcount 76.
- Weekend/niet-werkbare dag correctie: E2E controleert 0 weekenduren na mutaties.

## 5. Capaciteit resultaat

- Projecturen: testproject had 1980 afdelingsuren.
- Gantt `sourcesByDay`: wijzigt na 10 snelle drag/resize-acties.
- Capaciteit: WHY/details toont project, projectnaam, taak, afdeling, datum, uren en bron.
- Bronregel voorbeeld: `Engineering`, `Auto / projecturen`, taak `Detailberekeningen ter controle`.
- Na drag/resize: capacity source signature wijzigt en task source rows blijven aanwezig.
- Na refresh: Gantt planning blijft lokaal behouden; live D1-refresh is niet uitgevoerd zonder Access-sessie.

## 6. Mobiel/tablet resultaat

| Viewport | Boot | Menu | Projecten | Gantt | Drag/resize | Capaciteit | Projectoverzicht | Instellingen | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 390 x 844 | OK | OK | OK | OK | Desktop pointertest apart | OK | OK | OK | Geslaagd |
| 844 x 390 | OK | OK | OK | OK | Desktop pointertest apart | OK | OK | OK | Geslaagd |
| 360 x 740 | OK | OK | OK | OK | Desktop pointertest apart | OK | OK | OK | Geslaagd |
| 768 x 1024 | OK | OK | OK | OK | Bestaande headless suite + layout OK | OK | OK | OK | Geslaagd |
| 1024 x 768 | OK | OK | OK | OK | Bestaande headless suite + layout OK | OK | OK | OK | Geslaagd |
| 1180 x 820 | OK | OK | OK | OK | Layout OK | OK | OK | OK | Geslaagd |
| 1440 x 900 | OK | OK | OK | OK | Echte pointertest | OK | OK | OK | Geslaagd |

## 7. D1/data veiligheid

- D1 save queue blijft centraal en sequentieel.
- Geen save tijdens actieve Gantt drag; commit pas op pointerup.
- Conflictstatus toont acties: `Serverversie laden`, `Mijn wijziging opnieuw proberen`, `Annuleren`.
- Empty/fallback/shrink guards uit eerdere builds blijven intact volgens preflight V78/V82/V85/V88.
- Live D1 is niet beschreven of gemuteerd vanuit deze sessie.

## 8. Tests

Uitgevoerd:

- `npm ci` - geslaagd.
- `npm run lint:syntax` - geslaagd.
- `npm run preflight:all` - geslaagd, 61 preflight scripts.
- `npm run build` - geslaagd.
- `npm test` - geslaagd.
- `npm run test:e2e` - geslaagd.
- `node tests/e2e/complete-stability.mjs` - geslaagd.

Nieuwe testdekking:

- 10 snelle Gantt drag/resize-acties met echte Chrome CDP muis-events.
- Refreshbehoud na Gantt-mutatie in lokale teststate.
- Dubbelklik op rij, balk en label.
- Capaciteit WHY/details vanuit Gantt sources.
- Viewports 390 x 844, 844 x 390, 360 x 740, 768 x 1024, 1024 x 768, 1180 x 820 en 1440 x 900.
- Auditlog sluiten via X en Escape.

Live/read-only controle:

- `https://planning-cop.pages.dev/` gaf Cloudflare Access sign-in HTML.
- `/api/health` gaf Cloudflare Access sign-in HTML.
- `/api/state` gaf Cloudflare Access sign-in HTML.
- Daarom kon productie-D1/projectcount niet betrouwbaar worden gelezen vanuit deze omgeving.

## 9. Releaseadvies

- Akkoord voor PR en preview deploy.
- Must-fix resterend: geen in lokale build.
- Should-fix resterend: na preview deploy met Access-sessie de live checklist uitvoeren, inclusief echte D1-save/refresh op tijdelijke testdata.
- Nice-to-have later: screenshots of video toevoegen vanuit een geauthenticeerde preview/live sessie.
