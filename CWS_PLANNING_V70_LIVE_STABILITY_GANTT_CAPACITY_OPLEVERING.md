# CWS Planning V70 — Live stability + Gantt/Capaciteit hardening

## Doel
V70 maakt de V68/V69 foundation productiegerichter: live readiness, D1-hydratatie zonder onterechte conflictstatus, centrale diagnose en extra bescherming rond save/snapshot.

## Aangepast
- Health-versie naar `internal-test-v70`.
- Lokale testserver naar `local-test-v70`.
- Nieuwe runtime marker: `v70-live-stability-gantt-capacity-hardening`.
- `buildLiveReadinessReport()` toegevoegd aan `CWS.recovery`.
- Live readiness rapporteert projecten, Gantt-rijen, lange taken, orphan Gantt-projecten, uurdagen, bronregels en uren op niet-werkbare dagen.
- Succesvolle remote saves markeren nu expliciet `lastSuccessfulRemoteVersion` en maken een last-good snapshot.
- Legacy D1 validatiewaarschuwingen zetten de app niet meer onnodig in `unsynced/conflict` wanneer D1 aantoonbaar businessdata bevat.
- Import/Export heeft een knop voor `Live readiness rapport`.
- Nieuwe preflight: `preflight:v70`.

## Checks
- `npm run lint:syntax`
- `npm run preflight:v28` t/m `npm run preflight:v70`
- `npm run test:e2e`
