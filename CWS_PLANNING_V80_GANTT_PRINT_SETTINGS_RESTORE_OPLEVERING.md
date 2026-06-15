# CWS Planning V80 — Gantt Print Settings Restore

## Doel
Herstel van de oude, werkende Gantt-printinstellingen op basis van de V56-referentiebuild.

## Probleem
Na latere responsive/tablet/mobile en drag/resize-wijzigingen werkten printregels niet meer zoals in de oude versie. Met name responsive screen-regels met `!important` bleven ook in print-preview actief, waardoor de Gantt-print niet meer de oude V56 A3-landscape geometrie aanhield.

## Oplossing
In `layers/laag4_gantt.html` is een laatste, print-only override toegevoegd:

- A3 landscape met 6mm marge hersteld.
- Desktop/tablet/mobile responsive gridregels worden in `body.printing` geneutraliseerd.
- Printtaak-tabel krijgt weer vaste V56-breedte.
- Diagramkolom staat weer naast de printtaak-tabel en gebruikt de beschikbare breedte.
- Boven- en onderkalender blijven direct tegen de planning aan.
- Continue Gantt-balken krijgen compacte print-hoogte en labelregels.
- Mobiele toolbars, contextpanelen en modals worden in print verborgen.
- Dunne daglijnen en niet-werkbare-dagvlakken blijven behouden.
- Printlegend blijft compact onder de planning.

## Aangepaste bestanden
- `layers/laag4_gantt.html`
- `package.json`
- `scripts/v80-gantt-print-settings-restore-preflight.mjs`
- `CWS_PLANNING_V80_GANTT_PRINT_SETTINGS_RESTORE_OPLEVERING.md`

## Tests
Uit te voeren:

```powershell
npm run lint:syntax
npm run preflight:v80
npm run preflight:all
npm run build
```

## Live controle
Na deploy controleren:

1. Open `https://planning-cop.pages.dev/`.
2. Open Gantt.
3. Kies een project met meerdere taken.
4. Klik `Print A3`.
5. Controleer dat de print weer A3 landscape gebruikt.
6. Controleer dat tabel links, diagram rechts, kalender boven/onder en legenda compact staan.
7. Controleer dat responsive/mobile schermregels de print niet meer beïnvloeden.

## Rollback
Vorige build terugzetten of deze V80-wijzigingen verwijderen uit `layers/laag4_gantt.html`, `package.json` en `scripts/`.
