# Securitybeleid

## Ondersteunde release

Deze bronkopie vertegenwoordigt CWS Planning `2.0.0`. Beveiligingscorrecties moeten altijd worden toegepast op de volledige releasebron en opnieuw door `npm run verify` worden gehaald.

## Authenticatie

Productie vereist Cloudflare Access. Pages Functions vertrouwen niet uitsluitend op de gebruikers-e-mailheader, maar controleren:

- `Cf-Access-Jwt-Assertion`;
- RS256-handtekening via de issuer-JWKS;
- issuer;
- audience;
- verloop-, not-before- en uitgiftetijd;
- overeenkomst tussen JWT-e-mail en eventuele Access-e-mailheader.

De lokale bypass werkt alleen op lokale hosts én wanneer `CWS_LOCAL_AUTH_BYPASS=true` expliciet is ingesteld.

## Autorisatie

- Onbekende accounts worden geweigerd.
- Alleen de geconfigureerde bootstrap-identiteit kan de eerste admin worden wanneer de gebruikerstabel leeg is.
- Admin, planner en viewer worden server-side afgedwongen.
- De laatste actieve admin kan niet worden gedegradeerd, gedeactiveerd of verwijderd.
- Destructieve statevervanging vereist adminrol, een toegestane intentie en bevestiging van de actuele baseVersion.

## Data-integriteit

- Iedere save gebruikt compare-and-swap op de exacte serverversie.
- Grotere states worden gechunkt met SHA-256-checksum.
- Commit, chunks, actieve pointer en retentie worden atomisch uitgevoerd.
- Commits en chunks zijn immutable per versie.
- Corrupte actieve chunks kunnen alleen-lezen terugvallen op een eerdere geldige commit.

## Browserbeveiliging

- CSP zonder `unsafe-eval`;
- HSTS, nosniff, frame-, referrer-, permissions-, opener- en resourcepolicyheaders;
- same-origincontrole voor mutaties;
- geen wildcard-CORS;
- `postMessage` alleen van eigen origin en het actuele applicatie-iframe;
- beveiligde logo-, JSON-, CSV- en XLSX-invoer;
- spreadsheetformuleneutralisatie bij CSV-export.

## Geheimen

Commit nooit:

- `.dev.vars` of `.env`;
- Access audiences die niet openbaar mogen zijn;
- onderhoudstokens;
- API-tokens;
- databaseback-ups;
- SQL-dumps met productiegegevens;
- browserprofielen of lokale SQLite-bestanden.

## Melding

Bij een vermoed beveiligingsincident:

1. beperk toegang via Cloudflare Access;
2. stop verdere deployments en writes;
3. bewaar relevante serverlogs en auditregels buiten de webroot;
4. roteer onderhouds- en deploytokens indien blootstelling mogelijk is;
5. controleer eerdere Pages-deployments op onbedoeld gepubliceerde bestanden;
6. herstel vanuit een bekende goede release en valideer met `npm run verify`.
