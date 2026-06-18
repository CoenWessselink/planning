# Visual System Mockups Report

Datum: 2026-06-18  
Branch: `feature/cws-planning-visual-system-mockups`

## Scope

Deze build vertaalt de aangeleverde visuele referenties naar echte CWS Planning componenten. De afbeeldingen blijven alleen referentiebeelden in `docs/ui-references`; ze worden niet als statische UI in de applicatie geimporteerd.

Verwerkt:

- Desktop Apps menu met 10 hoofdmodules: Dashboard, Projecten, Gantt, Capaciteit, Projectoverzicht, Planbord, Rapporten, Import / Export, Instellingen en Auditlog.
- Compacte beheer/extra modules in het Apps menu: Self-test / Preflight, Projectplanning en Transportplanning.
- Mobiele bottom navigation met Dashboard, Projecten, primaire Gantt-knop, Capaciteit en Meer.
- Mobiele Meer-sheet met bestaande extra modules.
- Mobiel dashboard met echte project-, taak- en capaciteit-KPI's.
- Responsive Gantt behoudt bestaande planning, drag/resize, print en D1-state.
- Responsive Capaciteit behoudt Gantt-uren als SSOT, heatmap, matrix en A0-print.

## Belangrijke Bestanden

- `index.html` - shell, premium Apps menu, globale header en data-action bridge.
- `css/theme.css` - visuele tokens, Apps menu, header, mobiele navigatie en responsive oppervlakken.
- `js/core/apps_menu.js` - 10 hoofdmodules plus compacte beheer-extra's.
- `js/core/responsive.js` - mobiele bottom navigation en Meer-sheet.
- `layers/laag9_dashboard.html` - mobiel dashboard/cockpit.
- `layers/laag4_gantt.html` - responsive Gantt en print/drag/resize behoud.
- `layers/laag5_capaciteit.html` - responsive Capaciteit op basis van Gantt-uren.
- `tests/e2e/premium-responsive-ui.mjs` - browsercontrole voor desktop/tablet/mobiel.
- `scripts/v91-visual-system-mockups-preflight.mjs` - statische borging van dit contract.

## Tests

Aanbevolen checks voor deze branch:

- `npm run lint`
- `npm run preflight:v90`
- `npm run preflight:v91`
- `npm run test:e2e`

De E2E-check bevat expliciet 1920 desktop en mobiele breedtes 375, 414 en 430, naast bestaande tablet/desktop varianten.

## Risico En Afbakening

- De visuele referenties zijn richtinggevend; de app gebruikt geen pixel-perfect screenshotlaag.
- Data-acties blijven bewust achter beheer/instellingen en vragen expliciete bevestiging.
- Gantt en Capaciteit blijven echte productiemodules. Er is geen mockdata of placeholderroute toegevoegd.
- Zonder lokale Chrome kan de browser-E2E alleen worden overgeslagen door de bestaande test runner; statische preflights blijven dan de minimale borging.
