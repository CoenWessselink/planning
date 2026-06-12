# CWS Planning V51 — Printkalender boven en onder Gantt-tabel

## Doel
De Gantt-printweergave is aangepast zodat de kalender/tijdlijn direct boven de printtabel en het diagram staat en dezelfde kalender onderaan opnieuw wordt getoond.

## Aangepast
- Printkalender direct boven de Gantt-tabel/het diagram toegevoegd.
- Identieke printkalender onder de Gantt-tabel/het diagram toegevoegd.
- Linker deel van de bovenste en onderste kalender bevat de printtabel-kolomkoppen, zodat de rijen direct onder de kalender beginnen.
- De oude chart-only timeline wordt in print verborgen om dubbele kalenderweergave en extra witruimte te voorkomen.
- Afhankelijkheidslijnen en vandaaglijn zijn opnieuw op het rijgebied uitgelijnd voor de printweergave.
- V50-correcties blijven behouden: dun raster, herkenbare niet-werkbare dagen en gele markering alleen in de linker printtabel.

## Controle
- `npm run lint:syntax`
- `npm run preflight:v51`
- `npm run test:e2e`

## Bestanden
- `layers/laag4_gantt.html`
- `scripts/v51-print-calendar-top-bottom-preflight.mjs`
- `scripts/e2e-fallback.mjs`
- `package.json`
