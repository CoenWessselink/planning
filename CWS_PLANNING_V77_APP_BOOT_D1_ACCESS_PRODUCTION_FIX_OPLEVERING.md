# CWS Planning V77 — App Boot / D1 / Access Production Fix

## Doel
V77 is een gerichte productieboot-fix. De fout zat niet alleen in Gantt: de hele applicatie kon traag of half leeg opstarten doordat de shell tijdens boot direct zware state-normalisatie, Gantt/capaciteitsherberekening, live-readiness en soms een zware Gantt-module startte.

## Root cause
1. `CWS.init()` blokkeerde de eerste render te lang door remote D1-state te laden, te normaliseren, capaciteit/Gantt te herberekenen en live-readiness direct op de main thread uit te voeren.
2. `Router.boot()` gebruikte `state.ui.lastApp`. Daardoor kon de productieomgeving direct zwaar op Gantt starten, voordat de app interactief was.
3. `Router.loadApp()` deed een UI-only `CWS.setState()`, maar `setState()` normaliseerde en herberekende toch de volledige Gantt/capaciteit voordat duidelijk was dat alleen UI-state veranderde.
4. Preview-deployments konden snel lijken omdat ze in lokale fallback draaiden, maar dat was geen echte D1-productietest.
5. D1/Access-fouten en preview/fallback-status waren niet duidelijk genoeg zichtbaar voor de gebruiker.

## Aangepast

### `js/core/store.js`
- V77 marker toegevoegd: `v77-app-boot-d1-access-production-fix`.
- D1 health/state/save fetches hebben nu timeouts:
  - health: 8 seconden;
  - state-load: 18 seconden;
  - state-save: 15 seconden.
- Runtime-detectie toegevoegd voor:
  - productie Pages URL;
  - preview deployment;
  - lokale testomgeving.
- Bootstatus toegevoegd:
  - `booting`;
  - `bootReady`;
  - `bootPhase`;
  - `bootDurationMs`;
  - `accessMissing`;
  - `isPreviewDeployment`.
- Zware post-boot controles worden niet meer vóór de eerste render uitgevoerd.
- `buildLiveReadinessReport()` en eventuele capacity-rebuild worden uitgesteld via `schedulePostBootIntegrityCheck()`.
- `setState()` heeft nu een V77 UI-only fast path:
  - router/menu/tab wijzigingen schrijven lokaal;
  - geen Gantt/capacity rebuild;
  - geen remote D1 PUT;
  - geen zware validate/save-route.
- D1-state wordt bij boot geladen en genormaliseerd, maar niet direct volledig doorgerekend vóór de UI interactief is.

### `js/core/router.js`
- Boot start standaard op `Projecten`, tenzij expliciet gekozen via:
  - `?app=gantt`
  - `#gantt`
  - of een andere geldige app-id.
- Hiermee wordt voorkomen dat productie automatisch op een zware Gantt-render opent door een oude `ui.lastApp` in D1.

### `index.html`
- Storage/bootstatus toont nu duidelijker:
  - laden;
  - preview/fallback;
  - Access-identiteit ontbreekt;
  - D1-syncstatus.

### `functions/api/health.js`
- Health versie naar `internal-test-v77`.
- Health blijft lichtgewicht en laadt geen grote state.

### `playwright/server.js` en `scripts/serve.mjs`
- Lokale testversie naar `local-test-v77`.

### Tests/preflight
- Nieuw script: `scripts/v77-app-boot-d1-access-production-preflight.mjs`.
- Nieuw package script: `preflight:v77`.
- `preflight:all` neemt V77 automatisch mee.
- Responsive smoke-test accepteert nu ook `local-test-v77`.

## Wat bewust niet is veranderd
- Geen redesign.
- Geen dataverwijdering.
- Geen nieuwe functionele modules.
- Geen D1-schemawijziging.
- Geen wijziging aan de Gantt drag/resize lifecycle uit V74/V75, behalve dat de shell er niet meer onnodig zwaar op boot.

## Uitgevoerde checks
Groen in deze workspace:

```powershell
npm run lint:syntax
npm run preflight:v77
npm run preflight:all
npm run build
node scripts/e2e-fallback.mjs
```

`preflight:all` draaide alle preflights t/m V77 groen.

## Beperking browsertest
De headless Chrome-test in deze sandbox wordt beïnvloed door een Chromium/container-policy waarbij `127.0.0.1` wordt geblokkeerd. Daarom is echte live-browservalidatie op Cloudflare na deploy noodzakelijk.

## Live controle na deploy
Controleer op:

```text
https://planning-cop.pages.dev/
```

1. App opent eerst snel op Projecten.
2. Bovenbalk toont `Cloudflare D1 - gedeelde interne testdata (76 projecten)`.
3. Geen minutenlange hang bij opstart.
4. Apps Menu opent direct.
5. Projecten toont data.
6. Gantt openen via Apps Menu.
7. Gantt toont projectdropdown en balken.
8. Gantt drag/resize 5 tot 10 keer testen.
9. Capaciteit openen en controleren of data/scrollbar werkt.
10. Console controleren op rode errors.

## Belangrijk verschil productie vs preview
Een URL zoals:

```text
https://4a16ebfe.planning-cop.pages.dev/
```

kan snel lijken, maar draait mogelijk in preview/fallback zonder echte D1/Access. Productiecontrole moet gebeuren op:

```text
https://planning-cop.pages.dev/
```

## Push-command

```powershell
Set-Location "C:\Planning"

git add -A
git commit -m "V77 fix app boot D1 Access production startup"
git push -u origin main
```
