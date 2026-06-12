# CWS Planning V47 — Gantt print bestandsnaam, raster en uitlijning fine-tune

Gebouwd op V46.

## Doel
- Save-as-PDF naam zoveel mogelijk afdwingen via parent document title.
- Printdiagramlijnen lichter maken.
- Niet-werkbare dagen duidelijker lichtgrijs tonen.
- Tabel en diagram verder uitlijnen met vaste print-rijhoogte en headerhoogte.
- Printkolommen automatisch breder maken op basis van inhoud, zonder onnodig breed te worden.
- Afhankelijkheidslijnen beter laten landen vóór de taakbalk, met halo en duidelijke lijn.

## Aangepast
- `layers/laag4_gantt.html`
  - V47 CSS-overrides voor print.
  - `printA3()` zet nu ook `window.parent.document.title` op de gewenste bestandsnaam.
  - `renderPrintTaskTable()` berekent kolombreedtes ruimer en inhoudsafhankelijk.
  - `drawDeps()` gebruikt `dep-halo` en `dep-line` en landt net vóór de doelbalk.
- `scripts/v47-print-filename-alignment-preflight.mjs`
- `package.json`
- `scripts/e2e-fallback.mjs`

## Niet 100% afdwingbaar
Een native PDF-driver zoals Foxit kan de voorgestelde bestandsnaam alsnog negeren. De build zet nu de titel van de module én de parent shell langdurig op:

`Projectnaam - Projectnummer - Opdrachtgever - Datum`

Dat is technisch het maximale zonder server-side PDF-generatie.
