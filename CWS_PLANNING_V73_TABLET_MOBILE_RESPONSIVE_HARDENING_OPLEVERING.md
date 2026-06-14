# CWS Planning V73 Tablet/Mobile Responsive Hardening

## 1. Doel

V73 maakt de bestaande CWS Planning-interface bruikbaar op mobiel en tablet, zonder de desktop enterprise-layout of de bestaande V72-functionaliteit voor Gantt, D1, save guard, herstel en taak-id-reparatie te vervangen.

## 2. Wat is aangepast

- Een centrale responsive stylesheet met expliciete regels voor 360-430, 431-767, 768-899, 900-1199 en 1200+ pixels.
- Een lichte mobile adapter die viewport- en touchclasses toepast en wijzigingen via `requestAnimationFrame` verwerkt.
- Responsive CSS en adapter worden door de hoofdshell en alle geladen module-iframes gebruikt.
- Toolbars, tabellen, matrices, tabs, formulieren, dialogen en rapportpanelen hebben bruikbare scroll- en wrappingregels.
- Mobiele dialogen zijn schermvullend of bijna schermvullend; tablet-dialogen blijven binnen 90vw/90vh.
- Dialogen hebben verbeterde ARIA-attributen, focusbeheer, Escape-afhandeling en focusherstel.
- Gantt gebruikt op mobiel horizontale scroll en een taakpopup als betrouwbare fallback voor datumwijzigingen. Desktop drag en resize blijven actief.
- De V73 health- en lokale testservermarkeringen zijn toegevoegd.
- De bestaande Chrome headless-smoke is gestabiliseerd en de E2E-keten is uitgebreid met responsive tests.

## 3. Aangepaste bestanden

- `CWS_PLANNING_V73_TABLET_MOBILE_RESPONSIVE_HARDENING_OPLEVERING.md`
- `css/responsive-v73.css`
- `functions/api/health.js`
- `index.html`
- `js/core/mobile_adapter.js`
- `js/core/responsive.js`
- `js/core/ui.js`
- `layers/laag4_gantt.html`
- `layers/laag11_io.html`
- `package.json`
- `playwright/server.js`
- `scripts/headless-v72-smoke.mjs`
- `scripts/serve.mjs`
- `scripts/v73-tablet-mobile-responsive-hardening-preflight.mjs`
- `tests/responsive/v73-responsive-smoke.mjs`

## 4. Desktop behouden

Vanaf 1200 pixels blijft de bestaande desktopstructuur leidend. Er is geen globale schaaltransformatie, geen verwijdering van desktopkolommen en geen vervanging van bestaande menu- of modulelogica. De bestaande Gantt-indeling, drag/resize, tabellen, printregels en D1-stateflow blijven intact.

## 5. Tabletverbeteringen

- Compactere toolbars en horizontaal scrollbare tabs.
- Tabellen en matrices blijven in desktopvorm beschikbaar binnen eigen scrollcontainers.
- Popups blijven binnen 90% van de viewport en kunnen intern scrollen.
- Gantt-kalender, tabel en diagram blijven uitgelijnd en horizontaal bereikbaar.
- Touchdoelen en Gantt-resizehandles zijn groter op touchapparaten.

## 6. Mobielverbeteringen

- Mobiele viewportclasses en touchdetectie zonder state- of D1-writes.
- Menu, toolbars en filterbalken blijven bereikbaar.
- Formulieren schakelen naar één kolom.
- Modals en rapportpanelen blijven volledig zichtbaar en scrollbaar.
- Tabellen en planningsmatrices worden niet verkleind tot onleesbare miniaturen, maar scrollen binnen hun module.
- Gantt toont een korte mobiele hint en opent een taak bij aanraken voor betrouwbare datumwijziging.
- De shell voorkomt onbedoelde horizontale body-overflow; functionele tabellen behouden hun eigen horizontale scroll.

## 7. Modules

### Projecten

De bestaande tabel, infinite scroll, filters en afdelingsuren blijven behouden. De toolbar en tabel zijn op kleine schermen scrollbaar. De projectpopup past binnen de mobiele viewport en houdt de opslagactie bereikbaar.

### Gantt

De bestaande continue balkgeometrie, projectselector, tabel-diagramuitlijning en desktop drag/resize blijven behouden. Op mobiel blijft de Gantt horizontaal scrollbaar en opent een taak via aanraken. Verplaatsen via touch gebruikt bewust de taakpopup als fallback; desktop pointerdrag en resize blijven ongewijzigd.

### Capaciteit

De matrix houdt haar functionele breedte en staat in een horizontale scrollcontainer. Filters, legenda en detailacties blijven op tablet en mobiel bereikbaar.

### Projectoverzicht

Statuskleuren, tabelstructuur, Project 360 en printacties blijven behouden. De tabel, tabs en popup zijn responsive en scrollbaar.

### Instellingen

Tabs, beheertabellen, werkweekvelden en kalenders zijn op tablet en mobiel bereikbaar. Formulieren schakelen op mobiel naar één kolom en popups blijven binnen beeld.

### Planbord

Dag- en weekplanning behouden hun bestaande logica. De planning en toolbar kunnen op kleinere schermen horizontaal en verticaal scrollen. Bestaande desktopinteracties zijn niet verwijderd.

### Import/Export en herstel

Importpreview, State Doctor, Live Readiness, backup en restore behouden hun bestaande veiligheid. Actieknoppen, rapporten en bevestigingsdialogen zijn mobiel scrollbaar en bereikbaar.

## 8. Uitgevoerde tests

Succesvol uitgevoerd:

- `npm ci` - geen kwetsbaarheden gemeld.
- `npm run lint:syntax`
- `npm run preflight:v28` tot en met `npm run preflight:v73`
- `npm run preflight:all` - 46 preflightversies groen.
- `npm run build`
- `npm test`
- `npm run lint`
- `npm run test:e2e`
- Bestaande V72 Chrome-smoke, inclusief 76 projecten, Gantt-balken, drag, resize, capaciteit en State Doctor.
- Nieuwe V73 responsive Chrome-smoke, inclusief moduleboot, viewportclasses, overflow, projectpopup, Gantt, capaciteit en consolefouten.

Er zijn geen kritieke consolefouten of white screens gevonden in de geteste hoofdmodules.

## 9. Geteste viewports

- 390 px mobiel
- 768 px tablet portrait
- 1024 px tablet landscape/klein desktop
- 1440 px desktop

Op 390 en 768 pixels zijn alle 15 routermodules headless geopend. Op 1024 en 1440 pixels zijn de belangrijkste modules en desktop-Ganttcontroles uitgevoerd.

## 10. Openstaande punten

- Fysieke iOS-/Android-touchhardware en Safari zijn niet beschikbaar in de lokale testomgeving.
- De in-app browser kon door een Windows-sandboxbeperking niet starten; dezelfde routes zijn met lokaal geïnstalleerde headless Chrome gecontroleerd.
- Een productieomgeving achter Cloudflare Access en de live D1-database zijn niet gewijzigd of live belast.
- Printerdrivers, echte A0/A3-printers en de browser-PDF-dialoog vereisen een laatste live visuele controle.
- De repository bevat geen Playwright-package; de bestaande fallback-runner en dependencyvrije Chrome-CDP-tests blijven daarom de gebruikte E2E-route.

## 11. Live controlepunten

Controleer na deployment op een echte telefoon en tablet:

- menu openen en navigeren;
- projectpopup invullen en opslaan;
- Gantt horizontaal scrollen en taakpopup gebruiken;
- Gantt drag/resize op desktop;
- capaciteitdetails openen;
- Project 360 en instellingenpopups;
- importpreview zonder import toe te passen;
- A0/A3-printpreview met kleurbehoud.

## 12. Deploy-instructie

Deploy de branch via de bestaande Cloudflare Pages-pipeline. De bestaande `functions/`, D1-binding en statische bestandsstructuur zijn behouden. Er zijn geen absolute lokale paden, `node_modules` of browserresultaten aan de repository toegevoegd.

Controleer na deployment:

- `/api/health` retourneert `ok: true` en `internal-test-v73`;
- de shell laadt `css/responsive-v73.css` en `js/core/mobile_adapter.js`;
- de productie-D1-state blijft ongewijzigd bij alleen viewportwisselingen.

## 13. Rollback

Rollback kan door de V73-commit terug te draaien of de vorige werkende deployment opnieuw te publiceren. Omdat V73 geen state-schema of D1-migratie toevoegt, is geen database-rollback nodig. Maak voor een productie-rollback wel eerst de gebruikelijke backup van de actuele D1-state.
