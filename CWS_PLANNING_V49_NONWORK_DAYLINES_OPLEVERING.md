# CWS Planning V49 — Gantt niet-werkbare dagen met zichtbare daglijnen

## Doel
V49 verwerkt de visuele correctie op de Gantt/printweergave: niet-werkbare dagen blijven lichtgrijs zichtbaar, maar de dagkolommen/lijnen blijven over deze vlakken heen zichtbaar als extreem dunne donkere/zwarte verticale lijnen.

## Aangepast
- `layers/laag4_gantt.html`
  - Nieuwe V49 CSS-laag toegevoegd.
  - Niet-werkbare dagvlakken houden een lichtgrijze achtergrond.
  - Daglijn links en rechts van ieder niet-werkbaar dagvlak blijft zichtbaar.
  - In print krijgt `.day-grid-line` een hogere laag dan `.nonwork-shade`, zodat de lijn niet meer onder het grijze vlak verdwijnt.
  - Geen dikke borders op niet-werkbare dagen.
  - Timeline-header houdt dezelfde donkere dunne scheiding bij weekend/niet-werkbaar.

- `scripts/v49-nonwork-daylines-preflight.mjs`
  - Nieuwe statische regressiecontrole voor deze exacte eis.

- `scripts/e2e-fallback.mjs`
  - Fallback E2E uitgebreid met V49-regressiecheck.

- `package.json`
  - Nieuw script toegevoegd: `npm run preflight:v49`.

## Controlepunten
- Niet-werkbare dagen zijn nog steeds herkenbaar als lichtgrijs vlak.
- Dagindeling blijft zichtbaar over het lichtgrijze vlak.
- De lijnen zijn dun en donker/zwart.
- Print blijft schoon zonder toolbars/menu’s.
- Bestaande V28 t/m V48 preflights blijven behouden.

## Uitvoeren
```bash
npm ci
npm run lint:syntax
npm run preflight:v28
npm run preflight:v29
npm run preflight:v30
npm run preflight:v31
npm run preflight:v32
npm run preflight:v33
npm run preflight:v34
npm run preflight:v35
npm run preflight:v36
npm run preflight:v37
npm run preflight:v38
npm run preflight:v39
npm run preflight:v40
npm run preflight:v41
npm run preflight:v42
npm run preflight:v43
npm run preflight:v44
npm run preflight:v45
npm run preflight:v46
npm run preflight:v47
npm run preflight:v48
npm run preflight:v49
npm run test:e2e
```

## Push-command
```powershell
Set-Location "C:\Planning"; git add -A; git commit -m "V49 Gantt non-working day lines" ; git push -u origin main
```
