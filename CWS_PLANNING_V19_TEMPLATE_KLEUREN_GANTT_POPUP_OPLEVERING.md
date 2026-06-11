# CWS Planning V19 — Template-fasen, kleuren en Gantt-taakpopup

## Verwerkt

- `Genereer fasen` in Laag 4 gebruikt nu de ingestelde standaardtemplate uit `templates.taskSets`.
- De actieve template wordt vastgelegd als `templates.activeTaskSetId` en kan via `Instellingen → Fasen & taken → Toepassen op projecten` aan bestaande projecten gekoppeld worden.
- Kleurvelden in `Instellingen → Fasen & taken` zijn vervangen door echte kleurdropdowns met kleurvlak.
- Kleuren worden centraal genormaliseerd op sleutels `c1` t/m `c8` en blijven consistent tussen template, Gantt-tabel, Gantt-diagram, legenda en taakpopup.
- Gantt-kleurdropdown in de tabel slaat nu stabiel op en springt niet meer terug.
- Dubbelklik op een taakbalk in het Gantt-diagram opent nu dezelfde taakinstellingen-popup.
- Taakpopup uitgebreid met: naam, type, afdeling, resource, start, einde, duur, voortgang, voorganger, kleur, uren, lock en WHY/notitie.
- Template-kleuren worden doorgezet naar de gegenereerde Gantt-balken.

## Controle

- `npm run lint:syntax` uitgevoerd.
- Resultaat: syntaxcontrole geslaagd.

## Deploy

Pak de ZIP uit naar `C:\Planning` en push daarna:

```powershell
Set-Location "C:\Planning"; git add -A; git commit -m "Fix Gantt template generation colors and task popup v19"; git push -u origin main
```
