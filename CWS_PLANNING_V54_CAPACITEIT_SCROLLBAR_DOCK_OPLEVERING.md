# CWS Planning V54 — Capaciteit horizontale scrollbar altijd zichtbaar

## Doel
Capaciteit moet dezelfde zichtbare horizontale scrollbar krijgen als Projectoverzicht. De scrollbar moet ook bij een brede browser en een beperkt aantal weken in beeld blijven, zodat de gebruiker direct ziet dat de capaciteitstabel horizontaal verplaatsbaar is.

## Aangepast
- `layers/laag5_capaciteit.html`
  - Capaciteit-shell blokkeert sticky-positionering niet meer met `overflow:hidden`.
  - Matrixbreedte geforceerd breder dan viewport: `width:max(2200px,calc(100vw + 420px))`.
  - Matrix-wrapperhoogte verkleind zodat de scrollbar-dock zichtbaar binnen het scherm valt.
  - Scrollbar-dock duidelijker gemaakt met rand, schaduw en dezelfde zichtbare thumb-stijl als Projectoverzicht.
  - Scroll-proxy synchronisatie versterkt: filler is altijd minimaal breder dan de viewport.

- `scripts/v54-capacity-scrollbar-dock-preflight.mjs`
  - Nieuwe regressiecheck voor de V54 scrollbar-eis.

- `package.json`
  - Nieuw script: `npm run preflight:v54`.

- `scripts/e2e-fallback.mjs`
  - V54-regressiecheck toegevoegd.

## Controle
- `npm ci`
- `npm run lint:syntax`
- `npm run preflight:v28` t/m `npm run preflight:v54`
- `npm run test:e2e`
