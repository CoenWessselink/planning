# CWS Planning V29 - Projectoverzicht Gantt-voortgang

## Doel
Projectoverzicht is uitgebreid met een directe voortgangspopup per project. De popup gebruikt de Gantt-taken als SSOT voor gereedmelding, percentage gereed en terugkoppeling.

## Gebouwd
- Projectoverzicht toont projectstatus en voortgang automatisch op basis van Gantt-taken.
- Simpele klik op `Voortgang bijwerken` of de voortgangsbalk opent de voortgangspopup.
- Popup toont alle Gantt-taken van het project met:
  - taaknaam;
  - afdeling;
  - start/eindperiode;
  - uren;
  - percentage voortgang;
  - gereed-vinkje;
  - status;
  - snelle keuzes 0/25/50/75/100%;
  - terugkoppeling / WHY.
- Projectpercentage wordt automatisch gewogen berekend:
  - taakuren als eerste bron;
  - taakduur als fallback.
- Projectstatus wordt automatisch afgeleid:
  - Niet gestart;
  - In uitvoering;
  - Gereed;
  - Aandacht;
  - Vertraagd.
- Terugkoppeling wordt teruggeschreven naar de Gantt-taak.
- Projectoverzicht toont laatste terugkoppeling per project.
- Project 360 tab Status bevat voortgang en knop om de voortgangspopup te openen.
- Project 360 Historie toont recente taakvoortgangswijzigingen.
- Store normaliseert `progressByProject`, `feedbackByProject`, `updatedAtByProject` en `taskProgressHistory`.

## Gantt-terugkoppeling
- Gantt-tabel heeft extra kolommen `Status` en `Terugkoppeling`.
- Gantt-taakpopup bevat status en terugkoppeling / WHY.
- Gantt-balken tonen een lichte voortgangs-overlay op basis van percentage gereed.
- Gantt-balken met terugkoppeling tonen een kleine `i`-indicator.
- Tooltip/context toont voortgang, status en terugkoppeling.

## SSOT
- Gantt-taken zijn de bron voor taakvoortgang.
- Projectoverzicht is samenvatting/weergave en schrijft taakwijzigingen terug naar Gantt.
- D1/state-flow blijft via bestaande `CWS.mutate` en `ganttV2.byProject` werken.

## Controles
- `npm ci` uitgevoerd.
- `npm run lint:syntax` geslaagd.
- `npm run preflight:v28` geslaagd.
- `npm run preflight:v29` geslaagd.
- `npm run test:e2e -- --reporter=line` gestart, maar browsercases konden niet draaien omdat Playwright Chromium ontbreekt.
- `npx playwright install chromium` faalde door DNS/netwerkfout `EAI_AGAIN cdn.playwright.dev`.

## Bekende testbeperking
De echte browsercontrole moet nog lokaal of in CI worden uitgevoerd met geïnstalleerde Playwright browsers.
