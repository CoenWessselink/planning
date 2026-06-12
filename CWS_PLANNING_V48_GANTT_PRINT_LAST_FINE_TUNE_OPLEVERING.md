# CWS Planning V48 — Gantt print laatste finetuning

Gebouwd op V47.

## Aangepast
- Tasche-logo in Gantt print 1,5x groter dan V47.
- Diagramlettertype hard gelijkgetrokken met tabel: Arial/Helvetica.
- Diagram-taakrijlijnen en daglijnen gebruiken dezelfde dunne lijndikte.
- Niet-werkbare dagen blijven zichtbaar als subtiel lichtgrijs vlak.
- Tabel/diagram blijven op dezelfde vaste rijhoogte en headerhoogte.
- Scheidingslijn tussen tabel en diagram blijft als buitenlijn aanwezig.

## Checks
- npm ci
- npm run lint:syntax
- npm run preflight:v28 t/m v48
- npm run test:e2e
