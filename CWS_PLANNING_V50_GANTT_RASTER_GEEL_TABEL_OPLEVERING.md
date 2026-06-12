# CWS Planning V50 — Gantt raster dunner + geel alleen in tabel

## Doel
Deze versie verwerkt de twee gevraagde Gantt-correcties:

1. De dag-/rasterlijnen in het diagram zijn dunner gemaakt, ook bij niet-werkbare dagen.
2. De gele samenvattingsmarkering loopt niet meer door in het Gantt-diagram en blijft alleen in de linkertabel/printtaaktabel zichtbaar.

## Aangepast

### Gantt raster / niet-werkbare dagen
- Nieuwe V50 CSS-laag toegevoegd in `layers/laag4_gantt.html`.
- Niet-werkbare dagen behouden hun lichtgrijze vulling.
- Daglijnen blijven zichtbaar over de niet-werkbare vlakken.
- Dubbele lijnen uit V49 zijn geneutraliseerd door de extra `::after`-lijn uit te schakelen.
- Printdaglijnen zijn lichter en dunner gezet.
- Rij-/daglijnen in print zijn subtieler, zodat het diagram rustiger oogt.

### Gele balk alleen in tabel
- De gele samenvattingskleur blijft behouden in de print-/linkertabel (`summary-row`).
- De diagram-lane (`summary-lane`) wordt niet meer geel weergegeven.
- Zowel scherm- als printweergave zijn afgevangen.

### Checks
- Nieuwe `preflight:v50` toegevoegd.
- Fallback E2E uitgebreid met V50-regressiecontrole.

## Uitgevoerde controles
- `npm ci`
- `npm run lint:syntax`
- `npm run preflight:v28`
- `npm run preflight:v29`
- `npm run preflight:v30`
- `npm run preflight:v31`
- `npm run preflight:v32`
- `npm run preflight:v33`
- `npm run preflight:v34`
- `npm run preflight:v35`
- `npm run preflight:v36`
- `npm run preflight:v37`
- `npm run preflight:v38`
- `npm run preflight:v39`
- `npm run preflight:v40`
- `npm run preflight:v41`
- `npm run preflight:v42`
- `npm run preflight:v43`
- `npm run preflight:v44`
- `npm run preflight:v45`
- `npm run preflight:v46`
- `npm run preflight:v47`
- `npm run preflight:v48`
- `npm run preflight:v49`
- `npm run preflight:v50`
- `npm run test:e2e`

## Niet volledig bewezen
Echte Playwright/Chromium-browservalidatie is in deze omgeving niet opnieuw uitgevoerd. De aanwezige E2E-run is de fallback-regressiesuite zonder browserdownload.
