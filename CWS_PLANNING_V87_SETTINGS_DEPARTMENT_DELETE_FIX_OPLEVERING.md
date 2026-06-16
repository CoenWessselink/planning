# CWS Planning V87 Settings Department Delete Fix

## 1. Probleemomschrijving
In Instellingen werkte Afdeling verwijderen niet betrouwbaar. Een afdeling kon via de UI verdwijnen, maar door normalisatie en afgeleide department-bronnen weer terugkomen of zonder duidelijke melding worden tegengehouden. Ook ontbrak een veilige controle op gebruik in projecten, Gantt, capaciteit, werknemers/resources en templates.

## 2. Root cause
Afdelingen worden centraal gereconcilieerd uit meerdere bronnen: `settings.tables.departments`, legacy `departments`, resources, projecturen, Gantt/capaciteit en templates. De generieke tabelmanager verwijderde alleen de rij uit de zichtbare tabel. Daardoor kon `syncDepartments()` dezelfde afdeling opnieuw opbouwen uit de legacy registry of afgeleide bronnen. Daarnaast had de delete-knop geen afdeling-specifieke gebruikscontrole.

## 3. Aangepaste bestanden
- `index.html`
- `functions/api/health.js`
- `js/core/store.js`
- `js/core/ui.js`
- `layers/laag10_instellingen.html`
- `package.json`
- `playwright/server.js`
- `scripts/e2e-fallback.mjs`
- `scripts/v87-settings-department-delete-preflight.mjs`
- `CWS_PLANNING_V87_SETTINGS_DEPARTMENT_DELETE_FIX_OPLEVERING.md`

## 4. Hoe afdeling verwijderen nu werkt
Instellingen > Afdelingen gebruikt nu een specifieke delete-hook in `UI.openTableManager`. Bij verwijderen zoekt `removeUnusedDepartment()` eerst naar referenties. Als er geen gebruik is, vraagt de UI bevestiging en voert daarna een `CWS.mutate("department_delete", ...)` uit. Daarbij worden de rij in `settings.tables.departments`, eventuele legacy aliasrijen, de legacy `departments.byId/order` entry en nulreferenties in projecturen opgeschoond. De wijziging loopt via het normale savepad en is daarmee D1/refresh-proof.

## 5. Hoe afdeling-in-gebruik wordt afgehandeld
V87 kiest Flow A: blokkeren met duidelijke melding. `findDepartmentUsage(st, departmentIdOrName)` controleert projecten, projecturen, Gantt-rijen, legacy task phases, templates, resources/werknemers en capacity sources. Bij gebruik toont de UI hoeveel projecten, Gantt-taken, templates/fasen, werknemers/resources en capaciteitsbronnen de afdeling nog gebruiken, met voorbeelden. De gebruiker krijgt advies om eerst referenties aan te passen of de afdeling te hernoemen. Er wordt een audit `department_delete_blocked` geregistreerd.

## 6. Hoe D1-save/refresh-proof is gemaakt
Ongebruikte afdelingen worden verwijderd via `CWS.mutate`, waardoor validatie, audit, undo-stack, capacity rebuild en save naar lokale snapshot/D1 blijven lopen zoals bij andere user actions. `syncDepartments()` respecteert nu `settings.deletedDepartments` voor afgeleide bronnen, zodat een bewust verwijderde afdeling niet direct terugkomt vanuit legacy `departments` of andere oude bronnen. Expliciet opnieuw toevoegen in `settings.tables.departments` blijft mogelijk.

## 7. Tests uitgevoerd
- `npm.cmd ci`
- `npm.cmd run lint:syntax`
- `npm.cmd run preflight:v87`
- `npm.cmd run preflight:all`
- `npm.cmd run build`
- `npm.cmd test`
- `npm.cmd run test:e2e`

Alle checks zijn groen. De responsive/headless suite controleert ook Instellingen op 390, 768, 1024 en 1440 px zonder kritieke consolefouten.

## 8. Open punten
- Productie-D1 refresh-proof gedrag moet na deploy live worden bevestigd tegen Cloudflare D1.
- De implementatie migreert gebruikte afdelingen niet automatisch; gebruikte afdelingen worden bewust geblokkeerd om dataverlies te voorkomen.

## 9. Live testplan
1. Open `https://planning-cop.pages.dev/`.
2. Ga naar Instellingen.
3. Ga naar Afdelingen.
4. Maak een tijdelijke afdeling `TEST VERWIJDEREN`.
5. Sla op.
6. Verwijder `TEST VERWIJDEREN`.
7. Refresh de pagina.
8. Controleer dat de afdeling wegblijft.
9. Probeer een afdeling te verwijderen die in projecten/Gantt/resources wordt gebruikt.
10. Controleer dat verwijderen wordt geblokkeerd met duidelijke melding.
11. Controleer dat er geen console errors zijn.
12. Controleer dat opslag Cloudflare D1 blijft.

## 10. Commit en PR
Commitboodschap: `V87 fix settings department delete`.
PR wordt geopend vanaf branch `feature/v87-settings-department-delete-fix` naar `main`.
