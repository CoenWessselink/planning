# CWS Planning V41 — Gantt print, templates, datum/duur en resource hardening

Deze build is gebaseerd op V40 en verwerkt de opmerkingen uit de print/PDF-controle en screenshots.

## Gantt
- Afdeling blijft dropdown in de tabel en taakpopup.
- Resource is nu een invulveld met datalist-suggesties in de tabel en taakpopup.
- Start en einde zijn echte date-inputs met weeknummerlabel.
- Dubbelklik op datum opent waar ondersteund de browser datepicker.
- Duur is direct handmatig invulbaar in de Gantt-tabel.
- Wijzigen van duur rekent de einddatum door vanaf de startdatum.
- Voorganger blijft zichtbaar als regelnummer(s) en intern als taak-id.

## Templates — Taken & Fasen
- Afdeling is dropdown.
- Resource is invulveld.
- Nr/Fase/Taak blijven sticky zichtbaar bij horizontaal scrollen.
- Voorgangers blijven als regelnummer(s) zichtbaar en via multiselect te kiezen.

## Print / afdrukken
- Printkop wordt tijdens render gevuld met projectnaam - projectnummer - opdrachtgever.
- Logo/initialen-placeholder is hard geborgd in de printheader.
- Boven/Compact/Menu en mobiele toolbars worden extra hard verborgen in print.
- Tabel en diagram gebruiken één vaste print-rijhoogte.
- Alle daglijnen en taakrijlijnen gebruiken één uniforme dunne lijndikte.
- Linker taaktabel en diagram moeten verticaal doorlopen op dezelfde rijhoogte.
- Documenttitel blijft projectnaam-projectnummer-opdrachtgever-datum.

## Checks
Groen uitgevoerd:
- npm ci
- npm run lint:syntax
- npm run preflight:v28 t/m v41
- npm run test:e2e

## Niet volledig automatisch bewezen
- Echte PDF/printpreview moet lokaal nog visueel gecontroleerd worden omdat browserprint/PDF-uitvoer afhankelijk is van de lokale browser/printerinstellingen.
