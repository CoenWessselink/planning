# CWS Planning V57 — D1 Worker resource hardening

## Doel
V57 voorkomt dat de Cloudflare Pages Function/Worker onnodig zwaar werk uitvoert bij health, state-load en state-save. Dit is gericht op de melding:

- `Error 1102: Worker exceeded resource limits`
- `State laden mislukt (503)`
- `Opslag: D1 niet bereikbaar - lokale fallback`

## Aangepast

### 1. `/api/health` ultralicht gemaakt
- Laadt geen planning-state meer.
- Voert geen automatische schema-migratie meer uit.
- Doet alleen een lichte D1-connectiecheck en schema-verificatie.
- Geeft `healthMode: v57-lightweight-no-state-load` terug.

### 2. `/api/state` GET lichter gemaakt
- De Worker parseert `state_json` niet meer naar een groot JavaScript-object.
- De Worker retourneert `stateJson` als string.
- De browser parseert de state één keer zelf.
- Dit voorkomt dubbele Worker CPU-belasting: `JSON.parse(row.state_json)` + response stringify.

### 3. `/api/state` PUT lichter gemaakt
- De browser stuurt de volledige state als raw JSON.
- `baseVersion` gaat via query/header mee.
- De Worker hoeft geen wrapper-object `{ state, baseVersion }` meer te parsen.
- De Worker slaat de raw `stateJson` direct op.

### 4. Schema-repair alleen wanneer nodig
- `state`, `audit` en `users` voeren eerst een lichte schema-check uit.
- Alleen bij ontbrekende tabellen/kolommen wordt `ensureSchema()` uitgevoerd.

## Behouden
- Optimistic locking met `baseVersion` blijft actief.
- D1-versienummer blijft actief.
- Gebruikersrechten blijven actief.
- Audit blijft actief, maar schrijft alleen kleine metadata.
- Lokale fallback blijft als noodmodus bestaan.

## Tests
- `npm ci`
- `npm run lint:syntax`
- `npm run preflight:v28` t/m `npm run preflight:v57`
- `npm run test:e2e`

## Verwachte uitkomst na deploy
Na deploy moet de app weer kunnen laden met:

- `Opslag: Cloudflare D1 - gedeelde interne testdata`
- geen 503 bij `/api/health`
- geen Worker 1102 bij normale state-load/save
- wijzigingen opnieuw gedeeld zichtbaar voor collega’s
