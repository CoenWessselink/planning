# CWS Planning — V81 Gantt print label/calendar fix

## Doel
Gerichte fix voor de printweergave waarbij taaktekst/labels in de Gantt-print door de kalender heen konden lopen.

## Oorzaak
De V80 printrestore zette de algemene printgeometrie terug, maar externe balklabels (`.bar-text-before` en `.bar-text-after`) hadden in print nog een hoge stacking-context en de taakrijen stonden op `overflow:visible`. Daardoor konden labels bij compacte A3-print buiten hun taakrij visueel over de boven- of onderkalender lopen.

## Oplossing
In `layers/laag4_gantt.html` is een finale V81 print-only override toegevoegd:

- printkalenders krijgen eigen stacking-context met hogere `z-index`;
- Gantt-rijen (`.lane`) knippen verticale overflow af;
- externe balklabels worden kleiner, begrensd en binnen de rij gehouden;
- labels krijgen een subtiele witte achtergrond zodat ze leesbaar blijven zonder kalenderlijnen te vervuilen;
- balken, dependencies en vandaag-lijn behouden hun eigen z-index binnen het diagram;
- responsive/mobile CSS blijft in print geneutraliseerd.

## Aangepaste bestanden
- `layers/laag4_gantt.html`
- `package.json`
- `scripts/v81-gantt-print-label-calendar-isolation-preflight.mjs`
- `CWS_PLANNING_V81_GANTT_PRINT_LABEL_CALENDAR_FIX_OPLEVERING.md`

## Tests/checks
- `npm run lint:syntax`
- `npm run preflight:v80`
- `npm run preflight:v81`
- `npm run preflight:all`
- `npm run build`

## Live controle
Na deploy:
1. Open Gantt.
2. Kies een project met meerdere taken en tekstlabels vóór/achter balken.
3. Klik `Print A3`.
4. Controleer dat labels niet meer door de boven- of onderkalender lopen.
5. Controleer dat tabel links, diagram rechts, kalender boven/onder en legenda behouden blijven.

## Rollback
Rollback naar V80 als alleen de label-isolatie ongewenst effect heeft. De wijziging is print-only en raakt geen D1-data, Gantt-data of drag/resize-logica.
