# CWS Planning V37 — Mobiel 100% optimalisatie

Gebouwd op V36. Deze build voegt een brede mobiele hardening-laag toe voor telefoon/tablet zonder desktop en print te breken.

Belangrijkste verbeteringen:
- Mobiele viewport-height stabilisatie met `--cws-vh`.
- Mobiele action dock onderin de iframe-modules met contextuele snelacties.
- Projecten: snelle actie Nieuw/Zoek/Filters.
- Gantt: snelle acties Taak/Diagram/Beide, betere touch-scroll, tabel + diagram blijven bruikbaar.
- Capaciteit: snelle acties Vandaag/6 weken/A0, heatmap/matrix met stabiele horizontale touch-scroll.
- Instellingen: snelle acties Bedrijf/Logo/Nieuw.
- Modals worden op mobiel bottom-sheets met veilige hoogte en scroll.
- Tabellen worden als kaarten weergegeven wanneer dat past, met datalabels.
- Extra preflight: `npm run preflight:v37`.

Uitgevoerde checks: `npm ci`, `lint:syntax`, preflight V28 t/m V37 en fallback E2E.
