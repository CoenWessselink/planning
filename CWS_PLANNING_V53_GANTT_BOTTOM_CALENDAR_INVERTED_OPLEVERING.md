# CWS Planning V53 — Gantt print onderste kalender omgekeerd

## Doel
De kalender aan de onderzijde van de Gantt-print moest niet dezelfde volgorde houden als de bovenste kalender, maar omgekeerd worden opgebouwd.

## Aangepast
- Bovenste printkalender blijft direct boven tabel/diagram staan.
- Onderste printkalender staat direct onder tabel/diagram.
- Onderste kalender is nu opgebouwd van boven naar beneden:
  1. Dag
  2. Week
  3. Maand
  4. Jaar
- Maandregel onderaan toont alleen de maandnaam.
- Jaarregel is toegevoegd als aparte onderste kalenderregel.
- Linkerdeel van de onderste kalender is een lege spacer, zodat onderaan alleen de kalender/tijdlijn wordt herhaald.

## Bestanden
- `layers/laag4_gantt.html`
- `scripts/v51-print-calendar-top-bottom-preflight.mjs`
- `scripts/v53-gantt-bottom-calendar-inverted-preflight.mjs`
- `scripts/e2e-fallback.mjs`
- `package.json`

## Controle
- `npm run lint:syntax`
- `npm run preflight:v28` t/m `npm run preflight:v53`
- `npm run test:e2e`
