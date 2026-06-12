# CWS Planning V61 — Bootfix CWS.init / store TDZ regressie

## Aanleiding
Na V60 startte de applicatie niet meer en werd in de browser getoond:

- `CWS Planning kon niet starten`
- `CWS.init is not a function`
- Console: `Cannot access 'num' before initialization` in `js/core/store.js`

De oorzaak was een runtime-fout tijdens het laden van `store.js`. Daardoor werd de CWS API niet geëxporteerd naar `window.CWS` en kon `index.html` `CWS.init()` niet aanroepen.

## Oplossing
- `const num = baseNum` is verplaatst naar het begin van `store.js`, direct na `baseNum`.
- De late dubbele declaratie van `num` is verwijderd.
- Hierdoor kan `normalizeState()` bestaande Gantt-data met taakuren normaliseren zonder TDZ/runtime-fout.
- `window.CWS.init` blijft beschikbaar, ook wanneer localStorage/D1-state al bestaande Gantt-taken bevat.
- Health-versie herkenbaar gemaakt als `internal-test-v61`.
- V60 raw-state recovery, V59 werkbare-dagenlogica en alle eerdere UI/printwijzigingen blijven behouden.

## Extra borging
Nieuwe preflight toegevoegd:

- `npm run preflight:v61`

Deze simuleert store-boot met bestaande lokale Gantt-data en controleert expliciet:

- geen TDZ-runtimefout;
- `CWS.init` is een functie;
- CWS API blijft beschikbaar;
- `num` staat vóór `load()`/`normalizeState()` runtimegebruik;
- health toont `internal-test-v61`.

## Uitgevoerde checks
- `npm ci`
- `npm run lint:syntax`
- `npm run preflight:v28` t/m `npm run preflight:v61`
- `npm run test:e2e`

## Deploy-controle
Na deploy moet in Self-test / Preflight bij Health zichtbaar zijn:

```json
"version": "internal-test-v61"
```

De melding `CWS.init is not a function` mag daarna niet meer verschijnen.
