# CWS Planning v16 — Gantt kalender en A3 print herzien

## Doel
Deze versie herstelt de Gantt-weergave en printuitvoer op basis van de laatste feedback:

- Kalender/tijdlijn loopt visueel door tot het einde van het beschikbare diagramvenster.
- Daglijnen zijn dunner gemaakt maar blijven zichtbaar.
- Taakregels/lanes zijn met dunne lijnen gescheiden.
- A3-print is volledig herzien: diagram-only, liggend, 1 week vóór eerste taak t/m 1 week na laatste taak, passende dagbreedte, kleinere printbalken en legenda onderin.

## Aangepaste bestanden

- `layers/laag4_gantt.html`

## Technische wijzigingen

- Dynamische uitbreiding van het aantal zichtbare kalenderdagen op scherm via `extendRangeForViewport()`.
- Dynamische printdagbreedte via `setPrintDayWidth()` zodat het printbereik beter de A3-pagina vult.
- Printmodus gebruikt nu `body.printing` met aparte CSS voor:
  - A3 landscape;
  - compacte kalenderkop;
  - dunne dag/weeklijnen;
  - compacte taakbalken;
  - duidelijke taakrijscheiding;
  - legenda onder het diagram.
- `chartPane`, `timeline` en `lanes` krijgen nu expliciete breedte op basis van het berekende kalenderbereik, zodat geen leeg wit blok ontstaat binnen het diagramgebied.
- Dependency-lijnen gebruiken kleinere stroke-width in printmodus.

## Controle

Uitgevoerd:

```text
npm run lint:syntax
```

Resultaat:

```text
Syntaxcontrole geslaagd.
```

## Push

```powershell
Set-Location "C:\Planning"; git add -A; git commit -m "Revise Gantt calendar and A3 print v16"; git push -u origin main
```
