# CWS Planning V68 — Complete Foundation Build

Datum: 12-06-2026

## Doel
Deze build maakt de herstel-, test- en dataveiligheidslaag compleet genoeg om de planning betrouwbaar verder te ontwikkelen zonder dat een lege/demo-state de herstelde D1-data kan overschrijven.

## Inbegrepen

### 1. D1 legacy normalisatie
- Ondersteunt `projects.order` en `projects.byId`.
- Ondersteunt `ganttV2.byProject`.
- Ondersteunt `tasks.byProject`.
- Ondersteunt `gantt.hoursByDay` en `gantt.sourcesByDay`.
- Behoudt V66 continue Gantt-balkgeometrie.

### 2. Lokale testmodus
- `?fixture=restored-d1`
- `?fixture=v68`
- `?fixture=complete`

Deze fixture bevat 76 projecten en een Zernike-project met lange PDF-achtige Gantt-taken.

### 3. Import / herstel
Onder Import/Export is het V68-herstelpaneel uitgebreid met:
- JSON state-import.
- Cloudflare D1 SQL-export import.
- Import-preview vóór toepassen.
- Diagnosebestand downloaden.
- Recovery-lock aan/uit.
- Laatste goede snapshot herstellen.

### 4. State Doctor
Nieuwe interne diagnosefunctie:
- controleert projectaantallen;
- controleert legacy schema;
- controleert Gantt-rijen;
- controleert uren op niet-werkbare dagen;
- controleert orphan Gantt-projecten;
- controleert lange Gantt-balken;
- levert JSON-rapport.

### 5. Recovery-lock
De recovery-lock voorkomt dat een kleine of lege browserstate een grote planning vervangt.

### 6. Extra validaties vóór opslaan
- Geen Gantt-project zonder project.
- Geen dubbele taak-id binnen een Gantt-project.
- Geen taak zonder afdeling.
- Geen einddatum vóór startdatum.
- Geen uren op niet-werkbare dagen.
- Recovery-lock controle.

### 7. Preflight
Nieuwe check:
- `npm run preflight:v68`

Deze controle test:
- V68 health marker;
- SQL import extractie;
- import-preview;
- state doctor;
- recovery-lock;
- 76-project fixture;
- Zernike lange taken;
- bestaande D1 overwrite guard.

## Uitgevoerde checks
- `npm run lint:syntax`
- `npm run preflight:v28` t/m `npm run preflight:v68`
- `npm run test:e2e`

## Niet live bewezen
Live Cloudflare Access-test is niet uitgevoerd vanuit deze omgeving. De build bevat daarom juist de fixture/testmodus om zonder live toegang met een realistische 76-projectenstructuur te kunnen testen.

## Gebruik

### Lokaal testen met fixture
Open:

```text
index.html?fixture=v68
```

Of online na deploy:

```text
https://planning-cop.pages.dev?fixture=v68
```

Let op: gebruik fixture alleen voor testmodus.

### Push

```powershell
Set-Location "C:\Planning"

git add -A
git commit -m "V68 complete foundation recovery validation build"
git push -u origin main
```
