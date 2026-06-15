# CWS Planning V74 — Gantt drag/resize freeze fix

## Doel
Deze build pakt specifiek het probleem aan dat de Gantt bij het verslepen of verbreden/verkleinen van taakbalken vastloopt of niet zichtbaar meebeweegt.

## Root cause
De laatste versie had functioneel al veel stabilisatie, maar de interactieve Gantt-drag/resize bleef te zwaar tijdens pointer-events:

1. Tijdens `pointermove` werd opnieuw het Gantt-model opgehaald via `getModel(...)`. Die route maakt een deep clone van het projectmodel. Bij grote planningen maakt dat de muisbeweging traag en kan de browser vast lijken te lopen.
2. De resize-preview gebruikte indirect nog de oude `row.duration` als voorkeursduur. Daardoor leek verbreden/verkleinen visueel niet mee te bewegen totdat de save klaar was.
3. Op `pointerup` werd de volledige zware opslagroute direct uitgevoerd, inclusief state-validatie, capaciteit-herbouw, localStorage snapshot, last-good snapshot en eventueel remote save. Dat kan de UI blokkeren op precies het moment dat de gebruiker de muis loslaat.
4. Er was nog een dubbele render-route: state-notify rendert al opnieuw, terwijl de pointer-finish daarna nogmaals renderde.
5. De headless Chrome-test faalde in root/containeromgevingen doordat Chromium zonder `--no-sandbox` werd gestart.

## Aangepast

### `layers/laag4_gantt.html`
- Pointermove gebruikt geen `getModel(drag.projectId)` meer.
- Bij pointerdown wordt een immutable/lightweight snapshot opgeslagen:
  - `projectId`
  - `rowId`
  - `originalStart`
  - `originalEnd`
  - `originalDuration`
  - `rowSnapshot`
  - `rangeSnapshot`
  - `previewBar`
- Drag/resize-preview wordt via `requestAnimationFrame` bijgewerkt.
- Herhaalde pointermoves met dezelfde dag-delta worden genegeerd.
- Nieuwe `dragPreviewGeometry(...)` gebruikt direct het tijdelijke schedule-schema.
- `rowWorkdayDuration(...)` kijkt nu eerst naar `sc.workdays`, zodat resize visueel direct meebeweegt.
- Pointer capture release is defensiever gemaakt.
- Blur/pointercancel ruimt actieve drag-state op.
- Na succesvolle save wordt niet nogmaals geforceerd gerenderd; de store-notify doet dat al.
- Drag-save krijgt metadata:
  - `deferPersistence:true`
  - `v74DragResizeFreezeFix:true`
- Visuele feedback toegevoegd via `.gantt-dragging` en `.drag-preview`.

### `js/core/store.js`
- Nieuwe marker: `v74-gantt-drag-resize-freeze-fix`.
- Nieuwe `scheduleDeferredPersistence(...)`.
- Mutaties met `deferPersistence:true` worden direct in runtime-state verwerkt, maar zware localStorage/last-good/D1-save wordt kort uitgesteld en samengevoegd.
- Hierdoor blijft de UI na pointerup responsief en worden meerdere snelle drag-acties niet telkens volledig synchroon weggeschreven.
- Metadata:
  - `meta.v74GanttDragResizeFreezeFix = true`
  - `meta.v74Marker = "v74-gantt-drag-resize-freeze-fix"`

### `scripts/headless-v72-smoke.mjs`
- Chromium start nu met `--no-sandbox` zodat root/containeromgevingen minder snel timeouts geven.

### `tests/responsive/v73-responsive-smoke.mjs`
- Chromium start nu met `--no-sandbox`.

### `scripts/v74-gantt-drag-resize-freeze-preflight.mjs`
Nieuwe preflight toegevoegd die controleert op:
- V74-marker in store;
- deferred persistence;
- geen model deep-clone meer in pointermove;
- `requestAnimationFrame` voor drag-preview;
- tijdelijke schedule/workdays voor resize-preview;
- pointer capture cleanup;
- drag CSS feedback;
- Chrome `--no-sandbox` in headless tests.

### `package.json`
Toegevoegd:

```json
"preflight:v74": "node scripts/v74-gantt-drag-resize-freeze-preflight.mjs"
```

## Uitgevoerde checks
Groen uitgevoerd:

```bash
npm run lint:syntax
npm run preflight:v72
npm run preflight:v74
npm run preflight:all
npm run build
node scripts/e2e-fallback.mjs
```

`preflight:all` draait nu v28 t/m v74 en is groen.

## Beperking testomgeving
De volledige headless Chrome-suite in deze sandbox is beperkt betrouwbaar door Chromium/runtime-timeouts in de container. Daarom is de structurele fix statisch en met preflight geborgd. De echte acceptatie blijft: live in de browser een lange taakbalk in Gantt verslepen en rechts/links resizen.

## Live controlepunten
Na deploy controleren:

1. Open Gantt op een project met brede/lange balken.
2. Sleep een taakbalk enkele dagen naar rechts.
3. Controleer dat de balk direct meebeweegt en de browser niet vastloopt.
4. Laat los en controleer dat start/einddatum wijzigt.
5. Resize rechterkant van een taakbalk.
6. Controleer dat de breedte direct meebeweegt.
7. Controleer dat de foutmelding over dubbele taak-id niet terugkomt.
8. Controleer dat Capaciteit na enkele seconden correct bijgewerkt blijft.
9. Controleer dat D1/save-status niet in een eindeloze save-loop komt.

## Rollback
Als live toch een probleem optreedt, rollback naar de vorige commit/ZIP en test opnieuw met één project in fixturemodus.
