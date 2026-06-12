# CWS Planning V36 — Drag, logo en print hardening

Deze build is gebaseerd op V35 en richt zich op de resterende testpunten:

- Instellingen → Bedrijf snelknop heeft nu een expliciete eventbinding naar de bedrijfsmodal.
- Instellingen → Logo uploaden heeft nu een expliciete eventbinding naar de logomodal.
- Logo-upload blokkeert SVG nu op MIME-type én bestandsextensie.
- Logo-upload controleert dat de gelezen data-url PNG/JPG/JPEG is voordat opslag plaatsvindt.
- Fallback E2E is uitgebreid met regressiechecks voor Bedrijf/logo, drag/drop en printlogo.
- Nieuwe preflight toegevoegd: `npm run preflight:v36`.

Niet meegeleverd: `node_modules`, build-output of Playwright browser-binaries.
