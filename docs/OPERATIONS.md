# Beheer en releaseproces

## Dagelijks beheer

- Voeg gebruikers uitsluitend via een actieve admin toe.
- Geef alleen planners of admins schrijfrechten.
- Controleer auditregels bij imports, resets, conflicten en gebruikerswijzigingen.
- Gebruik een export of beheerd D1-herstelpunt vóór omvangrijke imports.
- Behandel een 409 als normaal conflictmechanisme: herlaad de nieuwste state en pas de wijziging opnieuw toe.

## Gebruikersbeheer

| Rol | Hoofdrechten |
|---|---|
| `admin` | Planning wijzigen, gebruikers beheren, destructieve imports/resets en onderhoud |
| `planner` | Planning lezen en wijzigen; geen gebruikersbeheer of destructief beheer |
| `viewer` | Alleen-lezen |

De laatste actieve admin is dubbel beschermd: in de API en door D1-triggers.

## D1-onderhoud

`/api/d1-cleanup` is:

- alleen via `POST` beschikbaar;
- alleen voor een actieve admin;
- beschermd met same-origincontrole;
- beschermd met `CWS_MAINTENANCE_TOKEN`;
- bedoeld voor expliciet, gecontroleerd onderhoud.

Plaats het onderhoudstoken nooit in een URL, log of bronbestand.

## Releasechecklist

1. Werk vanaf een schone bronkopie.
2. Controleer `git status` en verwijder lokale databases, logs en exports.
3. Voer `npm ci` uit.
4. Voer `npm run test:e2e:install` uit op een nieuwe buildagent.
5. Voer `npm run verify` uit.
6. Controleer `dist/` met `npm run build` en `npm run lint:security`.
7. Controleer Cloudflare projectnaam, D1-id, Access audience en bootstrap-admin.
8. Maak een D1-herstelpunt.
9. Pas migraties toe.
10. Deploy met Wrangler vanuit de projectroot.
11. Voer de productiesmoke uit.
12. Bewaar releasehash, testresultaat en deployment-id in het interne wijzigingsregister, niet in de webroot.

## Logging en privacy

- API-fouten boven HTTP 500 worden server-side gelogd, maar technische stackdetails worden niet naar de browser gestuurd.
- Auditactor en tijd worden door de server bepaald.
- Auditmetadata en importpayloads zijn begrensd.
- Exporteer productiedata niet naar deze bronmap.
- D1-back-ups, SQL-dumps en persoonsgegevens horen in een afgeschermde beheerlocatie met passende bewaartermijn.

## Periodieke controle

Voer minimaal bij iedere release en na wijzigingen in Access, D1 of rollen uit:

```bash
npm run verify
```

Controleer daarnaast in productie:

- geldigheid van Access issuer en audience;
- aanwezigheid van minimaal twee actieve admins;
- D1-opslaggroei en recente commits;
- terugkerende 409-conflicten of mislukte imports;
- onverwachte 401/403/500-responsen;
- securityheaders op HTML én API-responses.
