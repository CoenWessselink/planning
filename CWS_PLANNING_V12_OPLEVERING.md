# CWS Planning V12 — Gantt tekst/kolom-overlap herstel

## Aangepast

- Laag 4 Gantt CSS gecorrigeerd zodat de linker tabel en rechter tijdlijn niet meer over elkaar heen tekenen.
- Linker Gantt-tabel vastgezet op één harde breedte met 11 vaste kolommen.
- `table-layout: fixed` toegevoegd voor stabiele kolombreedtes.
- Tabelcellen, inputs en selects krijgen ellipsis/clipping in plaats van visueel doorlopen in de tijdlijn.
- Tijdlijn start nu pas ná de kolom `Lock`.
- Gantt-balkteksten blijven binnen de balk en worden afgekapt met ellipsis.
- Dependency-lijnen liggen visueel achter de taakbalken.
- Scrollgedrag gestabiliseerd met vaste board/grid-indeling.

## Oorzaak

In V11 was de Gantt-linkertabel breder dan de gridkolom (`--leftW: 760px`). Daardoor liep de inhoud van de tabel visueel door in de chart/tijdlijn en verschenen teksten, dropdowns en taakbalken door elkaar.

## Controle

Uitgevoerd:

```text
npm run lint:syntax
```

Resultaat:

```text
Syntaxcontrole geslaagd.
```

## Upload/push

Pak deze ZIP uit naar `C:\Planning` en push daarna:

```powershell
Set-Location "C:\Planning"; git add -A; git commit -m "Fix Gantt text overlap and column alignment v12"; git push -u origin main
```
