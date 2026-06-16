# CWS Planning V82 — D1 state-size en save-fix

## Doel
V82 lost de productie-fout op waarbij wijzigingen niet meer naar Cloudflare D1 konden worden opgeslagen door:

`D1_ERROR: string or blob too big: SQLITE_TOOBIG`

De oorzaak is dat de volledige planning-state als één grote JSON/TEXT-waarde in `app_state.state_json` werd opgeslagen. Bij grote projecten, Gantt-data, revisies, diagnostics en print/runtime-informatie kan die ene waarde te groot worden voor SQLite/D1.

## Root cause
- De client stuurt de tenant-state als één JSON-string naar `/api/state`.
- De server schreef die volledige string direct naar `app_state.state_json`.
- Bij grote planning-state overschreed die ene TEXT/blob de D1/SQLite limiet.
- Daardoor bleef de app lokaal wel werken, maar kreeg de gebruiker bovenin de melding dat wijzigingen niet gesynchroniseerd waren met D1.

## Oplossing
### 1. Chunked D1 state storage
`functions/api/state.js` ondersteunt nu grote states via chunked opslag:

- Kleine state blijft normaal in `app_state.state_json` staan.
- Grote state wordt gesplitst in `app_state_chunks`.
- `app_state.state_json` bevat dan alleen een kleine manifest-string.
- GET `/api/state?payload=raw-state` assembleert de chunks weer tot dezelfde volledige JSON-state.
- De browser hoeft niets anders te doen; de API blijft backwards compatible.

Nieuwe serverfuncties:
- `ensureChunkSchema(db)`
- `buildChunkManifest(...)`
- `parseChunkManifest(...)`
- `splitStateIntoChunks(...)`
- `readFullStateJson(db, row)`
- `writeFullStateJson(db, stateJson, nextVersion, email)`

Nieuwe tabel:

```sql
CREATE TABLE IF NOT EXISTS app_state_chunks (
  tenant_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, state_key, version, chunk_index)
)
```

### 2. Remote save projection
`js/core/store.js` maakt nu vóór remote save een opgeschoonde projectie:

- planningdata blijft behouden;
- transient UI-data wordt niet naar D1 geschreven;
- zware diagnostics/previewdata worden verwijderd;
- auditlog in de state wordt begrensd;
- D1 audit blijft los via `audit_log` bestaan.

Nieuwe clientfuncties:
- `createRemoteSaveSnapshot(...)`
- `remoteSnapshotBytes(...)`

### 3. Betere statusinformatie
De client bewaart nu:
- `storageStatus.lastRemoteBytes`
- `storageStatus.lastRemoteChunked`
- `storageStatus.lastRemoteChunkCount`

Als de server chunked opslaat, wordt de opslagstatus:

`Cloudflare D1 - chunked gedeelde testdata`

### 4. Backwards compatibility
Alle eerdere raw-state optimalisaties blijven bestaan:
- V57/V60 raw response blijft ondersteund;
- V62/V72 save guards blijven actief;
- V78 boot/hydration blijft actief;
- V80/V81 printfixes blijven intact;
- bestaande clients kunnen nog steeds de JSON-wrapper gebruiken voor debug.

## Aangepaste bestanden
- `functions/api/state.js`
- `functions/api/_shared.js`
- `functions/api/health.js`
- `playwright/server.js`
- `js/core/store.js`
- `package.json`
- `scripts/v82-d1-state-size-save-preflight.mjs`
- `CWS_PLANNING_V82_D1_STATE_SIZE_AND_SAVE_FIX_OPLEVERING.md`

## Tests/checks
Uitgevoerd:

```powershell
npm run lint:syntax
npm run preflight:v57
npm run preflight:v60
npm run preflight:v78
npm run preflight:v82
npm run preflight:all
npm run build
node scripts/e2e-fallback.mjs
```

Resultaat:
- syntaxcontrole groen;
- `preflight:v82` groen;
- `preflight:all` groen;
- `build` groen;
- fallback e2e groen.

## Live controle na deploy
Controleer op `https://planning-cop.pages.dev/`:

1. Open de app.
2. Controleer dat D1 bereikbaar is.
3. Open Gantt.
4. Wijzig een taak of resize/verplaats een balk.
5. Wacht op opslaan.
6. De melding `SQLITE_TOOBIG` mag niet terugkomen.
7. Ververs de pagina.
8. Controleer dat de wijziging behouden is.
9. Controleer Network:
   - `/api/state` PUT geeft 200;
   - response bevat `v82.chunkedStateSave`;
   - bij grote state is `v82.chunked` true.

## Belangrijke waarschuwing
Als er al een corrupte lokale fallback-state actief is in de browser, eerst niet op `Demo data` of `Data leegmaken` klikken. D1 moet leidend blijven. Bij twijfel eerst `Boot & Data Diagnose` of `Live readiness rapport` openen.
