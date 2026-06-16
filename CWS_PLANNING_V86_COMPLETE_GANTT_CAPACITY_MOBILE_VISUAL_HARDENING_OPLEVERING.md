# CWS Planning V86 Complete Gantt Capacity Mobile Visual Hardening

## 1. Probleemomschrijving
V86 richt zich op de zichtbare en functionele afronding van Gantt, Capaciteit, scrollgedrag en responsive gebruik. De belangrijkste problemen waren brede Gantt-labelvlakken door het dagraster, ontbrekende fase-invoer, ontbrekende multiselect/bulkacties, ontbrekende dubbelklik op taakbalken, een te korte capaciteitsrange en onvoldoende expliciete regressiebewaking op D1/chunked state.

## 2. Root causes
- Gantt-labels konden buiten hun compacte tekstbreedte renderen en daarmee rasterlijnen en niet-werkbare dagen visueel bedekken.
- De Gantt-toolbar had geen afzonderlijke faseknop en geen bulkselectiestatus.
- Selectie was enkelvoudig; Ctrl/Shift-ranges en bulkmutaties bestonden niet als aparte UI-state.
- Taakbalken selecteerden wel, maar openden de bestaande taakpopup niet consequent via dubbelklik.
- Capaciteit had wel een centrale Gantt-urenrebuild, maar miste expliciete V86-contractnamen en een standaardrange gebaseerd op huidige week plus laatste planning.

## 3. Aangepaste bestanden
- `index.html`
- `package.json`
- `functions/api/health.js`
- `js/core/store.js`
- `layers/laag4_gantt.html`
- `layers/laag5_capaciteit.html`
- `playwright/server.js`
- `scripts/e2e-fallback.mjs`
- `scripts/v86-complete-gantt-capacity-mobile-visual-hardening-preflight.mjs`
- `CWS_PLANNING_V86_COMPLETE_GANTT_CAPACITY_MOBILE_VISUAL_HARDENING_OPLEVERING.md`

## 4. Gantt label/raster fix
Gantt-labels zijn compacter gemaakt met `max-width`, `overflow:hidden`, `text-overflow:ellipsis`, `white-space:nowrap`, `pointer-events:none` en beperkte padding. Brede witte labelbanen zijn verwijderd of teruggebracht tot compacte translucent tekstlabels. Balken en raster blijven leidend; daglijnen en niet-werkbare-dagen-shades blijven zichtbaar.

## 5. Nieuwe fase knop
De Gantt-toolbar bevat nu `Nieuwe fase` naast taak toevoegen. De knop maakt een summary/fase aan met naam `Nieuwe fase`, veilige start/eind/duration, afdeling `Fase` of de geselecteerde afdeling, status `Niet gestart`, geen voorgangers, `locked:false`, herkenbare kleur en nul taakuren. De fase wordt via het bestaande savepad opgeslagen.

## 6. Ctrl/Shift bulkacties
Gantt heeft nu UI-only multiselect: klik selecteert een rij, Ctrl/Cmd+klik togglet, Shift+klik selecteert een bereik, Escape wist selectie en projectwissel reset de selectie. Bulkacties ondersteunen status, urenbron Auto/Handmatig, lock/unlock, afdeling, kleur, werkdagen verschuiven en verwijderen met confirm. Summary-verwijdering waarschuwt als kinderen mee verwijderd worden.

## 7. Dubbelklik taakbalk
Dubbelklik op een taakbalk of balklabel opent dezelfde taakpopup als de tabelrij. Drag/resize wordt afgeschermd met pointermove-drempel en drag-state checks, zodat een echte sleepactie niet per ongeluk de popup opent.

## 8. Capaciteit doorberekening
De bestaande Gantt-urenrebuild blijft de SSOT. V86 voegt expliciete contractnamen toe: `buildHoursByDayFromGantt`, `buildSourcesByDayFromGantt` en `recalculateCapacityFromGantt`. Summary/fase-rijen tellen niet mee, Auto verdeelt projecturen per afdeling over werkbare dagen, handmatige uren winnen alleen wanneer expliciet ingesteld, en niet-werkbare dagen krijgen geen uren.

## 9. Capaciteit datumrange
Capaciteit gebruikt standaard huidige week maandag minus 3 weken tot de zondag van de laatste planningsweek plus 3 weken. Als er geen planning is, valt de range terug op huidige week -3 tot +8 weken. Bestaande opgeslagen gebruikersperiode blijft behouden.

## 10. Scrollbarcontrole
Gantt-toolbar en Gantt-board hebben expliciete horizontale scroll. Capaciteit, Projecten en Projectoverzicht behouden eigen scrollcontainers. Popups blijven intern scrollbaar via bestaande modalregels. De V86-preflight bewaakt de belangrijkste scrollcontainers.

## 11. Mobiel/tablet verbeteringen
De Gantt-toolbar blijft op kleine schermen horizontaal scrollbaar met zichtbare scrollbar en vaste knophoogte. Bulkacties, filters, projectkeuze, taak toevoegen en Nieuwe fase blijven bereikbaar zonder body-overflow als primaire navigatie. Capaciteit en tabellen blijven horizontaal scrollbaar.

## 12. D1 regressiebewaking
Chunked D1 save/load, manifest-load, boot-save guard en render/save-loop guards zijn behouden. `functions/api/health.js` staat op `internal-test-v86`; `playwright/server.js` staat op `local-test-v86`. V82/V85-preflights blijven groen.

## 13. Tests uitgevoerd
- `npm.cmd ci`
- `npm.cmd run lint:syntax`
- `npm.cmd run preflight:all`
- `npm.cmd run preflight:v82`
- `npm.cmd run preflight:v83`
- `npm.cmd run preflight:v84`
- `npm.cmd run preflight:v85`
- `npm.cmd run preflight:v86`
- `npm.cmd run build`
- `npm.cmd test`
- `npm.cmd run test:e2e`

Alle bovenstaande checks zijn groen.

## 14. Visuele controles
De bestaande headless Chrome responsive smoke in `test:e2e` controleert 390, 768, 1024 en 1440 px flows en modules zonder kritieke consolefouten. De in-app browser en losse screenshot-capture konden in deze omgeving niet betrouwbaar starten door Windows sandbox/procesbeperkingen; daarom zijn echte PNG-screenshots niet als bewijs meegeleverd.

## 15. Open punten
- Productie-D1 save/load is lokaal niet live tegen Cloudflare bewezen.
- Handmatige visuele screenshot-QA in een echte browser na deploy blijft nodig.
- Mobiele touch-drag blijft conservatief: detail/popupfallback is belangrijker dan risicovolle touch-drag-mutaties.

## 16. Live controle na deploy
Controleer na deploy: productie opent met D1, Projecten laadt, Gantt opent, labels zijn compact, Nieuwe fase werkt, taak toevoegen werkt, dubbelklik opent taakgegevens, Ctrl/Shift-selectie werkt, bulkactie vraagt confirm, Capaciteit rekent direct na Gantt-mutatie, range loopt van huidige week -3 tot laatste planning +3, Projecten/Gantt/Capaciteit/Projectoverzicht scrollen volledig, mobiel 390 px en tablet 768 px houden knoppen bereikbaar, geen console errors, geen `SQLITE_TOOBIG`, geen 503 state-load, save blijft na refresh.

## 17. Rollback
Rollback via revert van de V86-commit. De wijziging is bewust beperkt tot Gantt UI, capaciteitrange, store-contractaliases, versie/preflight/testbestanden en dit opleverdocument. D1-schema en bestaande data worden niet gemigreerd of verwijderd.
