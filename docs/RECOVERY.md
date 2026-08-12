# Herstelprocedure

## 1. Eerst classificeren

Bepaal of het probleem één van deze categorieën is:

- **clientconflict:** een gebruiker heeft een verouderde basisversie en krijgt HTTP 409;
- **tijdelijke bereikbaarheid:** D1 of Access is tijdelijk niet bereikbaar;
- **ongeldige actieve state:** API of clientvalidatie wijst de state af;
- **corrupte chunkset:** checksum of chunkmanifest klopt niet;
- **ongewenste gebruikersactie:** import, demo-reset of leegmaakactie moet worden teruggedraaid;
- **schemafout:** migraties ontbreken of zijn niet volledig toegepast.

Stop bij vermoedelijke datacorruptie eerst nieuwe writes.

## 2. Normaal versieconflict

1. Bewaar eventueel de lokale wijziging buiten de applicatie.
2. Kies in de conflictmelding voor de serverversie of herlaad de pagina.
3. Controleer de actuele planning.
4. Pas de wijziging opnieuw toe.

Forceer geen versienummer en wijzig D1-tabellen niet handmatig. De 409 voorkomt juist stil gegevensverlies.

## 3. Tijdelijke storing

De browser bewaart een lokale herstelkopie en markeert wijzigingen als niet gesynchroniseerd. Herstel eerst Access/D1 en gebruik daarna de ingebouwde retry of herlaad de actuele serverstate.

Upload lokale browserdata nooit automatisch naar een lege of afwijkende productieomgeving. Controleer tenant, project, D1-id en versie vóór een expliciete restore.

## 4. Corrupte chunks

De server controleert chunkcount en SHA-256-checksum. Wanneer de actieve commit corrupt is, probeert de readroute de laatste geldige recente commit te lezen zonder de database tijdens de GET te wijzigen.

Daarna:

1. controleer welke versie is teruggelezen;
2. maak een beheerd D1-herstelpunt;
3. controleer de laatste geldige commit en auditregels;
4. schrijf uitsluitend via de normale state-API een expliciet bevestigde herstelstate;
5. controleer checksum, projectaantal en Gantt-regels na reload.

Verwijder geen losse chunks zolang de bijbehorende commits nog nodig kunnen zijn voor herstel.

## 5. Herstel na import of reset

De client maakt vóór grote beheeracties een lokale recovery snapshot. Daarnaast horen productiewijzigingen vooraf te worden afgedekt met een beheerd D1-herstelpunt of gecontroleerde export.

Herstelvolgorde:

1. bepaal het exacte tijdstip en de actor via `audit_log`;
2. exporteer de huidige afwijkende toestand voor onderzoek;
3. selecteer de laatste bekende goede snapshot of D1-versie;
4. gebruik de admin-import/restoreflow met expliciete bevestiging;
5. controleer projectaantal, projecturen, Gantt-rijen, capaciteit en revisies;
6. laat een tweede beheerder de herstelde planning beoordelen.

## 6. Schemaherstel

Bij `D1_MIGRATION_REQUIRED`:

```bash
npm run db:migrate:remote
```

Voer dit pas uit nadat de database-id en omgeving zijn gecontroleerd en een herstelpunt is gemaakt. Gewone API-requests mogen geen tabellen maken, hernoemen of verwijderen.

## 7. Acceptatie na herstel

- `/api/health`: `schemaOk: true`;
- shell: `mode = api`, `stateSource = remote-d1`;
- stateversie is niet lager dan de gekozen herstelversie;
- project `order` en `byId` zijn consistent;
- geen verweesde Gantt-projecten of voorgangers;
- geen uren op niet-werkbare dagen;
- revisies en auditregels zijn leesbaar;
- testsave en reload slagen;
- gelijktijdige stale save resulteert in HTTP 409;
- viewer kan niet schrijven;
- laatste actieve admin blijft beschermd.
