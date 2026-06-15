# CWS Planning V75 – Gantt Pointer Lifecycle Fix

## Doel
Deze build is bewust klein en gericht. V75 lost de resterende vastloper op bij Gantt-balken verslepen en verbreden/verkleinen, waarbij `saveModel()` via `CWS.setState()` / `CWS.gantt.saveProjectGantt()` synchronisch een subscriber-render kon veroorzaken terwijl de pointer-afronding nog bezig was.

## Root cause
Tijdens `pointerup` riep `finishPointerMutation()` `saveModel()` aan. `saveModel()` wijzigde de centrale state en triggerde direct de `CWS.subscribe()` callback. Die callback riep meteen `render()` aan, waardoor de volledige Gantt-DOM opnieuw werd opgebouwd terwijl de pointermutatie nog niet volledig was afgerond.

Effect:
- oude `.bar` elementen verdwenen tijdens de pointer-afronding;
- pointer capture op de oude bar verviel;
- nieuwe bars/listeners werden pas na render opnieuw opgebouwd;
- drag/resize kon abrupt stoppen of de browser vast laten lopen;
- er ontstond onnodig dubbele renderbelasting.

## Aangepaste bestanden
- `layers/laag4_gantt.html`
- `scripts/v75-gantt-pointer-lifecycle-preflight.mjs`
- `package.json`

## Oplossing
In `layers/laag4_gantt.html` is de lifecycle van `finishPointerMutation()` aangepast:

1. `UI.drag` blijft actief tot na `saveModel()`.
2. Nieuwe flags toegevoegd:
   - `UI._suppressSubscriberRender`
   - `UI._pendingSubscriberRender`
   - `UI._finishingPointerMutation`
   - `UI._lastPointerLifecycleFix = "v75"`
3. De subscriber render wordt onderdrukt zolang:
   - een pointermutatie wordt afgerond;
   - subscriber-render expliciet gesuppressed is;
   - `UI.drag` nog actief is.
4. `saveModel()` draait onder suppressievlag.
5. In `finally` worden flags altijd hersteld en volgt precies één gecontroleerde `render()`.
6. De V74 performancefix blijft behouden:
   - lichte pointermove-preview;
   - `requestAnimationFrame` preview;
   - `deferPersistence:true`;
   - geen zware deep clone tijdens pointermove.

## Belangrijk verschil met V74
V74 maakte pointermove lichter. V75 voorkomt dat de volledige DOM tijdens pointerup/save opnieuw wordt opgebouwd door de `CWS.subscribe()` callback.

## Nieuwe preflight
Toegevoegd:

```bash
npm run preflight:v75
```

Deze controleert dat:
- de suppressievlaggen bestaan;
- de subscriber de flags respecteert;
- `UI.drag` niet vóór `saveModel()` wordt gewist;
- `saveModel()` onder suppressievlag draait;
- cleanup in `finally` plaatsvindt;
- de directe `CWS.subscribe(()=>{render();})` is verdwenen;
- de V74 performancefix behouden is.

## Uitgevoerde checks
- `npm run lint:syntax`
- `npm run preflight:v74`
- `npm run preflight:v75`
- `npm run preflight:all`
- `npm run build`

## Live controlepunten
Controleer na deploy in Gantt:
1. brede balk verslepen;
2. rechterzijde verbreden/verkleinen;
3. linkerzijde verbreden/verkleinen;
4. meerdere keren achter elkaar slepen/resize;
5. controleren dat er geen vastloper, white screen of console error komt;
6. controleren dat de planning na loslaten blijft staan en wordt opgeslagen.

## Push
```powershell
Set-Location "C:\Planning"

git add -A
git commit -m "V75 fix Gantt pointer lifecycle during drag resize save"
git push -u origin main
```
