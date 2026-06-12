# CWS Planning V32 — Tablet & Mobile Responsive Foundation

## Doel
Deze build optimaliseert de bestaande V31-app in één complete build voor tablet en mobiel gebruik, zonder opnieuw te beginnen en zonder desktop/print te verstoren.

## Toegevoegd
- Centrale responsive runtime `js/core/responsive.js`.
- Mobiele snelnavigatie onderin met Dashboard, Projectoverzicht, Gantt, Capaciteit en Menu.
- Automatische viewport-detectie: desktop / tablet / mobiel.
- Iframe-modules worden na laden automatisch verrijkt met:
  - touchvriendelijke scroll;
  - mobiele toolbar;
  - compacte modus;
  - tabel-labels voor kaartweergave;
  - brede matrix/Gantt-scroll zonder desktoplayout te slopen.
- Tablet CSS voor shell, modals, tabellen en brede modules.
- Mobiele CSS voor header, popups, knoppen, tabs, apps-menu en data-tabellen.
- Gantt mobiele/tablet hardening:
  - toolbar horizontaal scrollbaar;
  - tabel en diagram blijven bruikbaar;
  - compacte modus kan tabel verbergen zodat diagram leidend wordt;
  - contextmenu/popup touchvriendelijker.
- Capaciteit mobiele/tablet hardening:
  - heatmap blijft bovenaan bruikbaar;
  - matrix horizontaal scrollbaar met compacte hoogte;
  - popup voor dagcapaciteit als bottom sheet op mobiel;
  - A0-print blijft afgeschermd van mobiele UI.
- Dashboard mobiele kaartweergave voor projectgezondheid.
- Nieuwe static preflight: `npm run preflight:v32`.

## Niet gewijzigd
- D1/state-architectuur.
- Gantt hoursByDay/sourcesByDay SSOT.
- Capaciteitsberekening.
- Revisies/snapshots.
- Print A0/A3 logica, behalve dat mobiele UI bij print verborgen blijft.

## Controles
- `npm run lint:syntax`
- `npm run preflight:v28`
- `npm run preflight:v29`
- `npm run preflight:v30`
- `npm run preflight:v31`
- `npm run preflight:v32`

Browser-/Playwright-test blijft afhankelijk van lokale Chromium-installatie.
