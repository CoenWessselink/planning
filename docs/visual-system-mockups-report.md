# Visual System Mockups Report

Datum: 2026-06-18  
Branch: `feature/cws-planning-visual-system-mockups`

## Scope

Deze build vertaalt de aangeleverde visuele referenties naar echte CWS Planning componenten. De afbeeldingen blijven alleen referentiebeelden in `docs/ui-references`; ze worden niet als statische UI in de applicatie geimporteerd.

Verwerkt:

- Desktop Apps menu met 10 hoofdmodules: Dashboard, Projecten, Gantt, Capaciteit, Projectoverzicht, Planbord, Rapporten, Import / Export, Instellingen en Auditlog.
- Compacte beheer/extra modules in het Apps menu: Self-test / Preflight, Projectplanning en Transportplanning.
- Donkerblauwe enterprise topbar, centrale CWS-branding, icon actions en premium SaaS-cardtaal.
- Mobiele bottom navigation met Dashboard, Projecten, primaire Gantt-knop, Capaciteit en Meer.
- Mobiele Meer-sheet met bestaande extra modules.
- Mobiel dashboard met echte project-, taak- en capaciteit-KPI's.
- Responsive Gantt behoudt bestaande planning, drag/resize, print en D1-state.
- Responsive Capaciteit behoudt Gantt-uren als SSOT, heatmap, matrix en A0-print.
- Lokale snapshot-opslag is quota-safe gemaakt zodat `QuotaExceededError` geen console-spam of werkschermfout meer veroorzaakt.
- Mobiele brede modules gebruiken hun eigen werkbalk/scrollgedrag; de oude iframe-actiedock overlapt Gantt, Projectoverzicht en Capaciteit niet meer.
- Mobiele Meer-sheet blijft binnen de viewport en schakelt op smalle schermen naar een veilige layout.
- `css/visual-system-v92.css` is toegevoegd als centrale polishlaag voor mockup-gelijkwaardige componenttaal.
- `js/core/mobile_adapter.js` injecteert de centrale polishlaag ook in iframe-modules, zodat Gantt/Capaciteit/Dashboard dezelfde componenttaal krijgen zonder screenshots te gebruiken.

## Belangrijke Bestanden

- `index.html` - shell, premium Apps menu, globale header, V92 stylesheet en data-action bridge.
- `css/theme.css` - bestaande visuele tokens, Apps menu, header, mobiele navigatie en responsive oppervlakken.
- `css/responsive-v73.css` - bestaande tablet/mobile responsive hardening.
- `css/visual-system-v92.css` - centrale mockup-polish voor topbar, cards, Apps menu, bottom navigation, Meer-sheet en module-oppervlakken.
- `js/core/apps_menu.js` - 10 hoofdmodules plus compacte beheer-extra's.
- `js/core/responsive.js` - mobiele bottom navigation en Meer-sheet.
- `js/core/mobile_adapter.js` - injectie van responsive en V92 stylesheet in de actieve iframe-module.
- `js/core/store.js` - quota-veilige lokale herstelcache naast D1 als leidende bron.
- `layers/laag9_dashboard.html` - mobiel dashboard/cockpit.
- `layers/laag4_gantt.html` - responsive Gantt en print/drag/resize behoud.
- `layers/laag5_capaciteit.html` - responsive Capaciteit op basis van Gantt-uren.
- `tests/e2e/premium-responsive-ui.mjs` - browsercontrole voor desktop/tablet/mobiel.
- `scripts/v91-visual-system-mockups-preflight.mjs` - statische borging van het mockup-contract.
- `scripts/v92-visual-system-polish-preflight.mjs` - extra borging dat de centrale polishlaag geladen, geinjecteerd en niet als screenshot-UI gebruikt wordt.

## Tests

Aanbevolen checks voor deze branch:

- `npm run lint`
- `npm run preflight:v90`
- `npm run preflight:v91`
- `npm run preflight:v92`
- `npm run test:e2e`
- `npm run build`

De E2E-check bevat expliciet 1920 desktop en mobiele breedtes 375, 414 en 430, naast bestaande tablet/desktop varianten.

## Risico En Afbakening

- De visuele referenties zijn richtinggevend; de app gebruikt geen pixel-perfect screenshotlaag.
- Data-acties blijven bewust achter beheer/instellingen en vragen expliciete bevestiging.
- Gantt en Capaciteit blijven echte productiemodules. Er is geen mockdata of placeholderroute toegevoegd.
- De V92-laag is een centrale polish/consistentielaag bovenop bestaande componenten; diepere functionele wijzigingen in Gantt-savequeue, D1-mutaties of capacity-calculatie zijn bewust niet aangepast.
- Zonder lokale Chrome kan de browser-E2E alleen worden overgeslagen door de bestaande test runner; statische preflights blijven dan de minimale borging.
