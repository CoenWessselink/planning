# CWS Planning Cloudflare D1 v10 — Gantt/Capaciteit herstel

## Verwerkt

- `/api/health` geeft niet langer 500 bij een lege of verkeerd aangemaakte D1 database. De API herstelt het D1 schema automatisch.
- `functions/api/_shared.js` bevat nu automatische D1 schema-reconciliatie voor `app_state`, `audit_log` en `app_users`.
- Laag 4 Gantt is volledig vervangen door een stabiele Gantt-module met:
  - linker tabel + rechter tijdlijn;
  - maand/week/dag-header;
  - 48px rijen en 45px balken;
  - summary-balken als zwarte MS-Project-achtige lijn;
  - filters voor project, afdeling en resource;
  - drag/resize van taakbalken;
  - baseline, afhankelijkheden, kritisch pad, undo/redo, print A3 en CSV-export;
  - directe koppeling naar `CWS.gantt.saveProjectGantt()`;
  - automatische herbouw van `state.gantt.hoursByDay` en `state.gantt.sourcesByDay`.
- Laag 5 Capaciteit is volledig vervangen door een nieuwe matrix die uitsluitend rekent vanuit:
  - beschikbare uren uit Instellingen/Werknemers of resources;
  - geplande uren uit de Gantt-bron `state.gantt.sourcesByDay`;
  - WHY-details per cel.
- Capaciteit toont nu: beschikbaar, gepland, saldo, projectregels, afdelingsregels en totalen.
- Syntaxcontrole is groen.

## Belangrijk

Als de app nog steeds lokale browserdata toont, controleer dan in Cloudflare Pages:

- Settings → Bindings → D1 binding `DB` moet gekoppeld zijn aan `cws-planning-intern`.
- Zero Trust Access moet actief zijn op `planning-cop.pages.dev`.
- Na nieuwe upload/push altijd opnieuw deployen.

## Controle

Uitgevoerd:

```bash
npm run lint:syntax
```

Resultaat: geslaagd.

Playwright is niet uitgevoerd in deze sandbox omdat `node_modules` hier niet geïnstalleerd is.
