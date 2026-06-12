# CWS Planning V62 — D1 schema recovery + overwrite guard

## Doel
V62 leest de herstelde grote D1-state correct wanneer projecten in het rijke schema staan:

- `projects.order`
- `projects.byId`
- `ganttV2.byProject`
- `gantt.hoursByDay`
- `tasks.byProject`

De eerdere controle keek te vaak naar arrayvelden zoals `projects[]` of `ganttTasks[]`. Daardoor leek de data verdwenen terwijl D1 nog 76 projecten bevatte.

## Aangepast
- State-metrics toegevoegd voor zowel rijk objectschema als legacy arrays.
- Preflight telt projecten op basis van `projects.order` / `projects.byId`.
- V62 toont in Preflight expliciet schema-recovery en remote guard metrics.
- Client-side save guard blokkeert opslaan wanneer een grote D1-state ineens door demo/lege data zou worden vervangen.
- Server-side `/api/state` PUT guard blokkeert dezelfde gevaarlijke overwrite ook bij oude clients.
- Demo data en Data leegmaken vragen nu een harde typed bevestiging bij een grote D1-planning.
- Health marker bijgewerkt naar `internal-test-v62`.

## Verwachte controle na deploy
Preflight moet ongeveer tonen:

- Projecten: 76
- D1 recovery schema: `projects.order/byId`
- Opslag: Cloudflare D1
- Health version: `internal-test-v62`

## Belangrijk
Na deploy eerst openen met Ctrl+F5 of incognito. Niet op Demo data of Data leegmaken klikken.
