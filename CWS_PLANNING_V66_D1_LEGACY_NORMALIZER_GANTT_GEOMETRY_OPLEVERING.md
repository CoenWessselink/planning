# CWS Planning V66 — D1 legacy normalizer + Gantt PDF-balkgeometrie

## Doel
V66 herstelt de structurele fout waarbij de herstelde D1-planning wel aanwezig was, maar de Gantt-weergave taken als smalle blokken/markers kon tonen en slepen/resize onbetrouwbaar werd.

## Aangepast
- D1 legacy state blijft leidend met `projects.order`, `projects.byId`, `ganttV2.byProject`, `tasks.byProject` en `gantt.hoursByDay`.
- Gantt gebruikt nu één centrale functie `continuousBarGeometry(...)` voor de zichtbare balkpositie en -breedte.
- Lange taken worden weer als brede continue PDF-achtige balken getekend.
- Werkdagenlogica blijft behouden voor planning, urenverdeling en capaciteit.
- Visuele balkbreedte wordt losgekoppeld van werkdagsegmenten.
- Drag/resize start nu vanuit de effectieve zichtbare planning, niet uit een te korte legacy `sched`.
- Dependencylijnen gebruiken de effectieve schedule-map, zodat pijlen aansluiten op de zichtbare balken.
- V62/V63 overwrite guard blijft behouden.
- Health-versie: `internal-test-v66`.

## Belangrijk gedrag
- Weekenden en niet-werkbare dagen blijven zichtbaar in de kalender/achtergrond.
- Uren en capaciteit mogen niet op niet-werkbare dagen vallen.
- De balk zelf blijft visueel één brede balk over de kalenderperiode, zoals in de PDF.

## Checks
Groen uitgevoerd:
- `npm ci`
- `npm run lint:syntax`
- `npm run preflight:v28` t/m `npm run preflight:v66`
- `npm run test:e2e`

## Niet bewezen
- Echte live D1/Cloudflare Access browservalidatie kon hier niet rechtstreeks worden uitgevoerd vanwege Cloudflare Access login.
- De build bevat wel een V66 legacy fixture/preflight die de herstelde D1-structuur simuleert.
