# CWS Planning V23 — Gantt urenverdeling 100%

## Doel
Deze build maakt de urenverdeling in Gantt/Capaciteit hard en betrouwbaar:

Projecten → projecturen per afdeling → Gantt taken/fasen → automatische dagverdeling → Capaciteit.

## Verwerkt

- `state.gantt.hoursByDay` wordt opnieuw opgebouwd vanuit concrete Gantt-taken.
- `state.gantt.sourcesByDay` bevat nu per dag en afdeling de exacte bron:
  - projectId;
  - taskId / rowId;
  - taskName;
  - phaseId;
  - resourceId;
  - start/einde;
  - uren per dag;
  - totaal taakuren;
  - aantal werkbare dagen;
  - allocationMode.
- Elke taak kan eigen uren krijgen via:
  - Gantt-tabelkolom **Uren**;
  - taak-popup.
- `0` uur op taakniveau betekent: automatisch verdelen vanuit projecturen per afdeling.
- Als taakuren ingevuld zijn, gaan deze vóór projecturen.
- Als taakuren leeg/0 zijn, worden resterende projecturen per afdeling automatisch over de taken van die afdeling verdeeld.
- Verdeling gebeurt alleen over werkbare dagen tussen start/einde.
- Niet-werkbare dagen krijgen altijd 0 uur.
- Bij elke wijziging in Gantt via `saveProjectGantt()` wordt de urenverdeling automatisch herbouwd.
- Capaciteit WHY toont nu ook taaknaam, resource en verdelingswijze.

## Urenregel

1. Taak heeft eigen uren > 0: verdeel die taakuren over werkbare dagen van die taak.
2. Taak heeft 0 uur en project heeft afdelinguren: verdeel de resterende afdelinguren over alle taken zonder eigen uren.
3. Taken worden gewogen op aantal werkbare dagen.
4. Weekenden/niet-werkbare dagen worden overgeslagen.
5. Capaciteit leest uitsluitend `state.gantt.hoursByDay` en `state.gantt.sourcesByDay`.

## Controle

Uitgevoerd:

```text
npm run lint:syntax
```

Resultaat:

```text
Syntaxcontrole geslaagd.
```
