# Productiedeployment

## 1. Voorwaarden

Zorg voor:

- Node.js 22 of hoger;
- npm;
- toegang tot het bedoelde Cloudflare-account;
- een bestaand Cloudflare Pages-project;
- een D1-database voor deze productieomgeving;
- een Cloudflare Access-applicatie vóór de Pages-hostnaam;
- een vastgesteld eerste beheeradres.

Gebruik voor productie en preview bij voorkeur afzonderlijke D1-databases en afzonderlijke Access-configuratie.

## 2. Configuratie controleren

Controleer `wrangler.toml`:

```toml
name = "cws-planning-intern"
compatibility_date = "2026-08-12"
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "cws-planning-intern"
database_id = "<juiste-database-id>"
migrations_dir = "migrations"
```

De Wrangler-configuratie is leidend voor de Pages-deployment. Neem nooit een lokale of previewdatabase-id over naar productie zonder controle.

## 3. Access en omgevingswaarden

Configureer in de productieomgeving:

- `ACCESS_TEAM_DOMAIN`;
- `ACCESS_AUD`;
- `CWS_BOOTSTRAP_ADMIN_EMAIL`;
- `CWS_MAINTENANCE_TOKEN` als geheim.

Gebruik geen `CWS_LOCAL_AUTH_BYPASS` in productie.

De Access-policy moet de Pages-hostnaam en alle gebruikte custom domains afschermen. De API valideert daarnaast de Access-JWT zelf; beide lagen zijn vereist.

## 4. Schone installatie en verificatie

```bash
npm ci
npm run test:e2e:install
npm run verify
```

`npm run verify` moet volledig slagen. De statische build staat daarna in `dist/`.

Controleer aanvullend:

```bash
find dist -type f | sort
```

De map mag geen `.sql`, `.db`, `.sqlite`, `.zip`, `.md`, `.json`, `.toml`, logbestanden, back-ups of bronmappen bevatten.

## 5. D1 migreren

Maak vóór iedere migratie een herstelpunt volgens het interne Cloudflare-beheerproces. Voer daarna uit:

```bash
npm run db:migrate:remote
```

De migraties zijn niet-destructief en voegen de actuele tabellen, indexen en integriteitstriggers toe. Pages Functions voeren tijdens gewone requests geen schemawijzigingen uit; bij een ontbrekend schema retourneert de API een migratiefout.

## 6. Deployen

```bash
npm run deploy
```

Dit commando voert eerst alle releaseproeven uit en publiceert daarna `dist/` met Wrangler vanuit de projectroot. Omdat de `functions/`-map naast de projectconfiguratie staat, neemt Wrangler de Pages Functions mee.

Gebruik geen dashboard-drag-and-drop voor deze applicatie: daarmee wordt de `functions/`-map niet als Pages Functions gecompileerd.

## 7. Eerste beheerder

1. Open de productie-URL met het e-mailadres uit `CWS_BOOTSTRAP_ADMIN_EMAIL`.
2. Controleer `/api/identity` via de applicatie: rol moet `admin` zijn.
3. Voeg daarna alle overige admins, planners en viewers expliciet toe.
4. Controleer dat een onbekend Access-account HTTP 403 krijgt.

De bootstrap werkt alleen wanneer `app_users` nog volledig leeg is.

## 8. Productiesmoke

Controleer na deployment:

- `/api/health` geeft `ok: true` en `schemaOk: true`;
- de shell meldt D1 als gedeelde bron;
- een lege nieuwe database blijft in API-modus;
- een klein testproject kan worden opgeslagen en na reload worden teruggelezen;
- een tweede gelijktijdige save op dezelfde basisversie krijgt HTTP 409;
- viewer kan lezen maar niet schrijven;
- `wrangler.toml`, `package.json`, migraties en historische bestandsnamen geven HTTP 404;
- browserconsole bevat geen onverwachte fouten;
- desktop en 390×844 mobiel hebben geen horizontale shell-overflow.

## 9. Rollback

Bij een fout:

1. stop verdere writes via Access of de Pages-deployment;
2. rol de Pages-deployment terug naar de vorige bekende goede versie;
3. herstel D1 alleen wanneer data zelf beschadigd is;
4. voer de checks uit `docs/RECOVERY.md` uit;
5. heropen pas daarna de Access-policy.
