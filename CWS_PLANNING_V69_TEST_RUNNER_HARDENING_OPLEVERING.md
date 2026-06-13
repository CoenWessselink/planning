# CWS Planning V69 — Test-runner hardening

## Doel
Deze build corrigeert drie punten die na V68 nog open stonden:

1. `playwright.config.js` draaide alleen `./tests/acceptance`.
2. `js/core/store.js` had een onvolledige `ganttV2.ui` default.
3. `playwright/server.js` retourneerde lokaal `ok:false` op `/api/health`.

## Aangepast

- Playwright gebruikt nu `testDir: './tests'` zodat alle tests worden meegenomen.
- Lokale Express health retourneert `ok:true` met `version: local-test-v69`.
- `ganttV2.ui` default bevat direct:
  - `showCritical:false`
  - `showDeps:true`
  - `viewMode:'both'`
  - `zoom:'week'`
- Ontbrekende UI-keys worden bij normalisatie aangevuld via `Object.assign`.
- Nieuwe preflight toegevoegd: `preflight:v69`.

## Checks
- `npm run lint:syntax`
- `npm run preflight:v28` t/m `npm run preflight:v69`
- `npm run test:e2e`

## Let op
Deze build is een gerichte hardening op test-runner, lokale health en Gantt UI-defaults. De V68 foundation blijft behouden.
