# CWS Planning Live Regressiefixes D1 Gantt Mobile

## Probleemomschrijving
Tijdens de live regressietest op productie zijn vijf problemen gevonden: de Auditlog-modal sloot niet, snelle Gantt drag/resize-acties konden D1-conflicten veroorzaken, Gantt-labels bedekten rasterlijnen, Capaciteit kon openen op een oude toekomstige periode en mobiele/tablet toolbars waren niet overal duidelijk bereikbaar.

## Root Causes
- Auditlog gebruikte een statische modal met alleen een class-toggle, zonder Escape-handler en zonder focusherstel.
- Remote D1 saves werden gedebounced maar niet geserialiseerd; een nieuwe save kon starten terwijl een eerdere PUT nog liep.
- Externe Gantt-labels kregen te veel breedte en een te zichtbare witte achtergrond.
- Capaciteit accepteerde eerder opgeslagen UI-periodes ook wanneer die niet meer overlapten met de actuele planningrange.
- Mobiele responsive CSS verborg scrollbars op toolbars, waardoor horizontale bereikbaarheid onduidelijk was.

## Aangepaste Bestanden
- `layers/laag10_instellingen.html`
- `js/core/store.js`
- `layers/laag4_gantt.html`
- `layers/laag5_capaciteit.html`
- `css/theme.css`
- `package.json`
- `scripts/live-regression-fixes-d1-gantt-mobile-preflight.mjs`

## Fixes
- Auditlog-modal sluit via X, backdrop en Escape, en geeft focus terug aan de opener waar mogelijk.
- D1 remote saves lopen via een centrale queue met `remoteSaveInFlight` en `remoteSaveQueued`, zodat snelle Gantt-mutaties sequentieel worden opgeslagen.
- Gantt-labels zijn smaller geclamped, krijgen ellipsis en gebruiken een compactere, halftransparante achtergrond.
- Capaciteit berekent een default range vanaf huidige week min 3 weken tot laatste planning plus 3 weken en negeert stale opgeslagen periodes buiten die range.
- Mobiele/tablet toolbars houden horizontale scroll, met zichtbare dunne scrollbars.

## D1 Bewaking
Chunked D1 save/load, raw-state payload, boot save guards en fallbackbescherming zijn behouden. De nieuwe savequeue verandert alleen de volgorde van remote PUTs en voorkomt parallelle saves; lokale fallback blijft geen D1-state overschrijven zolang D1 bereikbaar is.

## Tests Uitgevoerd
- `npm.cmd ci`
- `npm.cmd run lint:syntax`
- `npm.cmd run preflight:live-regression`
- `npm.cmd run preflight:v88`
- `npm.cmd run preflight:all`
- `npm.cmd run build`
- `npm.cmd run test:e2e`
- `npm.cmd test`

Alle bovenstaande checks zijn geslaagd. De E2E-suite gebruikte de bestaande fallback/headless Chrome/responsive smoke-tests van deze repository.

## Open Punten
Geen lokale blokkades. Live D1-conflictgedrag met echte productieconcurrency kan pas na deploy definitief worden bewezen.

## Live Testplan
1. Open `https://planning-cop.pages.dev/`.
2. Open Instellingen -> Systeem & Data -> Auditlog en sluit via X en Escape.
3. Open Gantt, sleep/resize een niet-kritieke taak 10 keer snel en wacht op sync.
4. Controleer dat geen D1-conflict verschijnt en refresh om datums te verifiëren.
5. Controleer lange Gantt-labels op dag/week/maand zoom.
6. Open Capaciteit en controleer start rond huidige week min 3 weken, niet 2029.
7. Controleer Gantt/Capaciteit/Projectoverzicht/Instellingen op 390, 768, 1024 en desktop.
8. Controleer dat Cloudflare D1-status actief blijft en geen fallback/SQLITE_TOOBIG/503 verschijnt.
