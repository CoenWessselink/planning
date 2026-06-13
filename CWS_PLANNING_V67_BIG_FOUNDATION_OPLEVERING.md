# CWS Planning V67 — Big Foundation Build

Datum: 2026-06-12
Build: `internal-test-v67`

## Doel
V67 pakt de structurele basis aan rond D1-herstel, legacy state-normalisatie, lokale testbaarheid en veilige herstel/backup-functies. De build is bedoeld als fundament voor verdere Gantt-, capaciteit- en projectoverzicht-harding zonder afhankelijk te blijven van live Cloudflare Access tijdens agentmodus-tests.

## Belangrijkste wijzigingen

### 1. D1 legacy normalizer als centrale runtimebasis
De bestaande en herstelde D1-structuur blijft de geldige bron:

- `projects.order`
- `projects.byId`
- `ganttV2.byProject`
- `tasks.byProject`
- `gantt.hoursByDay`
- `gantt.sourcesByDay`

Alle state gaat via `normalizeState(...)` voordat de runtime UI ermee werkt.

### 2. Lokale fixture/testmodus
Toegevoegd:

- `?fixture=restored-d1`
- `?loadLocalFixture=1`
- `CWS.recovery.loadRestoredD1Fixture()`

Deze fixture bootst de herstelde D1-structuur na met 76 projecten en een Zernike-project met PDF-achtige lange Gantt-taken.

### 3. Backup/restore API in de client
Toegevoegd onder `CWS.recovery`:

- `createRestoredD1Fixture`
- `loadRestoredD1Fixture`
- `importRawState`
- `exportStateJson`
- `createRecoverySnapshot`
- `restoreLastGoodSnapshot`
- `readLastGoodSnapshot`

### 4. Laatste-goede-snapshot beveiliging
De app bewaart automatisch een laatste goede lokale snapshot wanneer de state minimaal 20 projecten bevat. Dit voorkomt dat een lege/demo-state de enige lokale hersteloptie wordt.

### 5. Import / Export module uitgebreid
In `Import / Export` is een nieuw paneel toegevoegd:

- V67 Backup / Restore / Testmodus
- Snapshot maken
- Herstel laatste goede snapshot
- Laad V67 fixture lokaal
- State JSON import
- State JSON export
- Herstelstatus met project-/Gantt-/bronregels-metrics

### 6. Gantt fundament behouden
De V66 Gantt-balkgeometrie blijft centraal:

- `continuousBarGeometry(...)`
- brede continue PDF-achtige balken
- visuele balkbreedte los van werkdagen-urenverdeling
- drag/resize gebruikt effectieve planning

### 7. Guards blijven actief
De V62/V63 guard blijft actief:

- grote D1-state mag niet overschreven worden door 0/1/5-project state
- demo/lege state wordt geblokkeerd bij grote planning
- UI-only routing triggert geen D1 PUT

## Checks
Uitgevoerd:

- `npm ci`
- `npm run lint:syntax`
- `npm run preflight:v28` t/m `npm run preflight:v67`
- `npm run test:e2e`

Alle uitgevoerde checks zijn groen.

## Niet live bewezen
Live regressietest op `https://planning-cop.pages.dev` is niet uitgevoerd omdat Cloudflare Access authenticatie vereist. V67 bevat daarom expliciet een lokale fixture/testmodus zodat agentmodus voortaan zonder live D1-toegang de legacy-structuur kan testen.

## Gebruik lokale fixture
Open lokaal of na deploy:

```text
https://planning-cop.pages.dev?fixture=restored-d1
```

Of lokaal:

```text
file:///.../index.html?fixture=restored-d1
```

Daarna moet de app ongeveer 76 projecten tonen en het Zernike-project bevatten.
