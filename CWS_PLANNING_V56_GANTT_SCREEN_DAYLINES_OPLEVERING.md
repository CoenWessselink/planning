# CWS Planning V56 — Gantt daglijnen zichtbaar in schermdiagram

## Doel
In de normale Gantt-schermweergave ontbraken de dunne verticale daglijnen in het diagram. Daardoor was de dagindeling in de balkzone niet duidelijk genoeg zichtbaar.

## Aangepast
- `layers/laag4_gantt.html`
  - `day-grid-line` wordt nu ook in normale schermweergave gerenderd, niet alleen in printmodus.
  - Dunne verticale daglijnen zijn zichtbaar over de volledige hoogte van elke Gantt-rij.
  - Daglijnen liggen boven de achtergrond en niet-werkbare dagvlakken, maar onder taakbalken en tekstlabels.
  - Niet-werkbare dagen blijven herkenbaar met een lichte grijze achtergrond.
  - Printgedrag van V50/V51/V53 blijft behouden.

## Validatie
- `npm run lint:syntax`
- `npm run preflight:v28` t/m `npm run preflight:v56`
- `npm run test:e2e`

## Verwacht resultaat
In Gantt zijn in het diagram zelf weer overal dunne verticale daglijnen zichtbaar, zowel op werkbare dagen als door niet-werkbare dagvlakken heen.
