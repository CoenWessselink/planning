# CWS Planning — Cloudflare Pages + Access + D1 interne test

## Status v9

Deze build is bedoeld voor een kleine interne browsertest met gedeelde opslag via Cloudflare D1.

**Productie-URL:** `https://planning-cop.pages.dev`  
**GitHub repo:** `https://github.com/CoenWessselink/planning`  
**D1 database:** `cws-planning-intern`  
**D1 database ID:** `731abdc6-5a69-44e8-a35e-12b543367a98`

## Cloudflare Pages instellingen

Ga naar:

```text
Workers & Pages → planning → Settings
```

Gebruik:

```text
Production branch: main
Framework preset: None
Build command: leeg
Build output directory: /
Root directory: leeg
```

## Cloudflare Access login

Ga naar:

```text
Zero Trust → Access controls → Applications
```

Maak of controleer:

```text
Application name: CWS Planning Intern
Destination: planning-cop.pages.dev/*
Policy: Interne testers
Action: Allow
Include: Emails
Identity provider: One-time PIN
```

Gebruik bij de destination geen dubbel subdomain. Correct is:

```text
Subdomain: leeg
Domain: planning-cop.pages.dev
Path: *
```

of, wanneer Cloudflare om losse velden vraagt:

```text
planning-cop.pages.dev/*
```

## D1 binding aan Pages koppelen

Ga naar:

```text
Workers & Pages → planning → Settings → Bindings
```

Voeg voor **Production** toe:

```text
Type: D1 database
Variable name: DB
Database: cws-planning-intern
```

Herhaal exact hetzelfde voor **Preview**:

```text
Choose Environment: Preview
Type: D1 database
Variable name: DB
Database: cws-planning-intern
```

## D1 schema aanmaken

Ga naar:

```text
Storage & databases → D1 SQLite Database → cws-planning-intern → Console
```

Voer `migrations/0001_init.sql` uit.

Controleer daarna:

```sql
SELECT tenant_id, state_key, version, updated_at, updated_by
FROM app_state;
```

Verwacht:

```text
internal | main | 1 | datum/tijd | system
```

## Schema herstellen bij eerdere handmatige SQL

Wanneer eerder een oud schema is aangemaakt met kolommen zoals `id` of `schema_version`, voer dan alleen tijdens de testfase dit bestand uit:

```text
migrations/0002_reconcile_schema.sql
```

Let op: dit verwijdert bestaande testdata. Alleen gebruiken zolang er geen echte bedrijfsdata in D1 staat.

## API-controle

Na deploy en Access-login moeten deze endpoints werken:

```text
https://planning-cop.pages.dev/api/health
https://planning-cop.pages.dev/api/state
https://planning-cop.pages.dev/api/audit
```

`/api/health` mag technische status tonen. `/api/state` en `/api/audit` eisen in productie een Cloudflare Access-identiteit via:

```text
CF-Access-Authenticated-User-Email
```

Zonder Access-header geeft `/api/state` bewust `401`.

## Rollen

De eerste gebruiker die via Access de applicatie opent wordt automatisch:

```text
admin
```

Nieuwe gebruikers worden standaard:

```text
viewer
```

Rechten:

```text
viewer  = lezen, niet opslaan
planner = projecten/planning opslaan, audit lezen
admin   = alles, inclusief demo reset en data leegmaken
```

Admin kan rollen technisch beheren via de D1 API `/api/users`; de visuele rollenbeheer-UI wordt in een volgende hardeningfase verder uitgebreid.

## Concurrency / gelijktijdig werken

De app gebruikt D1 `version` als optimistic concurrency-check.

- GET `/api/state` geeft `version` terug.
- PUT `/api/state` stuurt `baseVersion` mee.
- Als iemand anders tussendoor opslaat, geeft de server `409 Conflict`.
- De frontend toont dan: “Data is gewijzigd door een andere gebruiker. Herlaad om overschrijven te voorkomen.”

## Lokale fallback

Wanneer D1 of Access niet bereikbaar is, valt de app terug naar localStorage. In de header staat dan duidelijk:

```text
D1 niet bereikbaar - lokale fallback
```

of:

```text
Lokale browserdata - niet gedeeld
```

In fallback-modus zien collega’s elkaars wijzigingen niet.

## Build/test lokaal

```bash
npm install
npm run lint:syntax
npm run test:e2e
```

Wrangler lokaal:

```bash
npm run dev
```

## Acceptatie voor interne test

De test is bruikbaar wanneer:

- Cloudflare Access login verschijnt vóór de app.
- Header toont `Cloudflare D1 - gedeelde interne testdata`.
- `/api/health` geeft `ok:true` en `schemaOk:true`.
- Projectwijziging blijft na refresh staan.
- Collega ziet dezelfde data na eigen login.
- Audit toont het e-mailadres van de wijziging.
- Viewer kan niet opslaan.
- Admin kan demo resetten.
- Browserdata wissen verwijdert geen D1-data.
