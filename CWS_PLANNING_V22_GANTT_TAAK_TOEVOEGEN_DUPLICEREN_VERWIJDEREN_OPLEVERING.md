# CWS Planning v22 — Gantt taak toevoegen, dupliceren en verwijderen

## Verwerkt

- Knop **Taak toevoegen** toegevoegd in Laag 4 Gantt.
- Nieuwe taak wordt onder de geselecteerde fase of na de geselecteerde taak toegevoegd.
- Nieuwe taak krijgt automatisch start/einddatum, afdeling, kleur en voorganger waar mogelijk.
- Na toevoegen opent direct de taak-popup zodat alles direct instelbaar is.
- Per Gantt-rij is een kolom **Acties** toegevoegd.
- Per rij staan twee kleine knoppen:
  - **⧉** = dupliceren
  - **×** = verwijderen
- Dupliceren werkt voor losse taken en voor fase/samenvattingsrijen inclusief onderliggende taken.
- Verwijderen werkt voor losse taken en voor fase/samenvattingsrijen inclusief onderliggende taken.
- Bij verwijderen worden voorgangers die naar verwijderde taken verwijzen automatisch opgeschoond.
- Dubbelklik op taakbalk in het diagram is extra robuust gemaakt via chart-level eventdelegation.
- De kolom **Acties** staat standaard aan en is ook via **Kolommen** aan/uit te zetten.

## Controle

- `npm run lint:syntax` uitgevoerd.
- Resultaat: syntaxcontrole geslaagd.
