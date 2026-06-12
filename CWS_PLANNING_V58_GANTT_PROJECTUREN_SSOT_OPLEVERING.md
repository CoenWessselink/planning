# CWS Planning V58 — Gantt projecturen SSOT + handmatige override

## Doel
Projecturen per afdeling zijn standaard de bron voor Gantt en Capaciteit. Handmatige taakuren mogen alleen nog werken wanneer de gebruiker expliciet kiest voor handmatige override.

## Aangepast
- Gantt-taakurenbron toegevoegd: Auto / Handmatig.
- Auto gebruikt projecturen per afdeling als SSOT.
- Oude taakuren zonder expliciete handmatige override worden niet meer als override gebruikt.
- Handmatige override wordt opgeslagen als `hoursMode: "manual"`, `hoursSource: "manual"`, `manualHours` en `hours`.
- Automatische taken worden opgeslagen als `hoursMode: "auto"`, `hoursSource: "project-dept-hours"`, `hours: 0`.
- Gantt `hoursByDay` wordt opnieuw opgebouwd vanuit projecturen per afdeling.
- Capaciteit blijft rekenen vanuit Gantt `hoursByDay` en `sourcesByDay`.
- Bronregels bevatten nu metadata over urenbron, project-afdelingstotaal en handmatige override.
- Gantt popup toont duidelijk dat Projecturen SSOT zijn.
- Gantt tabel toont Auto/Handmatig in de urenkolom.
- Nieuwe preflight `preflight:v58` toegevoegd.
- Fallback E2E uitgebreid met V58-regressiecheck.

## Belangrijk gedrag
- Een taak op Auto gebruikt de uren uit Projecten voor dezelfde afdeling.
- Een taak op Handmatig gebruikt alleen de ingevulde taakuren.
- Capaciteit neemt de uiteindelijke Gantt-verdeling over.

## Checks
- `npm ci`
- `npm run lint:syntax`
- `npm run preflight:v28` t/m `npm run preflight:v58`
- `npm run test:e2e`
