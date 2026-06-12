# CWS Planning V26 — Planning revisiebeheer

## Toegevoegd

- Nieuwe knop **Planning opslaan als revisie** in Laag 4 — Gantt Planning.
- Nieuwe knop **Revisies** voor overzicht van opgeslagen revisies.
- Revisiegegevens:
  - revisienummer / revisienaam;
  - revisiedatum;
  - status;
  - omschrijving;
  - opmerking / reden wijziging;
  - opslagmoment.
- Elke revisie is een vaste snapshot van de live planning op dat moment.
- Revisies veranderen niet mee wanneer de live planning daarna wordt aangepast.
- Revisies worden opgeslagen binnen het projectmodel en gaan dus mee in Cloudflare D1 state-opslag.

## Snapshot bevat

- Gantt-rijen en volgorde;
- planning start/eind per taak;
- fasen/taken;
- resources;
- afdelingen;
- uren;
- kleuren;
- voorgangers;
- locks;
- voortgang;
- WHY/notities;
- zichtbare kolommen;
- taakbalktekst-instellingen;
- relevante UI-instellingen;
- huidige capaciteitssnapshot: hoursByDay en sourcesByDay.

## Revisie-overzicht

In het revisie-overzicht zijn acties beschikbaar:

- **Bekijken**: opent de revisie alleen-lezen.
- **Print**: print de revisie in A3-weergave.
- **Zet live**: zet een kopie van de revisie terug als actuele werkplanning.
- **Verwijder**: verwijdert de revisie.

## Print

Wanneer een revisie wordt bekeken of geprint, toont de metadata:

- revisienummer;
- revisiedatum;
- status;
- omschrijving.

## Controle

Uitgevoerd:

```text
npm run lint:syntax
```

Resultaat:

```text
Syntaxcontrole geslaagd.
```
