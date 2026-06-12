# CWS Planning V44 — Gantt print raster en uitlijning

Gebouwd op V43.

## Doel
De Gantt A3-print professioneel herstellen op basis van de laatste visuele controle:
- elke dag een dunne lijn;
- vrije dagen niet dikker dan normale daglijnen;
- tabel en diagram exact dezelfde rijhoogte;
- scheidingslijn tussen tabel en diagram van boven tot onder;
- buitenlijnen/rasterlijnen exact dezelfde dikte;
- kalender doorlopend tot einde printbreedte;
- diagramlettertype gelijk aan tabellettertype.

## Techniek
- V44 print CSS-override toegevoegd in `layers/laag4_gantt.html`.
- Echte `.day-grid-line` elementen toegevoegd per dag per rij tijdens printmodus.
- Eén centrale rijhoogtevariabele `--v44-print-row-h` voor printtaak-tabel en diagram-lanes.
- Eén centrale headerhoogte `--v44-print-head-h` voor tabelkop en timeline.
- Printbreedte voor kalender verhoogd en subpixel dayWidth gebruikt.

## Checks
- `npm ci`
- `npm run lint:syntax`
- `npm run preflight:v28` t/m `npm run preflight:v44`
- `npm run test:e2e`

Alle checks groen bij oplevering.
