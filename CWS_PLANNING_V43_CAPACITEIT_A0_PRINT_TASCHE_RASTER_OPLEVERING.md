# CWS Planning V43 — Capaciteit A0 print Tasche raster

Deze build breidt de V42-printstijl uit naar Capaciteit A0.

## Verwerkt

- Tasche-logo is vaste fallback in de capaciteit-printheader via `assets/tasche-logo.png`.
- Als er geen bedrijfslogo in de app-state staat, wordt het Tasche-logo getoond.
- Capaciteit A0 gebruikt Arial/Helvetica.
- Tabelregels krijgen lichtgrijze wisselregels.
- Afdelingskoppen krijgen Tasche-geel.
- Alle rasterlijnen zijn uniform dun:
  - rondom de tabel;
  - per afdeling;
  - per weekkolom;
  - per dagkolom;
  - per regel.
- Printbereik gebruikt: 1 week vóór huidige datum t/m 1 week na het ingestelde aantal weken vooruit.
- A0 printmodus is compacter gemaakt zodat meer weken/dagen passend worden op A0 liggend.
- Documenttitel/PDF-naam wordt gezet als: Bedrijfsnaam - Capaciteit - Datum.
- App-toolbar, mobiele toolbar en modalbackdrops worden in print verborgen.

## Validatie

Groen:

- `npm ci`
- `npm run lint:syntax`
- `npm run preflight:v28` t/m `npm run preflight:v43`
- `npm run test:e2e`

## Niet volledig bewezen

De daadwerkelijke PDF-bestandsnaam en printweergave blijven afhankelijk van de lokale browser/printengine. Controleer daarom visueel nog één keer in Chrome Print preview / Save as PDF.
