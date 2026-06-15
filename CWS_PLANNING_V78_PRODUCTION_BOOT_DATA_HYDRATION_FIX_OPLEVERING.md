# CWS Planning V78 - Production Boot Data Hydration Fix

## 1. Probleemomschrijving

De productie-app kon half leeg of traag starten. Previewdeployments leken soms sneller, maar gebruikten lokale browserdata in plaats van de gedeelde Cloudflare D1-state. Na V77 konden modules wel openen terwijl de bronkeuze en hydration nog niet betrouwbaar waren afgerond.

## 2. Root cause

De belangrijkste fout was dat `/api/health` als gate voor `/api/state` werd gebruikt. Bij een trage of afwijkende health-response probeerde de client de echte D1-state niet meer en koos hij lokale fallback.

Daarnaast:

- de shell en router startten pas na `await CWS.init()`;
- de geselecteerde bootstate werd opnieuw genormaliseerd;
- er was geen harde centrale blokkade voor `setState`, `mutate` en save tijdens boot;
- Access identity was alleen impliciet onderdeel van de state-response;
- modules hadden geen centrale routerbarriere voor `state-normalized`;
- de lokale headless runner accepteerde V77 niet als serverversie en maskeerde daardoor browserregressies.

## 3. Waarom V77 niet voldoende was

V77 stelde zware controles uit en startte standaard op Projecten, maar koppelde de remote state-load nog aan health-detectie. Daardoor kon een health-timeout geldige D1-data uitsluiten. Ook bleef de shell wachten op de volledige init en ontbrak een expliciete state machine met bronprioriteit en saveguard.

## 4. Nieuwe boot-flow

De centrale bootfasen zijn:

1. `booting`
2. `shell-ready`
3. `identity-loading`
4. `identity-ready` of `identity-failed-nonblocking`
5. `remote-state-loading`
6. `remote-state-ready` of `remote-state-failed`
7. `local-fallback-considered`
8. `state-normalized`
9. `app-ready`
10. `boot-error`

De shell, het Apps Menu en de loading-state verschijnen direct. Identity en health starten onafhankelijk. `/api/state` wordt altijd rechtstreeks geprobeerd en wordt niet meer door health geblokkeerd. De router laadt de gekozen module pas na `app-ready`.

## 5. D1 versus lokale fallback

Een D1-state is autoritatief wanneer `projects.order` en `projects.byId` beide meer dan tien records bevatten en planningdata of voldoende payload aanwezig is. Die state wint altijd van lokale browserdata.

Lokale fallback wordt alleen gekozen als state-load faalt, D1 leeg/onvolledig is of lokale fixturemodus actief is. De bron staat in `CWS.storageStatus.stateSource` als `remote-d1`, `local-fallback` of `fixture`.

## 6. Module hydration

`Router.boot()` toont eerst een lichte loading-shell. `Router.markReady()` laadt daarna Projecten of de expliciet gevraagde module. Hierdoor kunnen Projecten, Gantt, Capaciteit, Projectoverzicht, Instellingen, Planbord en Import/Export niet definitief renderen op een te vroege lege state.

Gantt en Capaciteit behouden hun geplande subscriber-renders. De V74/V75 pointer lifecycle blijft intact.

## 7. Saveguard tijdens boot

Tijdens actieve boot worden `setState`, `mutate` en save geblokkeerd en geteld. Remote save kan alleen bij:

- fase `app-ready`;
- bron `remote-d1`;
- een gebruikersactie;
- geldige state;
- behoud van de bestaande client- en server-side shrinkguards.

Lokale fallback kan niet automatisch naar productie-D1 worden geschreven.

## 8. Aangepaste bestanden

- `index.html`
- `js/core/store.js`
- `js/core/router.js`
- `js/core/mobile_adapter.js`
- `js/core/responsive.js`
- `layers/laag11_io.html`
- `functions/api/identity.js`
- `functions/api/health.js`
- `playwright/server.js`
- `scripts/serve.mjs`
- `scripts/headless-v72-smoke.mjs`
- `scripts/e2e-fallback.mjs`
- `scripts/v75-gantt-pointer-lifecycle-preflight.mjs`
- `scripts/v78-production-boot-data-hydration-preflight.mjs`
- `tests/responsive/v73-responsive-smoke.mjs`
- `package.json`
- dit opleverdocument

## 9. Uitgevoerde tests

- `npm ci`
- `npm run lint:syntax`
- `npm run preflight:v63`
- `npm run preflight:v70`
- `npm run preflight:v75`
- `npm run preflight:v77`
- `npm run preflight:v78`
- `node scripts/e2e-fallback.mjs`
- `node scripts/headless-v72-smoke.mjs`
- productie-URL geopend tot de Cloudflare Access-login
- lokale browsercontrole met vertraagde remote-D1-mock
- lokale browsercontrole met geforceerde `/api/state`-fout en fixturefallback

De volledige eindrun staat in het eindrapport.

## 10. Openstaande live checks

Cloudflare Access blokkeert geautomatiseerde toegang zonder gebruikerslogin. Daarom moeten na deploy met een geldige Access-sessie worden gecontroleerd:

- `/api/health` geeft 200 en `internal-test-v78`;
- `/api/identity` geeft de echte gebruiker;
- `/api/state` geeft 200 met 76 projecten;
- opslagstatus is `Cloudflare D1 - gedeelde interne testdata (76 projecten)`;
- alle hoofdmodules tonen data;
- er is geen herhaalde PUT-loop of zware state-call;
- de console bevat geen boot- of modulefouten.

## 11. Deploy-instructie

1. Merge de V78-PR naar `main`.
2. Laat Cloudflare Pages de productiebranch deployen.
3. Controleer D1-binding `DB` en de Access-policy.
4. Open `https://planning-cop.pages.dev/` met een geldige Access-sessie.
5. Voer de live checklist uit het eindrapport uit.

## 12. Rollback-instructie

1. Revert de V78-mergecommit op `main`.
2. Push de revert zodat Cloudflare Pages opnieuw deployt.
3. Controleer dat D1 niet is gewijzigd door een boot-save; V78 schrijft tijdens boot niets.
4. Gebruik alleen een Cloudflare Pages rollback naar de vorige deployment als een git-revert niet snel genoeg beschikbaar is.
