# CWS Planning V45 — Dependencylijnen + Gantt printlijnen

## Doel
Gebouwd op V44. Verbetert zichtbaarheid van afhankelijkheden/voorgangers en verfijnt Gantt-printlijnen.

## Aanpassingen
- Afhankelijkheidslijnen in Gantt zijn dikker en donkerder.
- Pijlen zijn groter en beter zichtbaar.
- SVG-laag ligt boven het raster zodat lijnen niet wegvallen.
- Routering gebruikt rij-gutters: lijn komt uit rechts van bronbalk, loopt horizontaal/verticaal en sluit vóór doelbalk aan.
- Printdaglijnen zijn dunner gemaakt.
- Vrije-dagen arcering heeft geen dikke extra border.
- Logo in print is iets groter.
- PDF/documenttitel gebruikt nu: Projectnaam - Projectnummer - Opdrachtgever - Datum.

## Tests
- npm ci
- npm run lint:syntax
- npm run preflight:v28 t/m v45
- npm run test:e2e
