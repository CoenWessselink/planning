# CWS Planning V42 — Printstijl Tasche + raster + afhankelijkheidspijlen

Gebouwd op V41.

## Aangepast
- Print gebruikt Tasche-logo asset als fallback wanneer geen bedrijfslogo in state is opgeslagen.
- Printtabel krijgt lichtgrijze wisselrijen.
- Hoofdregels/samenvattingsregels krijgen Tasche-geel.
- Printtabel en diagram gebruiken dezelfde rijhoogte en dezelfde dunne lijndikte.
- Elke dagkolom en elke taakrij heeft een zichtbaar compleet raster.
- Afhankelijkheden krijgen orthogonale lijnen met pijlmarker.
- Afhankelijkheidslijnen worden via rij-gutters gerouteerd zodat ze zo veel mogelijk niet door taakbalken lopen.
- Template-editor houdt Nr/Fase/Taak/Voorgangers sticky zichtbaar bij horizontaal scrollen.

## Checks
- npm ci
- lint:syntax
- preflight v28 t/m v42
- fallback E2E
