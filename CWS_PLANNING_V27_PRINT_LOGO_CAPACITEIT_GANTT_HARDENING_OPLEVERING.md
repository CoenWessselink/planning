# CWS Planning V27 — Print, logo, capaciteit en Gantt hardening

## Build
`CWS_PLANNING_CLOUDFLARE_D1_V27_PRINT_LOGO_CAPACITEIT_GANTT_HARDENING.zip`

## Aangepast

### Capaciteit
- Nieuwe knop **Afdrukken A0**.
- Printmodus voor **A0 liggend** met eigen printheader, bedrijfsnaam, logo, printdatum, periode, actieve filters, totalen en legenda.
- Matrixprint schaalt naar volledige breedte en gebruikt vaste tabel-layout zodat kolommen niet afgesneden worden.
- Nieuwe knoppen **26 weken terug**, **26 weken vooruit** en **Vandaag**.
- Capaciteitsperiode blijft binnen de sessie bewaard via `sessionStorage`.
- Capaciteit blijft uitsluitend lezen uit `state.gantt.hoursByDay` en `state.gantt.sourcesByDay`.

### Instellingen → Bedrijf
- Extra actieknop **Logo uploaden** bij Bedrijf.
- Ondersteuning voor PNG, JPG, JPEG en SVG.
- JPG/PNG worden client-side teruggeschaald naar maximaal circa 900×300 px.
- Groottevalidatie toegevoegd om extreem grote logo’s te blokkeren.
- Preview en verwijderen van logo toegevoegd.
- Logo wordt opgeslagen in centrale app-state en daarmee via D1 bewaard.

### Centrale state / D1
- `state.company.name` en `state.company.logo` toegevoegd en genormaliseerd.
- `state.print.gantt` en `state.print.capacity` toegevoegd voor preflight en toekomstige printlayouts.
- Helpers toegevoegd: `CWS.getCompanyLogo()` en `CWS.getCompanyName()`.

### Gantt A3 print
- Professionele printheader toegevoegd met bedrijfslogo rechtsboven.
- Header toont titel, bedrijfsnaam, project, revisie/live-status, revisiedatum/status indien revisie, printdatum en printbereik.
- Bestaande V26 revisieprint gebruikt dezelfde Gantt-printfunctie en krijgt daardoor ook de header/logo.
- Printbereik blijft 1 week vóór eerste taak en 1 week na laatste taak.
- Linker printtabel met Taaknaam / Resource / Dagen blijft zichtbaar.

### Preflight
- Preflight uitgebreid met:
  - aantal projecten;
  - aantal Gantt-taken;
  - aantal taken met kleur;
  - aantal dagen met `hoursByDay`;
  - aantal bronnen in `sourcesByDay`;
  - aantal revisies;
  - logo aanwezig ja/nee;
  - capaciteitsperiode;
  - printconfig Gantt;
  - printconfig Capaciteit.

## Controles uitgevoerd
- `npm run lint:syntax` uitgevoerd: geslaagd.

## Niet uitgevoerd
- Echte browser-/Playwright-test is niet uitgevoerd in deze sandbox, omdat `node_modules` niet aanwezig is en er geen geïnstalleerde Playwright runtime in deze uitgepakte ZIP staat.

## Push-commando
```powershell
Set-Location “C:\Planning”; git add -A; git commit -m “Add logo A0 capacity print and improve Gantt print v27”; git push -u origin main
```
