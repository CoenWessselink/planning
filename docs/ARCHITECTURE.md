# Architectuur CWS Planning 2.0

## 1. Overzicht

CWS Planning bestaat uit vier lagen:

1. **Statische applicatieshell** — `index.html`, centrale styles en browsermodules.
2. **Functionele modules** — HTML-lagen in `layers/`, geladen in één same-origin iframe.
3. **Pages Functions** — API-routes in `functions/api/`.
4. **D1-opslag** — versieerbare state, gebruikers, auditlog en revisies.

De shell bezit de centrale `window.CWS`-store. Functionele lagen krijgen deze store alleen via de same-origin parent. Er is geen afzonderlijke stateopslag per module.

## 2. Browserstate

`js/core/store.js` beheert:

- normalisatie en validatie van de planningsstate;
- rollen en browserrechten;
- lokale herstelkopieën;
- D1-hydratatie;
- coalescing van saves;
- conflictstatus en expliciete herstelacties;
- demo-, import- en resetflows.

Een geldige D1-state is altijd de gedeelde bron, ook wanneer de database leeg is of slechts enkele projecten bevat. Een grotere lokale browserstate mag die bron niet automatisch overschrijven. Voor zo’n overgang wordt eerst een lokale herstelkopie opgeslagen.

## 3. Saveprotocol

De browser laadt de actieve state met de actuele `version`. Iedere mutatie naar `/api/state` bevat dezelfde waarde als `baseVersion`.

De server:

1. valideert identiteit, rol, origin, payload en destructieve intentie;
2. leest de actieve D1-versie;
3. maakt een immutable commit voor `baseVersion + 1`;
4. schrijft eventuele chunks, commitmetadata en actieve pointer in één D1-`batch()`;
5. laat D1-triggers controleren dat de parentversie nog actueel is;
6. retourneert HTTP 409 wanneer een andere writer eerder committeerde.

Hierdoor kan een verouderde client geen nieuwere wijzigingen stil overschrijven.

## 4. D1-tabellen

| Tabel | Functie |
|---|---|
| `app_state` | Actieve pointer en compatibele actieve state |
| `app_state_commits` | Immutable stateversies met parentversie, checksum en omvang |
| `app_state_chunks` | Immutable chunks voor grotere states |
| `app_users` | Expliciet geprovisioneerde gebruikers en rollen |
| `audit_log` | Servergestuurde actor, actie, tijd en begrensde metadata |
| `app_revisions` | Projectrevisies met servergestuurde auteur en tijd |

De opslag bewaart een beperkt aantal recente commits. Een actieve corrupte chunkset kan alleen-lezen terugvallen op de laatste geldige commit.

## 5. Vertrouwensgrenzen

- Cloudflare Access JWT wordt server-side op issuer, audience, geldigheid, sleutel-id en RS256-handtekening gecontroleerd.
- De losse Access-e-mailheader is geen zelfstandige authenticatiebron.
- Productiemutaties vereisen dezelfde origin.
- Onbekende gebruikers zijn niet geautoriseerd.
- `postMessage`-acties worden alleen geaccepteerd van het actuele applicatie-iframe en de eigen origin.
- Logo’s zijn beperkt tot begrensde PNG/JPEG-data-URL’s.
- JSON-, CSV- en XLSX-import hebben omvang- en complexiteitsgrenzen.

## 6. Publicatiegrens

`scripts/build-static.mjs` kopieert uitsluitend:

- `index.html`;
- `_headers`;
- `assets/`;
- `css/`;
- `js/`;
- `layers/`.

`scripts/verify-dist.mjs` breekt de build af bij broncode, interne documenten, databasebestanden, back-ups, manifesten of ontbrekende lokale verwijzingen. `wrangler.toml` wijst uitsluitend naar `dist/`.
