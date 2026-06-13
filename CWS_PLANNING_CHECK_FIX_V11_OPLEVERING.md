# CWS Planning - Check/Fix V11 oplevering

Datum: 13 juni 2026
Branch: `feature/check-fix-v11`

## 1. Wat fout was

- De opdracht verwees naar `server/index.js`, maar dat bestand en de mappen `src/` en `public/` bestaan niet in de actuele repository. De lokale server is `scripts/serve.mjs`; de Playwright-testserver is `playwright/server.js`.
- De opgegeven ZIP `CWS_Planning_UI_MenuStructuur_v13_projectoverzicht_built_v11.zip` was niet aanwezig in of naast de workspace. De actuele repository en de aanwezige V11/V70-opleverdocumenten zijn daarom als referentie gebruikt.
- `preflight:v51` was afhankelijk van LF-regelovergangen en faalde daardoor op de Windows/CRLF-checkout.
- `preflight:v59` controleerde een verouderde commenttekst in plaats van de aanwezige render-only schedulelogica.
- Dubbele Gantt-taak-id's werden door statevalidatie alleen afgekeurd. Er was geen centrale, idempotente repair, waardoor de melding `dubbele taak-id` een save kon blokkeren.

## 2. Wat is aangepast

- Centrale duplicate taak-id repair toegevoegd aan `normalizeState()`:
  - de eerste rij behoudt de originele id;
  - duplicaten krijgen deterministische ids zoals `T1__dup2`;
  - de planning in `sched` wordt voor de gerepareerde id gekopieerd;
  - `parent`, `predecessor` en `predecessors` worden opnieuw gekoppeld;
  - opnieuw normaliseren verandert de ids niet.
- Nieuwe V71-regressietest toegevoegd met een duplicate-fixture.
- V51-preflight controleert nu de functionele aanroepvolgorde, onafhankelijk van CRLF/LF.
- V59-preflight controleert nu de werkelijke schedulefuncties en dat renderen niet automatisch opslaat.
- Bestaande menu-, pagina- en UI-structuur is niet gewijzigd.

## 3. Uitgevoerde tests

- `npm.cmd ci` - geslaagd, 0 kwetsbaarheden.
- `npm.cmd run lint:syntax` - geslaagd.
- `npm.cmd run preflight:v28` t/m `npm.cmd run preflight:v71` - allemaal geslaagd.
- `npm.cmd run test:e2e` - geslaagd.
- Lokale start via `node scripts/serve.mjs` - server start en levert de applicatie/assets.
- Headless Chrome-render met restored-D1 fixture:
  - shell/index;
  - Projecten;
  - Gantt;
  - Capaciteit;
  - Projectoverzicht;
  - Projectplanning;
  - Planbord;
  - Transportplanning;
  - Rapporten;
  - Dashboard;
  - Instellingen;
  - Niet-werkbare dagen;
  - Werknemers/werkweek;
  - Import/Export;
  - Audit;
  - Self-test/Preflight.
- Alle bovenstaande routes leverden een gevulde DOM, exitcode 0 en geen gedetecteerde kritieke console-, boot-, 404- of white-screenfouten.

## 4. Openstaande punten

- `npm run build`, `npm test` en `npm run lint` bestaan niet in `package.json`; ze zijn niet verzonnen of toegevoegd.
- De repository bevat geen Playwright dependency. `test:e2e` gebruikt daarom bewust de bestaande fallback-runner. Aanvullend is echte headless Chrome-rendering uitgevoerd.
- De ingebouwde Codex-browser kon door een Windows-sandboxfout niet verbinden. Dit is omzeild met lokale headless Chrome, zonder productcode aan te passen.
- De V11-ZIP kon niet visueel naast de build worden gelegd omdat het bestand niet beschikbaar was.

## 5. Aangepaste bestanden

- `js/core/store.js`
- `package.json`
- `scripts/v51-print-calendar-top-bottom-preflight.mjs`
- `scripts/v59-gantt-working-days-only-preflight.mjs`
- `scripts/v71-duplicate-task-id-repair-preflight.mjs`
- `CWS_PLANNING_CHECK_FIX_V11_OPLEVERING.md`

## 6. Build en deployment

- Cloudflare Pages-configuratie blijft ongewijzigd: output uit repository-root en D1-binding behouden.
- `functions/` en alle statische assets blijven aanwezig.
- Geen absolute lokale paden toegevoegd.
- Geen `node_modules` of gegenereerde browser/build-artifacts toegevoegd.
- Lokale Node-server en Cloudflare Pages-functions blijven gescheiden.

## 7. Risico's

- Bij historische duplicate ids is niet objectief vast te stellen welke duplicate een oude verwijzing bedoelde. De repair gebruikt daarom een deterministische volgorderegel: verwijzingen koppelen aan de meest recent voorafgaande occurrence, met de eerste occurrence als fallback.
- De repair bewaart data en maakt de state valide; inhoudelijke controle van uitzonderlijke historische predecessorrelaties blijft raadzaam bij een dataset waarin duplicates daadwerkelijk zijn aangetroffen.
