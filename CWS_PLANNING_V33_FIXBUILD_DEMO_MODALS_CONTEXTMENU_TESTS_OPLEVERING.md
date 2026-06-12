# CWS Planning V33 – Fixbuild demo, modals, contextmenu en testbaarheid

Deze build herstelt de functionele testblokkers uit V32:

- Demo data laadt projecten, Gantt V2-taken, instellingen en capaciteit direct testbaar.
- Projecten rendert opnieuw na statewijziging en Nieuw project is direct callable.
- Gantt rechtermuisknop op lege ruimte wordt documentbreed afgevangen.
- Instellingen heeft snelle knoppen Bedrijf en Logo uploaden.
- npm ci is offline robuuster gemaakt door externe devDependencies uit deze interne ZIP te halen.
- test:e2e heeft een fallback zonder Playwright-download.
- Nieuwe preflight: npm run preflight:v33.
