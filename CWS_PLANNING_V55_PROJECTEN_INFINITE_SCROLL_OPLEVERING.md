# CWS Planning V55 — Projecten Infinite Scroll

## Doel
Projecten moet alle projecten op één pagina tonen zonder paginering. De gebruiker moet verticaal kunnen scrollen door alle projecten.

## Aangepast
- Projecten-tabel toont alle gefilterde projecten op één pagina.
- Paginering is visueel uitgeschakeld.
- Vorige/volgende knoppen zijn inert gemaakt.
- Footer toont: `Alles op 1 pagina • Infinite scroll`.
- Projecten-tabel heeft een eigen verticale scrollzone, zodat de horizontale tabelscrollbar onderin zichtbaar blijft.
- Dynamische afdelingskolommen, bewerken, zoeken, tabs, export en print blijven behouden.

## Checks
- `npm ci`
- `npm run lint:syntax`
- `npm run preflight:v28` t/m `npm run preflight:v55`
- `npm run test:e2e`
