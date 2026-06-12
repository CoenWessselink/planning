# CWS Planning V38 — Print + Gantt regelnummer/voorganger hardening

## Basis
Gebouwd op: V37 mobiele optimalisatiebuild.
Doel: de door gebruiker gemarkeerde print- en Gantt-punten oplossen.

## Aangepast
- Gantt-tabel heeft een extra kolom **Nr** voor regelnummer/taaknummer.
- Nummering loopt altijd van boven naar beneden: 1, 2, 3, enzovoort.
- Bij rijvolgorde/drag wordt de nummering opnieuw opgebouwd op basis van de actuele zichtbare volgorde.
- Afhankelijkheden staan standaard uit bij openen.
- De knop Afhankelijkheden blijft beschikbaar om ze handmatig aan te zetten.
- Kolom Voorganger toont geen technische ID meer, maar het regelnummer van de voorganger.
- Technische voorganger blijft intern bewaard voor berekeningen, maar wordt in de tabel als nummer weergegeven.
- Printkop is opgeschoond: geen Boven / Compact / Menu en geen app-toolbar in print.
- Printkop toont projectnaam - projectnummer - opdrachtgever.
- Print/PDF documenttitel is geschikt als bestandsnaam: projectnaam-projectnummer-opdrachtgever-datum.
- Print-taaktabel links heeft kolommen Regel nr / Naam / Resource / Duur.
- Printlijnen/rasterlijnen zijn dunner gemaakt.
- Printheader toont logo als ingesteld; zonder logo is er een nette bedrijfsinitialen-placeholder.

## Nieuwe checks
- `npm run preflight:v38`
- Fallback E2E uitgebreid met V38-regressiechecks.

## Uitgevoerd
- npm ci
- npm run lint:syntax
- npm run preflight:v28 t/m v38
- npm run test:e2e

## Niet volledig bewezen
Echte Playwright/Chromium-run en echte browser-PDF-export blijven afhankelijk van lokale Playwright/printeromgeving.
