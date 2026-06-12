# CWS Planning V64 — Gantt werkdagsegmenten met stabiele drag-shell

## Doel
De V59-werkdagenlogica blijft gelden: taakbalken mogen niet zichtbaar door weekend- of niet-werkbare dagen lopen. V64 herstelt de normale Gantt-bediening door per taak één stabiele, dragbare shell te renderen met daarbinnen alleen zichtbare segmenten op werkbare dagen.

## Aangepast
- Eén `.bar.bar-workday-shell` per taak voor klik, dubbelklik, contextmenu, drag en resize.
- Zichtbare `.bar-work-segment`-delen worden alleen op werkbare dagen getekend.
- Weekenden/niet-werkbare dagen blijven zichtbaar als grijze kalenderkolommen zonder gekleurde balkdelen.
- Drag/resize blijft gebonden aan één taakobject in plaats van losse segmenten.
- Summary/fasebalken blijven als fase-overzichtslijn leesbaar.
- V58 projecturen-SSOT, V59 werkdagen-only en V63 D1 recovery blijven behouden.

## Checks
- `npm run lint:syntax`
- `npm run preflight:v28` t/m `npm run preflight:v64`
- `npm run test:e2e`
