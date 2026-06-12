# CWS Planning V35 — Best effort demo/UI fallback

Doel: V33/V34 testblokkades verder verminderen zonder opnieuw te bouwen.

## Aangepast
- Demo data knop zet expliciete V35 demo-request flag.
- Data leegmaken verwijdert de demo-request flag.
- Alle laagmodules kunnen bij lege state en actieve demo-request automatisch lokaal demo-data laden.
- Projecten/Gantt/Capaciteit/Instellingen zijn hierdoor robuuster bij `file://` en iframe testmodus.
- Nieuwe statische preflight toegevoegd: `npm run preflight:v35`.

## Getest
- npm ci
- npm run lint:syntax
- npm run preflight:v28 t/m v35
- npm run test:e2e fallback

## Niet volledig bewezen
- Echte Playwright/Chromium-test vereist lokale Playwright installatie.
