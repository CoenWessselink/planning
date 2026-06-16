# CWS Planning V85 — D1 chunked state streaming load fix

## Probleem
Na grote planningwijzigingen kon de productie-app opnieuw melden:

`State laden mislukt (503)`

De app kon lokaal of vanuit browsercache nog wel data tonen, maar de live D1-state load faalde opnieuw.

## Root cause
V82 splitste grote saves wel op in D1-chunks, maar bij het ophalen werd de volledige chunked state server-side opnieuw samengevoegd en als één grote response teruggestuurd. Bij grote planningen kan dat alsnog Cloudflare/D1/Worker-limieten raken en als 503 terugkomen.

## Oplossing
V85 maakt de laadroute ook chunk-aware:

- `/api/state?payload=raw-state&chunks=auto` retourneert bij chunked state eerst een klein manifest.
- De browser haalt daarna afzonderlijke chunks op via `chunkIndex`.
- De browser zet de chunks samen en parseert pas daarna de JSON.
- De Worker hoeft de volledige grote state niet meer in één response op te bouwen.
- Bestaande oversized inline states worden bij GET automatisch gemigreerd naar chunks.
- Kleine/non-chunked states blijven backward compatible laden.

## Aangepaste bestanden
- `functions/api/state.js`
- `functions/api/health.js`
- `js/core/store.js`
- `playwright/server.js`
- `package.json`
- `scripts/v85-d1-chunked-state-streaming-load-preflight.mjs`

## Testen na deploy
1. Open `https://planning-cop.pages.dev/`.
2. Controleer dat de melding `State laden mislukt (503)` verdwijnt.
3. Controleer dat D1 als opslag zichtbaar blijft.
4. Open Projecten, Gantt, Capaciteit en Projectoverzicht.
5. Wijzig één Gantt taak en laat opslaan.
6. Ververs de pagina en controleer dat de wijziging behouden blijft.

## Rollback
Rollback naar V84 kan, maar dan kan de 503 bij grote state-load terugkomen.
