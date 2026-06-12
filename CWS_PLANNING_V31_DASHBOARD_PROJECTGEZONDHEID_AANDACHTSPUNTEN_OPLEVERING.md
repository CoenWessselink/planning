# CWS Planning V31 — Dashboard, projectgezondheid en aandachtspunten

## Build
CWS_PLANNING_CLOUDFLARE_D1_V31_DASHBOARD_PROJECTGEZONDHEID_AANDACHTSPUNTEN.zip

## Doel
Meer overzicht krijgen in de volledige planning. Niet extra losse invoervelden, maar centrale signalering:

- Wat is rood/oranje?
- Waarom is het rood/oranje?
- Waar klik je om het op te lossen?

## Gebouwd

### 1. Centrale attention-engine
Nieuw bestand:

- `js/core/attention.js`

De engine leest uit bestaande state:

- Projecten
- Gantt-taken
- Gantt-voortgang
- Gantt-terugkoppeling
- Gantt hoursByDay
- Capaciteit / overrides
- Resources / afdelingen

De engine signaleert onder andere:

- projecten zonder Gantt-planning;
- projecten zonder afdelingsuren;
- taken zonder afdeling;
- taken zonder resource;
- verlopen taken die niet gereed zijn;
- geblokkeerde/aandacht-taken;
- capaciteitstekorten;
- capaciteit bijna vol;
- handmatige capaciteitsoverrides;
- terugkoppelingen ouder dan 7 dagen.

### 2. Dashboard “Vandaag aandacht nodig”
Aangepast:

- `layers/laag9_dashboard.html`

Toegevoegd:

- rode projecten;
- oranje projecten;
- verlopen taken;
- capaciteitstekorten;
- projecten zonder planning;
- geblokkeerde taken;
- oude terugkoppelingen;
- handmatige capaciteitsafwijkingen.

Klik op een tegel opent de juiste module.

### 3. Projectgezondheid in Projectoverzicht
Aangepast:

- `layers/laag6_projectoverzicht.html`

Toegevoegd:

- kolom Gezondheid;
- kolom Waarom aandacht?;
- planning compleet / incompleet;
- automatische projectgezondheid;
- “Waarom aandacht?” popup;
- doorklik naar Gantt, Capaciteit, Projectoverzicht en Preflight.

Kleuren:

- Groen = op schema;
- Oranje = aandacht;
- Rood = probleem;
- Blauw = voorbereiding;
- Grijs = afgerond.

### 4. Capaciteitsheatmap
Aangepast:

- `layers/laag5_capaciteit.html`

Toegevoegd boven de matrix:

- afdeling per week;
- groen/oranje/rood indicatie;
- tekort of resterende uren;
- klik op cel opent bestaande capaciteitspopup per afdeling.

### 5. Aandachtspuntenrapport
Aangepast:

- `layers/laag8_rapporten.html`

Toegevoegd template:

- `Aandachtspuntenrapport`

Met kolommen:

- ernst;
- project / afdeling;
- aandachtspunt;
- actie / module.

### 6. Functionele Preflight V31
Aangepast:

- `layers/laag13_preflight.html`
- `scripts/v31-preflight-static.mjs`
- `package.json`

Toegevoegd:

- Attention-engine actief;
- projectgezondheid berekend;
- projecten zonder planning;
- taken zonder afdeling;
- taken zonder resource;
- verlopen taken;
- capaciteitstekorten;
- recente terugkoppeling;
- aantallen rood/oranje;
- aandachtspunten totaal.

## Controles uitgevoerd

- `npm ci` — geslaagd
- `npm run lint:syntax` — geslaagd
- `npm run preflight:v28` — geslaagd
- `npm run preflight:v29` — geslaagd
- `npm run preflight:v30` — geslaagd
- `npm run preflight:v31` — geslaagd

## Browser-test

`npm run test:e2e -- --reporter=line` is gestart, maar echte browsertests konden niet draaien omdat Chromium ontbreekt in de omgeving.

`npx playwright install chromium` is geprobeerd, maar faalde door DNS/netwerkfout:

`EAI_AGAIN cdn.playwright.dev`

## Push

```powershell
Set-Location “C:\Planning”; git add -A; git commit -m “Add dashboard project health and attention engine v31”; git push -u origin main
```
