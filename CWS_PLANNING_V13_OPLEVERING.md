# CWS Planning V13 — Capaciteit vastlopen opgelost

## Doel
Deze versie herstelt Laag 5 Capaciteit. Het scherm mocht niet meer vastlopen of zichzelf blijven hertekenen.

## Aangepast

### Laag 5 Capaciteit
- Automatische Gantt-herberekening uit de render-loop gehaald.
- Render-guard toegevoegd tegen recursieve renders.
- Subscribe-render gedebounced via `requestAnimationFrame`.
- Foutafhandeling toegevoegd: als Capaciteit toch een fout tegenkomt, blijft het scherm bruikbaar en toont het een melding in plaats van vast te lopen.
- Matrixberekening versneld met een render-cache voor geplande uren per week, afdeling en project.
- WHY/details blijven gekoppeld aan dezelfde cache.
- Herbereken-knop blijft actief en voert de Gantt-urenherberekening alleen op verzoek uit.

### Store / Gantt-koppeling
- `CWS.gantt.recalculateHours()` is no-op gemaakt wanneer de Gantt-uren niet wijzigen.
- Hierdoor veroorzaakt Capaciteit geen oneindige notify/render-loop meer.
- `CWS.rebuildGanttHoursByDay()` gebruikt dezelfde veilige no-op logica.

## Controle
Uitgevoerd:

```text
npm run lint:syntax
```

Resultaat:

```text
Syntaxcontrole geslaagd.
```

Daarnaast is de store in Node met mocks gecontroleerd op veilige `CWS.init()` en herhaalde `CWS.gantt.recalculateHours()` zonder render-notify-loop.

## Na deploy
Gebruik bij problemen na deploy een harde refresh of incognito. Eventueel eerst `Data leegmaken` en daarna `Demo data`.
