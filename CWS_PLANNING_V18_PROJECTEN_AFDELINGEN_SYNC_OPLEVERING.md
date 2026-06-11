# CWS Planning v18 — Projecten afdelingen-sync fix

## Opgelost

- Projecten toont nu alle afdelingen als dynamische urenkolommen.
- `Instellingen → Afdelingen` is nu de hoofdbron via `settings.tables.departments`.
- Legacy bron `settings.tables.afdelingen`, `departments`, resources, projecturen, Gantt-uren en taakfasen worden samengevoegd.
- Nieuwe afdeling wordt automatisch zichtbaar als nieuwe projectkolom.
- Project wijzigen-popup toont nu dezelfde afdelingen als de projectentabel.
- Centrale store normaliseert afdelingen, zodat Gantt, Capaciteit en Projecten dezelfde afdelingenlijst gebruiken.
- Excel-import schrijft nieuwe afdelingen ook naar de centrale afdelingenstructuur.
- Kolommen-popup van Projecten bevat nu ook Uren benodigd en alle dynamische afdelingskolommen.
- Nieuwe kolommen worden toegevoegd aan bestaande kolominstellingen zonder oude keuzes te verliezen.
- Export CSV van Projecten bevat nu alle afdelingsurenkolommen.

## Controle

- `npm run lint:syntax` uitgevoerd.
- Resultaat: syntaxcontrole geslaagd.
