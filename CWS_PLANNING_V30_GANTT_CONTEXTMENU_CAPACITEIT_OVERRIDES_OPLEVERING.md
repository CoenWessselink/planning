# CWS Planning V30 — Gantt rechtermuisknop + capaciteit per afdeling

## Toegevoegd

### Gantt
- Rechtermuisknop-contextmenu op taakregels in de linkertabel.
- Rechtermuisknop-contextmenu op taakbalken en tekst in het diagram.
- Rechtermuisknop-contextmenu op lege Gantt-ruimte.
- Acties voor taken/fasen:
  - openen;
  - taak toevoegen onder huidige regel;
  - subtaak toevoegen;
  - fase toevoegen;
  - mijlpaal toevoegen;
  - dupliceren;
  - verwijderen;
  - gereed melden;
  - voortgang instellen;
  - kleur wijzigen;
  - afdeling wijzigen;
  - resource wijzigen;
  - voorganger instellen;
  - vergrendelen/ontgrendelen;
  - notitie / WHY / terugkoppeling toevoegen;
  - fasekleur toepassen op onderliggende taken;
  - standaard fasen/taken genereren;
  - vandaag tonen;
  - planning herberekenen;
  - print A3.

### Capaciteit
- Per afdeling worden nu drie duidelijke regels getoond:
  - Beschikbare capaciteit;
  - Benodigde capaciteit;
  - Resterende capaciteit.
- Benodigde capaciteit blijft uitsluitend afkomstig uit Gantt:
  - `state.gantt.hoursByDay`;
  - `state.gantt.sourcesByDay`.
- Beschikbare capaciteit kan handmatig per afdeling per dag worden aangepast.
- Dubbelklik op de afdelingsrij “Beschikbare capaciteit” opent een popup met:
  - datum;
  - dag;
  - standaard beschikbare uren;
  - handmatig beschikbare uren;
  - benodigde Gantt-uren;
  - resterende uren;
  - opmerking/reden;
  - bron standaard/handmatig.
- Na opslaan wordt de hele capaciteitstabel opnieuw doorgerekend.
- Handmatige wijzigingen worden opgeslagen in `state.capacity.availabilityOverrides` en blijven via D1-state behouden.
- Handmatig aangepaste weken krijgen een markering in de matrix.
- A0-print gebruikt dezelfde gewijzigde beschikbare capaciteit.

## Controles
- `npm ci` geslaagd.
- `npm run lint:syntax` geslaagd.
- `npm run preflight:v28` geslaagd.
- `npm run preflight:v29` geslaagd.
- `npm run preflight:v30` geslaagd.

## Browser-test
- `npm run test:e2e -- --reporter=line` kon niet volledig draaien, omdat Chromium/Playwright-browserbinary ontbreekt.
- `npx playwright install chromium` faalde door DNS/netwerkfout: `EAI_AGAIN cdn.playwright.dev`.
