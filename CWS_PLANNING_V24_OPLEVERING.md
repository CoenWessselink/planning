# CWS Planning V24 — Capaciteit automatisch herberekenen

## Doel
Capaciteit mag niet meer afhankelijk zijn van een handmatige knop. Iedere wijziging in projecten, Gantt, taakuren, datums, afdelingen, resources, templates, import of undo/redo moet automatisch de Gantt-urenverdeling en daarmee Capaciteit bijwerken.

## Aangepast

- De handmatige knop **Herbereken uren** is verwijderd uit Gantt.
- De handmatige knop **Herbereken** is verwijderd uit Capaciteit.
- `CWS.setState(...)` herbouwt nu altijd automatisch de afgeleide Gantt-urenverdeling vóór opslaan/notificeren.
- `CWS.mutate(...)` herbouwt nu altijd automatisch de afgeleide Gantt-urenverdeling vóór opslaan/notificeren.
- `undo()` en `redo()` herstellen niet alleen de oude staat, maar herberekenen daarna ook automatisch de afgeleide uren.
- `CWS.init()` herberekent bij het laden van bestaande lokale of D1-state automatisch de afgeleide uren, zodat oudere testdata direct wordt gerepareerd.
- `resetDemo()` herberekent automatisch na het laden van demo-data.
- De afgeleide capaciteit blijft SSOT-lezen uit:
  - `state.gantt.hoursByDay`
  - `state.gantt.sourcesByDay`
- De herberekening wijzigt `recalculatedAt` alleen wanneer de echte afgeleide uren/sources veranderd zijn. Daardoor ontstaan geen onnodige renderloops.
- Capaciteitstekst aangepast: geen instructie meer om handmatig te herberekenen.

## Controle

Uitgevoerd:

```bash
npm run lint:syntax
```

Resultaat:

```text
Syntaxcontrole geslaagd.
```
