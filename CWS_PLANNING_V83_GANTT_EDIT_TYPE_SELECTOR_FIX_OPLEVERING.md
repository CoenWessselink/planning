# CWS Planning V83 — Gantt edit type selector fix

## Doel
Het veld **Type** in de Gantt taak/fase-popup was niet kiesbaar. Het stond als disabled input in de popup, waardoor een gebruiker een fase/samenvatting niet kon omzetten naar een taak of andersom.

## Opgelost
- Het Type-veld is vervangen door een echte select met:
  - Fase / samenvatting
  - Taak
- Bij wijziging van Type worden datum-, duur-, voorganger- en urenvelden direct logisch aan/uit gezet.
- Bij opslaan wordt `row.type` daadwerkelijk bijgewerkt.
- Als een regel naar **Fase / samenvatting** wordt gezet:
  - voorgangers worden veilig leeggezet;
  - handmatige uren worden niet als taakplanning opgeslagen;
  - mijlpaal-status wordt uitgeschakeld.
- Als een regel naar **Taak** wordt gezet:
  - start/einde/duur worden weer planbaar;
  - bestaande Gantt schedule wordt behouden of genormaliseerd op werkbare dagen.

## Aangepaste bestanden
- `layers/laag4_gantt.html`
- `package.json`
- `scripts/v83-gantt-edit-type-selector-preflight.mjs`

## Checks
- `npm run lint:syntax`
- `npm run preflight:v83`
- `npm run build`

## Live controle
1. Open Gantt.
2. Dubbelklik op een fase/samenvatting.
3. Controleer dat **Type** kiesbaar is.
4. Kies `Taak`, controleer dat start/einde/duur/voorgangers actief worden.
5. Sla op, refresh pagina, controleer dat type behouden blijft.
6. Herhaal van taak naar `Fase / samenvatting`.
