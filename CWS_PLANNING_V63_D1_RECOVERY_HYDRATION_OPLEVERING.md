# CWS Planning V63 — D1 recovery hydration + UI-only save fix

## Doel

V63 lost het probleem op waarbij D1 aantoonbaar 76 projecten bevatte, maar de browser na het wissen van sitegegevens toch 0 projecten bleef tonen en direct een V62 save-guard melding gaf.

## Oorzaak

V62 beschermde de D1-data correct tegen overschrijven, maar de browser bleef op een lege lokale/default state staan wanneer de remote state door nieuwe validatieregels niet volledig werd geaccepteerd. Daarna riep de router bij opstarten `CWS.setState()` aan voor alleen `ui.lastApp`; in V62 triggert ook zo'n UI-only wijziging een remote save. De server blokkeerde dat terecht, maar daardoor bleef de gebruiker in conflictmodus.

## Opgelost

- Remote D1-state is nu leidend wanneer er businessdata aanwezig is.
- Oude/rijke D1-state met `projects.order`, `projects.byId`, `ganttV2.byProject`, `tasks.byProject` en `gantt.hoursByDay` wordt altijd gehydrateerd in de browser.
- Validatiewaarschuwingen op legacy data blokkeren het laden niet meer wanneer de state aantoonbaar projecten/taken bevat.
- Gantt-uren worden vóór validatie opnieuw opgebouwd volgens de huidige werkdaglogica.
- UI-only wijzigingen zoals `ui.lastApp` worden alleen lokaal opgeslagen en veroorzaken geen D1 PUT meer.
- Een lege D1-response wordt niet meer automatisch “gerepareerd” door een lege browserstate naar D1 te uploaden.
- V62 server-side overwrite guard blijft actief.
- Health-versie is `internal-test-v63`.

## Verwachte controle na deploy

Na deploy en Ctrl+F5/incognito moet Preflight ongeveer tonen:

- Opslag: Cloudflare D1
- Projecten: 76
- Gantt-projecten/rijen aanwezig
- Remote version rond de herstelde D1-versie

## Niet doen tijdens recovery

Niet klikken op:

- Demo data
- Data leegmaken
- Opslaan vanuit een lege weergave

Pas verder werken wanneer de projecten zichtbaar zijn.
