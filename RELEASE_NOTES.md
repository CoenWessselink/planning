# Release notes — CWS Planning 2.0.0

Datum: 12 augustus 2026

## Status

De bronrelease is hersteld tegen de volledige pakketaudit. De code en lokale releaseproeven zijn geschikt gemaakt voor een gecontroleerde Cloudflare Pages Functions + D1-deployment. Live Cloudflare-configuratie en productiegegevens maken geen deel uit van deze ZIP en moeten vóór deployment afzonderlijk worden gecontroleerd.

## Opgeloste releaseblokkers

1. **Veilige publicatiegrens** — `wrangler.toml` publiceert alleen `dist/`; de build gebruikt een vaste allowlist. SQL-back-ups, interne rapporten, historische testartefacten en bronbestanden zijn verwijderd of uitgesloten.
2. **Server-side versieconflicten** — iedere save vereist de exacte `baseVersion`; een verouderde writer krijgt HTTP 409.
3. **Atomische chunkopslag** — chunks, commit, actieve pointer en retentie worden in één D1-batch uitgevoerd met checksum en rollback.
4. **Reproduceerbare testketen** — dependencies zijn gepind; de release bevat unit-, integratie-, statische en echte Playwright-browsertests.

## Belangrijkste aanvullende reparaties

- geldige lege en kleine D1-datasets worden als gedeelde gezaghebbende bron geaccepteerd;
- grotere lokale browserdata wordt vóór remote hydratatie als herstelkopie bewaard, maar nooit automatisch geüpload;
- onbekende Access-gebruikers worden deny-by-default geweigerd;
- eerste admin wordt alleen via een expliciet bootstrapadres aangemaakt;
- Access-JWT wordt cryptografisch en op claims gevalideerd;
- laatste actieve admin is in API én D1 beschermd;
- D1-cleanup is POST-only, admin-only, same-origin en tokenbeveiligd;
- auditactor, revisieauteur en tijd worden server-side bepaald;
- opgeslagen logo’s zijn begrensde PNG/JPEG-data-URL’s;
- importlimieten, ZIP-compressieratio, JSON-complexiteit en spreadsheetformules zijn afgeschermd;
- onbetrouwbare `postMessage`-opdrachten worden geweigerd;
- consistente securityheaders zijn toegevoegd;
- statische form-controls hebben toegankelijke namen;
- oude tekstpreflights en dubbele testservers zijn verwijderd;
- ingebouwde XLSX-conversie werkt zonder het eerder ontbrekende externe `xlsx`-pakket.

## Releaseproeven

De meegeleverde releasepoort controleert onder meer:

- syntax van JavaScript, MJS en inline HTML-scripts;
- publicatieallowlist en verboden bestandstypen;
- migratie van historische schema’s zonder dataverlies;
- exacte CAS en twee gelijktijdige writers;
- grote chunked state, checksum, rollback en corruptieherstel;
- retentie van stateversies;
- rollen, onbekende gebruikers en laatste-adminbeveiliging;
- imports, logo’s en XLSX;
- alle productiemodules in een echte browser;
- project aanmaken, D1-save en reload;
- beveiligde bronpaden en mobiele 390×844-weergave.

## Niet in deze bronrelease uitgevoerd

- geen live productie-deployment;
- geen wijziging van een bestaande Cloudflare Access-policy;
- geen migratie van een live D1-database;
- geen verwijdering van eventuele eerdere Pages-deployments.

Volg `docs/DEPLOYMENT.md` en maak vóór productie een D1-herstelpunt.
