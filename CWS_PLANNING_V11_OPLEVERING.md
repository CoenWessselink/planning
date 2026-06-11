# CWS Planning — V11 bootfix + Gantt/Capaciteit herstel

## Verwerkt

- Bootfout op Cloudflare opgelost: `Cannot set properties of undefined (setting 'role')`.
- Store-normalisatie gehard voor oude/handmatig aangemaakte D1-state zonder `ui`, `user`, `roles`, `tasks`, `ganttV2` of andere verplichte buckets.
- API/remote state wordt nu eerst volledig aangevuld met lokale defaults voordat rollen en UI-status worden gezet.
- Extra guard toegevoegd in `CWS.init()` zodat de applicatie niet meer kan crashen op ontbrekende `state.ui`.
- Headerbar CSS responsive gemaakt zodat titel, knoppen, opslagstatus en gebruiker niet meer over elkaar vallen bij smalle viewport of geopende DevTools.
- V10 Gantt/Capaciteit-koppeling behouden: Gantt herberekent `state.gantt.hoursByDay` en `state.gantt.sourcesByDay`; Capaciteit leest die bronnen voor geplande uren per project/afdeling/week.

## Controle

- `npm run lint:syntax` uitgevoerd en geslaagd.
- Extra Node boot-simulatie uitgevoerd met oude D1-state zonder `ui`; `CWS.init()` start nu correct.

## Na upload

1. Push deze map naar GitHub.
2. Wacht op Cloudflare Pages deployment.
3. Open `https://planning-cop.pages.dev` met hard refresh of incognito.
4. Klik eventueel eenmalig op `Demo data` om de Gantt/Capaciteit-demo volledig te vullen.
