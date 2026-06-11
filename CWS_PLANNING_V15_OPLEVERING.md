# CWS Planning V15 — Excel import projecten

## Toegevoegd

- Nieuwe knop **Import Excel** in de hoofdbalk.
- Extra knop **Import Excel** in **Projecten**.
- Browser-native `.xlsx` import zonder externe CDN of online library.
- Automatische herkenning van projectlijsten met kolommen zoals:
  - `Nummer`
  - `Projectomschr.` / `Projectomschrijving`
  - `Opdrachtgever`
  - `Tekenaar`
  - `Status`
  - `Actie`
  - `Volgorde`
  - `Detailberekeningen`
  - `Montage`
  - `Bedrag`
  - `Projectleider`
  - `Ter controle`
  - `Gereed`
  - `Planning`
- Sheetselectie na het kiezen van een Excelbestand.
- Preview van de eerste 25 importregels.
- Importlog in `settings.excelImports`.
- Herimport werkt idempotent: bestaande eerder geïmporteerde projectregels worden bijgewerkt in plaats van verdubbeld.
- Koppeling naar Projecten/Gantt:
  - projecten worden toegevoegd aan `state.projects`;
  - bronvelden blijven bewaard in `project.excel`;
  - standaard Engineering-taken worden toegevoegd zodat Gantt direct kan genereren;
  - datum uit weekvelden wordt omgerekend naar maandag van ISO-week.

## Getest tegen voorbeeldbestand

Getest op `Engineering planning.xlsx` met o.a. blad `Planning enginering` en kolommen `Nummer`, `Projectomschr.`, `Opdrachtgever`, `Tekenaar`, `Status`, `Actie`, `Montage`, `Planning`.

## Controle

Uitgevoerd:

```text
npm run lint:syntax
```

Resultaat:

```text
Syntaxcontrole geslaagd.
```

## Push

```powershell
Set-Location "C:\Planning"; git add -A; git commit -m "Add Excel project import v15"; git push -u origin main
```
