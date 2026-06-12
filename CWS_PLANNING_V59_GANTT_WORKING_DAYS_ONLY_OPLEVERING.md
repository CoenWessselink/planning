# CWS Planning V59 — Gantt uitsluitend op werkbare dagen

## Doel
Taken en Gantt-balken mogen nooit meer op weekenden of niet-werkbare dagen liggen. Weekenden/niet-werkbare dagen blijven zichtbaar in kalender en diagram, maar planning, balksegmenten, urenverdeling en capaciteit slaan deze dagen over.

## Gebouwd
- Centrale werkdaglogica in Gantt:
  - weekend = nooit werkbaar;
  - niet-werkbare dagen uit Instellingen blijven leidend;
  - startdata snappen naar eerstvolgende werkbare dag;
  - duur telt werkbare dagen, geen kalenderdagen.
- Gantt-balken worden visueel als werkdagsegmenten getekend.
  - Balk loopt niet door over weekend/niet-werkbare dag.
  - Grijze kalenderdagen blijven zichtbaar tussen segmenten.
- Aanmaken/genereren/herberekenen gecorrigeerd:
  - nieuwe taken starten op werkbare dagen;
  - gegenereerde templateplanning gebruikt werkbare dagen;
  - afhankelijkheden schuiven naar eerstvolgende werkbare dag.
- Drag/resize gecorrigeerd:
  - verplaatsen snapt naar werkbare dag;
  - links/rechts resizen corrigeert start/einddatum;
  - opgeslagen balkdata blijft werkdag-proof.
- Bestaande planningen worden bij openen automatisch gecorrigeerd als taakdata op niet-werkbare dagen staan. De bestaande duur wordt daarbij als werkdagduur behouden waar mogelijk.
- Store/D1-save hardening:
  - `saveProjectGantt` normaliseert schedules vóór opslaan;
  - capaciteit blijft rekenen uit `gantt.hoursByDay` / `gantt.sourcesByDay`;
  - `sourcesByDay` wordt alleen opgebouwd uit werkbare dagen.
- Instellingen default werkweek staat nu op maandag t/m vrijdag werkbaar, zaterdag/zondag niet werkbaar.

## Tests
- `npm run lint:syntax`
- `npm run preflight:v28` t/m `npm run preflight:v59`
- `npm run test:e2e`

## Belangrijk
Projecturen per afdeling blijven SSOT volgens V58. V59 wijzigt de verdeling: uren worden uitsluitend over werkbare Gantt-dagen verdeeld. Weekenden en niet-werkbare dagen krijgen 0 uur en verschijnen niet in capaciteit als benodigde uren.
