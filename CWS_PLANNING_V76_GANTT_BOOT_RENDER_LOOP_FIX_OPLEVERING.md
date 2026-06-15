# CWS Planning V76 — Gantt boot/render-loop fix

## Doel
Gerichte fix voor het probleem waarbij de Gantt-pagina live wel D1-data meldde, maar leeg/traag opstartte en in een zware render/save-loop kon terechtkomen.

## Root cause
De Gantt-rendering had nog een side-effect: `render()` gebruikte `ensureModel()`, en `ensureModel()` kon bij een leeg Gantt-model direct `generateModel()` en `saveModel()` uitvoeren. Daardoor kon op boot of bij legacy/lege modellen de keten ontstaan:

`render()` → `ensureModel()` → `saveModel()` → `CWS.setState()`/notify → subscriber → `render()`

Dit is onveilig, vooral als de projectselectie nog niet stabiel gehydrateerd is. Daarnaast kon de projectselector leeg lijken wanneer `UI.projectId` naar een ongeldig/uitgefilterd project wees.

## Aangepast
- `layers/laag4_gantt.html`:
  - `selectableProjects(st)` toegevoegd.
  - `currentProjectId(st)` stabiel gemaakt en beperkt tot werkelijk selecteerbare projecten.
  - `renderFilters(st)` synchroniseert nu de dropdown en `UI.projectId`.
  - `ensureModel()` is side-effect-vrij gemaakt.
  - `modelForRender()` toont eventueel een render-only preview zonder D1/localStorage-save.
  - `render()` gebruikt geen save/generate-save route meer.
  - `scheduleRender()` toegevoegd om store-subscriber renders te coalescen.
  - subscriber gebruikt geen directe zware render meer, maar `scheduleRender("store-subscribe")`.
- `functions/api/health.js`: versie naar `internal-test-v76`.
- `playwright/server.js` / `scripts/serve.mjs`: lokale testversie naar `local-test-v76`.
- `package.json`: `preflight:v76`.
- `scripts/v76-gantt-boot-render-loop-preflight.mjs`: nieuwe preflight.

## Wat blijft behouden
- V74 pointermove/performancefix.
- V75 pointer lifecycle/suppressie rond `saveModel()`.
- D1 save guards.
- Duplicate taak-id repair.
- Responsive V73 wijzigingen.

## Testadvies na deploy
1. Open Gantt direct na login.
2. Controleer dat de projectdropdown gevuld is.
3. Controleer dat taken/balken zichtbaar zijn bij projecten met Gantt-data.
4. Sleep en resize een brede balk meerdere keren.
5. Ververs pagina en controleer dat planning blijft staan.
6. Controleer browser console op errors.
