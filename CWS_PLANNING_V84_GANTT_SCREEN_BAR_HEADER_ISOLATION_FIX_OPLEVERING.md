# CWS Planning V84 — Gantt screen bar/header isolation fix

## Probleem
In de Gantt-weergave liepen taakbalken en taaklabels visueel door de kalender/header heen wanneer de planning verticaal werd gescrold. Dit gebeurde op het scherm, niet alleen in print.

## Oorzaak
De sticky timeline/header had een lagere stacking-layer dan Gantt-balken en losse taaklabels. Daardoor konden de lanes onder de sticky header doorschuiven terwijl de balken erboven zichtbaar bleven.

## Oplossing
In `layers/laag4_gantt.html` is een gerichte V84 CSS-fix toegevoegd:

- `.chart-pane` krijgt een eigen stacking-context (`isolation:isolate`).
- `#timeline/.timeline` krijgt op scherm een hoge z-index en blijft boven lanes/balken.
- `#lanes` en `.lane` blijven onder de kalender/header.
- `.lane` knipt verticale overflow af.
- `.bar`, `.bar-text-before` en `.bar-text-after` blijven onder de kalenderlaag.
- `today-line` blijft zichtbaar boven de kalenderlaag.
- Bestaande V80/V81 printregels blijven behouden.

## Aangepaste bestanden
- `layers/laag4_gantt.html`
- `package.json`
- `scripts/v84-gantt-screen-bar-header-isolation-preflight.mjs`
- `CWS_PLANNING_V84_GANTT_SCREEN_BAR_HEADER_ISOLATION_FIX_OPLEVERING.md`

## Tests
Uitgevoerd:

```bash
npm run lint:syntax
npm run preflight:v84
npm run build
node scripts/e2e-fallback.mjs
```

## Live controle
Na deploy controleren:

1. Open Gantt.
2. Kies project `19158 - Sportcentrum Zernike te Groningen`.
3. Zet weergave op `Beide`.
4. Scroll verticaal door de taakrijen.
5. Controleer dat balken en taaklabels niet meer door de kalender/header lopen.
6. Controleer daarna `Print A3`, zodat V80/V81 printinstellingen behouden zijn.
