# CWS Planning V65 - Gantt continuous bar recovery

## Aanleiding
Na V59/V64 werden Gantt-taken in de schermweergave zichtbaar als smalle 1-dags blokjes. De PDF/printplanning had wel brede taakbalken. De oorzaak zat in de combinatie van:

- herstelde D1-state met oud/rijk schema;
- taakduur in `row.duration`, maar korte of ontbrekende `model.sched[row.id].end`;
- V64-werkdagsegmenten die alleen de gevonden werkdagsegmenten tekenden;
- renderlogica die planning tijdens render probeerde te corrigeren en daardoor save/render-loops kon veroorzaken.

## Oplossing
- Schermweergave gebruikt weer een continue, brede taakbalk zoals de PDF.
- Start/eind/duration worden render-only veilig afgeleid via `effectiveScheduleMap`.
- Als een legacy `sched.end` te kort is, wordt de zichtbare einddatum afgeleid uit `row.duration` zonder automatisch naar D1 te schrijven.
- Renderen schrijft nooit automatisch naar D1.
- Drag/resize start vanuit de effectief getoonde `data-start`/`data-end`, zodat slepen aansluit op wat zichtbaar is.
- Werkdagenlogica blijft behouden voor start/einde, herberekenen, save en capaciteit.
- V62/V63 D1 recovery/overwrite guard blijft behouden.

## Controle
- npm ci
- npm run lint:syntax
- npm run preflight:v28 t/m npm run preflight:v65
- npm run test:e2e
