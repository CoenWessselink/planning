# CWS Planning V14 — Gantt tabel, diagram en print herstel

## Doel
Deze versie herstelt de Gantt-weergave op basis van de laatste feedback:

- Tabelkolommen zijn aan/uit te zetten via de knop **Kolommen**.
- De tabelbreedte past zich automatisch aan op de zichtbare kolommen en de inhoud.
- Diagramteksten zijn groter en beter leesbaar.
- Summary-/fasebalken tonen tekst niet meer door de zwarte lijn heen.
- De huidige dag wordt als rode verticale lijn over de volledige tijdlijn weergegeven.
- Daglijnen en weeklijnen zijn duidelijker zichtbaar.
- Printknop gebruikt een speciale A3-liggend printmodus.
- Printbereik wordt automatisch gezet op 1 week vóór de eerste taak t/m 1 week na de laatste taak.
- Print toont alleen het diagram, passend op 1 pagina, met legenda onderin.

## Aangepaste bestanden

- `layers/laag4_gantt.html`

## Controle

Uitgevoerd:

```bash
npm run lint:syntax
```

Resultaat:

```text
Syntaxcontrole geslaagd.
```

## Gebruik

1. Open Gantt.
2. Klik **Kolommen** om tabelkolommen aan of uit te zetten.
3. Klik **Print A3** voor de speciale printweergave.
4. Kies in Chrome bij voorkeur:
   - Bestemming: Opslaan als PDF of printer
   - Papierformaat: A3
   - Liggend
   - Schaal: standaard of passend op pagina
   - Achtergrondafbeeldingen: aan indien kleuren niet zichtbaar zijn

