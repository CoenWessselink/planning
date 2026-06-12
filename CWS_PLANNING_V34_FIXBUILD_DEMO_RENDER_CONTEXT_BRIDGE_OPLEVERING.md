# CWS Planning V34 — Fixbuild demo-rendering en iframe-store bridge

## Doel
Deze build herstelt de blokkades uit de V33-agenttest:

- demo-data zichtbaar krijgen in Projecten / Gantt / Capaciteit;
- Nieuw project robuust openen;
- tests betrouwbaarder maken bij file:// of lokale test zonder backend;
- Instellingen → Bedrijf/logo bereikbaar houden;
- Capaciteit en Gantt testbaar houden met seeded demo-data.

## Aangepast

- Alle laag-HTML modules krijgen een veilige CWS-store bridge:
  - gebruikt parent `window.CWS` wanneer beschikbaar;
  - valt terug op lokale `js/core/store.js` wanneer de module los of via file:// wordt geopend.
- Projecten corrigeert ongeldige `ui.lastTab` automatisch naar `Alle`, zodat projecten niet verborgen blijven door een oude tabwaarde.
- Demo-data blijft tenant/global localStorage synchroniseren.
- V34 functionele preflight toegevoegd: `npm run preflight:v34`.
- E2E fallback-test uitgebreid met V34-controles.

## Controles

Uitgevoerd:

```powershell
npm ci
npm run lint:syntax
npm run preflight:v28
npm run preflight:v29
npm run preflight:v30
npm run preflight:v31
npm run preflight:v32
npm run preflight:v33
npm run preflight:v34
npm run test:e2e
```

Resultaat:

- `npm ci` geslaagd.
- `lint:syntax` geslaagd.
- `preflight:v28` t/m `preflight:v34` geslaagd.
- `test:e2e` fallback geslaagd.

## Niet volledig bewezen

Echte Playwright/Chromium-browservalidatie blijft afhankelijk van lokale Playwright-installatie. In deze omgeving is Playwright-download niet betrouwbaar beschikbaar.
