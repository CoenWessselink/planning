# CWS Planning

CWS Planning is een interne planningstoepassing voor projecten, Gantt-planning, capaciteit, afdelingsplanning, resources, transport, rapportages, revisies, rollen en auditregistratie.

Deze release is ingericht voor **Cloudflare Pages Functions + D1**. De browser gebruikt één centrale state-API; D1-versies worden conditioneel en atomair opgeslagen. De statische website wordt uitsluitend uit `dist/` gepubliceerd.

## Releaseprofiel

- Productienaam: `CWS Planning`
- Packageversie: `2.0.1`
- Node.js: `22` of hoger
- Cloudflare Wrangler: exact `4.120.0` via de npm-scripts
- Playwright Test: exact `1.62.1`
- Pages-output: uitsluitend `dist/`
- D1-binding: `DB`
- D1-databasenaam: `cws-planning-intern`

## Snel lokaal starten

```bash
npm ci
npm run build
npm run dev
```

Open daarna `http://127.0.0.1:8788`.

`npm run dev` gebruikt de meegeleverde lokale Pages/D1-adapter met een afzonderlijke SQLite-testdatabase in `.local-d1/`. Deze adapter is alleen bedoeld voor ontwikkeling en geautomatiseerde tests.

Voor lokaal testen met Wrangler zelf:

```bash
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev:cloudflare
```

## Volledige kwaliteitscontrole

```bash
npm ci
npm run test:e2e:install
npm run verify
```

De releasepoort bestaat uit:

1. JavaScript- en inline-HTML-syntaxcontrole;
2. statische beveiligingscontrole;
3. unit-tests voor authenticatie, validatie, logo’s, importgrenzen en XLSX;
4. D1-integratietests voor migraties, CAS, gelijktijdige writers, chunking, rollback, herstel, rollen en laatste-adminbescherming;
5. allowlist-build en controle van alle lokale bestandsreferenties;
6. echte Playwright-browsertests voor opstart, D1-opslag, alle productiemodules, project-CRUD, beveiligde bestanden, identiteit, CAS en mobiele weergave.

## Belangrijkste mappen

| Pad | Functie |
|---|---|
| `index.html` | Applicatieshell en beveiligde iframe-communicatie |
| `js/core/` | Centrale browserstate, router, import/export en interactieve planning |
| `layers/` | Functionele modules die in de applicatieshell worden geladen |
| `functions/api/` | Pages Functions voor state, identiteit, gebruikers, audit, revisies en onderhoud |
| `migrations/` | Niet-destructieve D1-migraties en integriteits-triggers |
| `scripts/` | Build, lokale server, tests en ingebouwde XLSX-conversie |
| `tests/release/` | Actuele unit-, integratie-, statische en E2E-releaseproeven |
| `dist/` | Enige publiceerbare statische output; opnieuw te genereren met `npm run build` |

## Productievariabelen

Configureer deze waarden in de Cloudflare Pages-omgeving:

| Variabele | Vereist | Doel |
|---|---:|---|
| `ACCESS_TEAM_DOMAIN` | Nee* | Optionele vaste Cloudflare Access issuer; auto-discovery is voor deze installatie ingeschakeld. |
| `ACCESS_AUD` | Nee* | Optionele vaste Audience; auto-discovery is voor deze installatie ingeschakeld. |
| `CWS_BOOTSTRAP_ADMIN_EMAIL` | Ja bij eerste installatie | Enige identiteit die als eerste admin mag worden aangemaakt wanneer `app_users` nog leeg is |
| `CWS_MAINTENANCE_TOKEN` | Ja voor onderhoud | Extra geheim voor het expliciete D1-cleanupendpoint |

`CWS_LOCAL_AUTH_BYPASS=true` mag uitsluitend lokaal worden gebruikt en hoort niet in productievariabelen thuis.

## Gebruikersmodel

- Onbekende gebruikers worden standaard geweigerd met HTTP 403.
- Alleen wanneer `app_users` leeg is, mag het exact geconfigureerde bootstrapadres de eerste admin worden.
- Daarna voegt een admin gebruikers expliciet toe als `admin`, `planner` of `viewer`.
- De API en D1-triggers verhinderen dat de laatste actieve admin wordt verwijderd, gedeactiveerd of gedegradeerd.

## Deployment

Lees vóór productiepublicatie:

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md)
- [`docs/RECOVERY.md`](docs/RECOVERY.md)
- [`SECURITY.md`](SECURITY.md)
- [`RELEASE_NOTES.md`](RELEASE_NOTES.md)

De korte route is:

```bash
npm ci
npm run test:e2e:install
npm run db:migrate:remote
npm run deploy
```

Controleer vóór deze commando’s dat `wrangler.toml`, de Pages-projectnaam, de D1-database-id, Cloudflare Access en alle productievariabelen bij de bedoelde omgeving horen.


### Cloudflare Access zonder handmatige team/AUD-waarden

Deze installatie gebruikt `CWS_ACCESS_AUTO_DISCOVERY=true` in `wrangler.toml`. Daardoor hoeven `ACCESS_TEAM_DOMAIN` en `ACCESS_AUD` niet vooraf handmatig te worden ingevuld. Cloudflare Access zelf moet wel voor het productie-hostname zijn ingeschakeld, zodat `Cf-Access-Jwt-Assertion` aanwezig is. De JWT-handtekening wordt nog steeds gecontroleerd tegen de Cloudflare Access JWKS en de gebruiker moet in D1 geautoriseerd zijn. Voor maximale tenant-pinning kunnen de twee expliciete waarden later alsnog worden toegevoegd; die krijgen automatisch voorrang.
