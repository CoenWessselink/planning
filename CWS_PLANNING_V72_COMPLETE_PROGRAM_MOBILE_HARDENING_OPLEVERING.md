# CWS Planning V72 - Complete Program Mobile Hardening

## 1. Doel

Deze oplevering hardent de bestaande CWS Planning-app zonder redesign en met behoud van de V11-menu- en UI-structuur. De focus ligt op opstarten, Gantt, capaciteit, projectoverzicht, mobiel/tablet, D1-opslag, herstel, import/export, preflight, print en deployment.

Branch: `feature/complete-program-hardening-mobile-v72`

## 2. Wat fout of kwetsbaar was

- `package.json` miste complete standaardcommando's voor build, test, lint, start en alle preflights.
- De lokale servers waren niet overal dependency-vrij en gebruikten oudere health-markers.
- State-normalisatie repareerde niet alle verwijzingen bij dubbele Gantt-taak-ID's.
- Client- en server-save guards dekten sterke krimp van projecten/Gantt-rijen onvoldoende uniform af.
- Gantt-resize kon terugvallen op een oude taakduur, waardoor een nieuwe einddatum verloren ging.
- Drag/resize miste een volledig immutable startrecord, centrale validatie en eenduidige rollback.
- Import/demo/clear/restore hadden niet overal preview, herstelpunt, typed confirmation en rechtencontrole.
- State Doctor berekende projecturen-versus-Gantt-afwijkingen niet uit de werkelijk verdeelde uren.
- Dynamisch gerenderde tabellen/modals kregen responsive verbeteringen niet altijd opnieuw toegepast.
- De browsertest dekking controleerde onvoldoende modules en viewports.

## 3. Wat aangepast is

- Complete npm-scriptset toegevoegd met echte syntax-, preflight- en browsertests.
- Lokale statische server en Playwright-testserver dependency-vrij en padveilig gemaakt.
- Health-versies bijgewerkt naar `internal-test-v72` en `local-test-v72`.
- Centrale state-normalisatie uitgebreid voor legacy schema's, Gantt-reparatie en diagnostiek.
- Duplicate taak-ID-repair remapt schedules, parents, predecessors, dependencies en revisions idempotent.
- Repair-, orphan-, datum-, afdeling-, weekenduren- en save-metadata worden vastgelegd.
- Client en D1 Worker blokkeren lege/demo/sterk gekrompen state met een concrete foutmelding.
- Last-good snapshots, recovery-lock, import-preview, validatie en auditacties zijn uitgebreid.
- Demo laden en data wissen zijn admin-only en vereisen altijd typed confirmation.
- Gantt drag/resize gebruikt één mutatie bij pointer-up, validatie, rollback en vrijgave van pointer capture.
- Schedule start/einde is leidend voor balkduur; lange taken blijven continue brede balken.
- Capaciteit toont WHY-bron `Auto/projecturen` of `Handmatig`.
- Mobiele tabellen, toolbars, modals en horizontale scroll zijn gehard.
- Printkleurbehoud is centraal geborgd.

## 4. Aangepaste bestanden

- `CWS_PLANNING_V72_COMPLETE_PROGRAM_MOBILE_HARDENING_OPLEVERING.md`
- `css/patches.css`
- `functions/api/_shared.js`
- `functions/api/health.js`
- `functions/api/state.js`
- `index.html`
- `js/core/permissions.js`
- `js/core/responsive.js`
- `js/core/store.js`
- `layers/laag11_io.html`
- `layers/laag4_gantt.html`
- `layers/laag5_capaciteit.html`
- `layers/laag6_projectoverzicht.html`
- `package.json`
- `playwright/server.js`
- `scripts/headless-v72-smoke.mjs`
- `scripts/run-all-preflights.mjs`
- `scripts/serve.mjs`
- `scripts/v72-complete-program-mobile-hardening-preflight.mjs`

## 5. Mobiel en tablet

Headless Chrome heeft de kernmodules gecontroleerd op 390, 768, 1024 en 1440 px. Projecten, Gantt, Capaciteit, Projectoverzicht, Instellingen en Import/Export renderen zonder kritieke consolefouten. Tabellen behouden horizontale scroll, toolbars kunnen wrappen/scrollen en modals blijven binnen de viewport.

## 6. Gantt, drag en resize

- Eén centrale continue balkgeometrie blijft actief.
- Start/einde en werkdagen worden robuust afgeleid en gevalideerd.
- Drag en rechter-resize zijn in een echte Chrome-runtime uitgevoerd via dezelfde store-mutatie als de UI.
- De mutaties leverden geldige schedules op, zonder NaN, omgekeerde datums of duplicate-ID-blokkade.
- Tijdens pointermove wordt niet opgeslagen; pointer-up doet één gevalideerde mutatie.
- Bij validatiefout wordt de oorspronkelijke planning teruggezet.

Fysieke muis-/touch-hit-testing en lang slepen in een live deployed browser blijven een handmatige acceptatiecontrole.

## 7. Capaciteit en WHY

Capaciteit blijft rekenen vanuit `gantt.hoursByDay` en `gantt.sourcesByDay`, waarbij niet-werkbare dagen worden uitgesloten. WHY-details vermelden project, taak, afdeling, periode, uren en bron. De headless fixture toont capaciteit en een zichtbare horizontale scrollbar.

## 8. Backup, restore en import

- JSON- en SQL-state kunnen eerst worden geanalyseerd.
- Preview toont huidige en inkomende aantallen en verschillen.
- Import vereist een passende preview, typed confirmation en planner/adminrecht.
- Voor import, restore, demo en clear wordt een herstelpunt gemaakt.
- Restore/demo/clear vereisen adminrecht.
- Belangrijke acties en blokkades worden in het auditlog opgenomen.

## 9. Save guard en D1

Zowel client als `functions/api/state.js` blokkeren lege, demo-achtige of sterk gekrompen state. Project- en Gantt-rijaantallen worden vergeleken met de laatst bekende goede/remote state. UI-only wijzigingen veroorzaken geen onnodige D1 PUT. De bestaande D1-binding `DB` in `wrangler.toml` is ongewijzigd.

## 10. Uitgevoerde tests

Succesvol uitgevoerd op 13 juni 2026:

- `npm ci` - 0 vulnerabilities
- `npm run lint:syntax`
- `npm run preflight:v28` tot en met `npm run preflight:v72`
- `npm run preflight:all` - 45 preflights geslaagd
- `npm run build`
- `npm run lint`
- `npm test`
- `npm run test:e2e`
- Headless Chrome: 16 hoofdmodules, responsive viewports, 76 projecten, brede Gantt-balk, drag, resize, capaciteit, scrollbar en State Doctor

## 11. Openstaande punten

- De V11-referentie-ZIP was niet in de workspace aanwezig en kon niet pixelmatig worden vergeleken.
- Live Cloudflare Access, productie-D1-rechten, latency en gelijktijdige gebruikers zijn lokaal niet volledig te bewijzen.
- De repository gebruikt geen Playwright npm-dependency; de bestaande fallback-runner is behouden en uitgebreid met een dependency-vrije Chrome DevTools-test.
- Historisch gerepareerde predecessorrelaties moeten inhoudelijk door een planner worden beoordeeld.
- Bestaande rollen/rechten zijn gehard; er is bewust geen nieuw authenticatiesysteem toegevoegd.
- Printerdrivers, PDF-schaal en fysieke touch-interactie vereisen live handmatige controle.

## 12. Live controlepunten

1. Open de Cloudflare Pages-preview en controleer `/api/health` op `ok: true` en `internal-test-v72`.
2. Controleer in een kopie van productie-D1 dat 76 projecten en Gantt-rijen blijven staan na een normale wijziging.
3. Sleep en resize een niet-vergrendelde taak met muis en touch en controleer één auditregel en één save.
4. Test een bewust sterk gekrompen import en bevestig dat de save guard deze blokkeert.
5. Controleer A0/A3 print-preview van Gantt, Capaciteit en Projectoverzicht inclusief kleuren en onderkalender.
6. Controleer planner/viewer/admin met echte Cloudflare Access-gebruikers.

## 13. Deploy-instructies

1. Merge de V72-PR naar `main`.
2. Laat Cloudflare Pages de repository-root publiceren; `pages_build_output_dir = "."` blijft geldig.
3. Behoud D1-binding `DB` en controleer migraties/schema vooraf op een previewomgeving.
4. Draai voor merge/deploy `npm ci && npm run build && npm test`.
5. Controleer na deploy health, State Doctor en Live readiness report voordat gebruikers gaan plannen.

Er zijn geen absolute lokale paden, `node_modules`, testresultaten of gegenereerde browserbestanden toegevoegd.

## 14. Rollback-instructies

1. Maak voor deployment een D1-export en download een state-backup.
2. Bij applicatieregressie: revert de V72-mergecommit en laat Cloudflare Pages opnieuw deployen.
3. Bij dataproblemen: activeer recovery-lock, analyseer eerst de backup en herstel daarna de laatste goede snapshot.
4. Wis of laad geen demo-data als herstelmaatregel; deze acties zijn destructief en admin-only.
