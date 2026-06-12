# CWS Planning V40 — Print raster + Templates voorgangers + Gantt templatekeuze

Gebouwd op V39.

## Print opgelost
- Boven/Compact/Menu en mobiele toolbar extra hard verborgen in print.
- Printkop compact: projectnaam - projectnummer - opdrachtgever.
- Logo of bedrijfsinitialen-placeholder in printheader.
- Volledig raster met éénzelfde dunne lijndikte voor tabel, taakrijen en dagkolommen.
- Daglijnen zijn terug: elke dag heeft een zichtbare dunne verticale lijn.
- Tabel en diagram delen dezelfde print-rijhoogte via --v40-print-row.
- Linkertabel: Regel nr / Naam / Resource / Duur.

## Templates opgelost
- Kolom Nr toegevoegd.
- Voorgangers tonen als regelnummers.
- Voorgangers kiezen via multiselect/picker.
- Meerdere voorgangers mogelijk.
- Alleen eerdere regels kunnen als voorganger worden gekozen.
- Intern blijven taak-id's bewaard.

## Gantt generatie
- Dropdown naast Genereer fasen: Template: ...
- Gekozen template wordt opgeslagen op project.templateId.
- Genereer fasen gebruikt de gekozen template.

## Checks
- preflight:v40 toegevoegd.
