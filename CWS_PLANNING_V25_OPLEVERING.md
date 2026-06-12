# CWS Planning V25 — Gantt taakbalk tekstinstellingen

## Verwerkt

- Nieuwe knop **Tekst balken** in Gantt.
- Instelbare tekstposities rond taakbalken:
  - vóór de taakbalk;
  - in de taakbalk;
  - achter de taakbalk.
- Per positie kunnen meerdere velden gekozen worden.
- Tekst vóór en achter de taakbalk is zwart.
- Tekst in de taakbalk is wit.
- Lange teksten worden afgekapt met ellipsis.
- Instellingen worden opgeslagen in localStorage.
- Werkt op scherm en in A3-printmodus.

## Standaardinstelling

- Voor taakbalk: leeg
- In taakbalk: Taaknaam
- Achter taakbalk: Resource + Aantal dagen

## Controle

- Syntaxcontrole uitgevoerd met `npm run lint:syntax`.
