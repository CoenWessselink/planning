import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../layers/laag4_gantt.html", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

function assert(condition, message){
  if(!condition){
    console.error(`[v83] FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`[v83] OK: ${message}`);
}

assert(pkg.scripts?.["preflight:v83"] === "node scripts/v83-gantt-edit-type-selector-preflight.mjs", "package.json bevat preflight:v83");
assert(html.includes('select id="mType"'), "Gantt edit popup heeft een echte Type select");
assert(html.includes('<option value="summary"'), "Type select bevat Fase / samenvatting optie");
assert(html.includes('<option value="task"'), "Type select bevat Taak optie");
assert(html.includes('function syncTypeControls()'), "Type wijziging synchroniseert datum/duur/uren controls");
assert(html.includes('row.type=nextType'), "Opslaan schrijft gekozen type terug naar row.type");
assert(html.includes('row.predecessor=nextType==="summary" ? ""'), "Fase/samenvatting wist taakvoorgangers veilig");
assert(html.includes('if(nextType!=="summary")'), "Planning wordt alleen voor taaktype aangepast");
assert(!html.includes('Type<input value="${row.type==="summary"?"Fase / samenvatting":"Taak"}" disabled>'), "Oude disabled Type input is verwijderd");

console.log("[v83] Gantt type selector preflight geslaagd.");
