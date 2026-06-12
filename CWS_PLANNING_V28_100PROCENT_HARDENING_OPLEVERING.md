# CWS Planning V28 — 100% hardening op V27-audit

Deze build bouwt door op `CWS_PLANNING_CLOUDFLARE_D1_V27_PRINT_LOGO_CAPACITEIT_GANTT_HARDENING.zip` en herstelt de open punten uit het diepteonderzoek.

## Belangrijkste verbeteringen

- Centrale printhelper `UI.printA3()` toont nu bedrijfsnaam en bedrijfslogo rechtsboven in alle algemene printlayouts.
- Bedrijfsnaam gebruikt Instellingen → Bedrijf als SSOT; `company.name` is geen verouderde voorkeursbron meer.
- Logo-upload is veiliger gemaakt: PNG/JPG/JPEG toegestaan, SVG bewust geblokkeerd voor veilige opslag.
- Capaciteit A0 print heeft naast de schermmatrix een echte dagmatrix-printweergave met weekkoppen, dagen, geplande uren, beschikbare uren, saldo, projectregels, overbelasting en niet-werkbare dagen.
- Capaciteit 26 weken vooruit/terug gebruikt ISO-correcte weekberekening, inclusief jaren met week 53.
- Capaciteitsperiode wordt in `state.ui.capacity.period` opgeslagen en blijft tijdens de sessie/state consistent beschikbaar voor Preflight.
- Gantt heeft kolomvolgorde via drag/drop met opslag in localStorage.
- Gantt heeft rijvolgorde via drag/drop met opslag in het Gantt-model/D1-state.
- Gantt dropdowns voor afdeling/resource/kleur worden niet meer direct hard her-renderd bij selectie; render is kort gedebounced zodat dropdowns niet wegvallen.
- Acceptatietest-selectors zijn bijgewerkt naar de huidige Gantt-DOM: `#tableRows`, `.bar`, actuele herberekenknop en correcte `baseVersion` voor `/api/state`.
- Preflight is opgehoogd naar V28 en meldt aanvullende print/logo/Gantt-hardening-controles.
- Nieuwe statische V28-preflight: `npm run preflight:v28`.

## Uitgevoerde controles

- `npm ci` — geslaagd.
- `npm run lint:syntax` — geslaagd.
- `npm run preflight:v28` — geslaagd, 19/19 controles OK.
- `npm run test:e2e -- --reporter=line` — gestart, maar browser-run kon niet uitgevoerd worden omdat de Playwright Chromium binary ontbreekt.
- `npx playwright install chromium` — niet mogelijk in deze omgeving door DNS/netwerkfout `EAI_AGAIN cdn.playwright.dev`.

## Lokaal browser-testen

Voer lokaal uit:

```powershell
Set-Location "C:\Planning"
npm ci
npx playwright install chromium
npm run lint:syntax
npm run preflight:v28
npm run test:e2e -- --reporter=line
```

## Push

```powershell
Set-Location “C:\Planning”; git add -A; git commit -m “Harden print logo capacity and Gantt v28”; git push -u origin main
```
