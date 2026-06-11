# CWS Planning v9 — oplevering Cloudflare D1 interne test

## Aangepast

- `wrangler.toml` gevuld met echte D1 database `cws-planning-intern` en database-id `731abdc6-5a69-44e8-a35e-12b543367a98`.
- `migrations/0001_init.sql` volledig gemaakt met correct schema en seed-state.
- `migrations/0002_reconcile_schema.sql` toegevoegd voor test-reset wanneer eerder een fout schema is aangemaakt.
- Pages Functions aangescherpt:
  - `/api/health` controleert D1 en schema.
  - `/api/state` vereist Cloudflare Access-identiteit in productie.
  - `/api/state` ondersteunt optimistic concurrency via `version`/`baseVersion` en geeft `409 Conflict` bij gelijktijdige wijzigingen.
  - `/api/audit` vereist Access-identiteit en rechten.
  - `/api/users` toegevoegd voor admin-rolbeheer via API.
- `js/core/store.js` aangepast:
  - bewaart remote D1-version.
  - stuurt `baseVersion` mee bij opslaan.
  - toont D1-conflict/unsynced-status.
  - localStorage blijft alleen fallback/cache.
- `index.html` toont opslagstatus met remote version en waarschuwing bij unsynced/fallback.
- `laag11_io.html` opgeschoond:
  - oude XLSX CLI-workaround verwijderd.
  - CSV-import blijft actief.
  - template-knoppen hersteld.
- `laag8_planbord.html` gebruikt geen lokale undo-stack meer; undo/redo loopt via globale `CWS.undo()`/`CWS.redo()`.
- `laag13_preflight.html` uitgebreid met API/D1/schema/storage/user/state checks.
- Cloudflare handleiding bijgewerkt.

## Controle

Uitgevoerd in deze omgeving:

```bash
npm run lint:syntax
```

Resultaat:

```text
Syntaxcontrole geslaagd.
```

Niet volledig bewezen in deze sandbox:

```bash
npm run test:e2e
```

Reden: `node_modules`/Playwright is niet geïnstalleerd in de sandbox. Na upload naar GitHub moet lokaal of in CI eerst `npm install` draaien en daarna `npm run test:e2e`.

## Direct na deploy controleren

1. Cloudflare Pages binding `DB` staat op Production én Preview.
2. D1 Console bevat correct schema uit `migrations/0001_init.sql` of reset via `0002_reconcile_schema.sql`.
3. Open `https://planning-cop.pages.dev/api/health` na Access-login.
4. Verwacht `ok:true` en `schemaOk:true`.
5. Open app; header moet `Cloudflare D1 - gedeelde interne testdata` tonen.
6. Maak demo/projectwijziging en refresh; data moet blijven staan.
