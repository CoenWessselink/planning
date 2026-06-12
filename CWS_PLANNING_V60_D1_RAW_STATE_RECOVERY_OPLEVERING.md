# CWS Planning V60 — D1 raw-state recovery

## Doel
V60 voorkomt dat de Cloudflare Worker opnieuw op 1102/503 loopt tijdens het laden van de volledige planningstate.

## Aangepast
- `/api/health` versie naar `internal-test-v60`, nog steeds ultralicht.
- `/api/state?payload=raw-state` retourneert de opgeslagen `state_json` direct als response-body.
- Metadata gaat via headers (`X-CWS-Version`, `X-CWS-State-Exists`, gebruiker, bytes).
- Browser parseert de grote state zelf; de Worker hoeft geen grote JSON-wrapper meer te stringifien.
- Lokale backup-key toegevoegd om te voorkomen dat een lege fallback oude browserdata overschrijft.
- Remote state wordt na succesvol laden direct lokaal geback-upt.
- Empty D1 wordt niet meer zomaar gevuld met een lege default als er lokaal betekenisvolle planningdata bestaat.

## Verwacht resultaat
- Geen `State laden mislukt (503)` meer door JSON-wrapper-overbelasting.
- Projecten/Gantt-data komt weer uit D1 zodra D1 bereikbaar is.
- Bij tijdelijke D1-fout blijft laatst bekende lokale snapshot beschikbaar.
