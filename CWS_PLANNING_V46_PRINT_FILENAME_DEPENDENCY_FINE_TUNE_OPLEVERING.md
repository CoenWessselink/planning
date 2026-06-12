# CWS Planning V46 — Print filename, raster en dependency fine-tuning

## Doel
V46 corrigeert de punten uit de visuele Gantt-printcontrole:

- PDF/documentnaam moet voorgesteld worden als `Projectnaam - Projectnummer - Opdrachtgever - Datum`.
- Diagramlijnen mogen lichter/dunner.
- Niet-werkbare dagen moeten iets donkerder grijs zijn.
- Tabel-/diagramuitlijning en kolombreedte moeten beter aansluiten op inhoud.
- Afhankelijkheidslijnen moeten beter zichtbaar zijn en anders aansluiten op taakbalken.

## Wijzigingen

### Gantt dependency-lijnen
- Routing sluit nu aan op het midden van de zijkant van bron- en doelbalk.
- Lijnen krijgen een witte halo onder de lijn zodat ze niet wegvallen op raster/balkranden.
- Schermlijn is iets dikker gezet.
- Pijlkop blijft zichtbaar bij korte aansluitingen.

### Gantt print
- Daglijnen zijn lichter en dunner.
- Niet-werkbare dagen zijn donkerder grijs gearceerd.
- Dikkere weekend/nonwork-randen zijn onderdrukt.
- Printtafelkolommen worden op basis van inhoud berekend:
  - Regel nr
  - Naam
  - Resource
  - Duur
- Linkertabelbreedte wordt automatisch doorgegeven aan het printgrid zodat diagram en tabel blijven aansluiten.

### PDF-/documenttitel
- Tijdens print wordt `document.title` gezet naar `Projectnaam - Projectnummer - Opdrachtgever - Datum`.
- Titel wordt niet direct na `afterprint` teruggezet, omdat sommige PDF-drivers de bestandsnaam pas later uitlezen.

## Test
- `npm ci`
- `npm run lint:syntax`
- `npm run preflight:v28` t/m `npm run preflight:v46`
- `npm run test:e2e`
