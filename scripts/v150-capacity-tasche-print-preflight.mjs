import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const mod = read("js/core/capacity_print_tasche_a3.js");
const index = read("index.html");
const cap = read("layers/laag5_capaciteit.html");
const pkg = JSON.parse(read("package.json"));

const checks = [];
const add = (name, pass) => checks.push([name, !!pass]);

add("Nieuwe printmodule bestaat", fs.existsSync("js/core/capacity_print_tasche_a3.js"));
add("Index laadt capaciteit-printmodule", index.includes("js/core/capacity_print_tasche_a3.js"));
add("Capaciteit-laag laadt printmodule", cap.includes("../js/core/capacity_print_tasche_a3.js"));
add("Printknop gebruikt Tasche renderer", cap.includes("printer.printCurrentDocument({ selectedDept:UI.dept })"));
add("Module bevat CAPACITEITSOVERZICHT", mod.includes("CAPACITEITSOVERZICHT"));
add("Module bevat subtitel Tasche Staalbouw", mod.includes("Tasche Staalbouw"));
add("Correct logo-pad wordt gebruikt", mod.includes("assets/tasche-logo.png") && mod.includes('alt="Tasche Staalbouw"'));
add("Geen losse hardcoded projecttitel onder kop", !mod.includes("Project Deventer - ABC Bouw BV - TSB-2026-045"));
add("Geen legenda in printmodule", !/LEGenda|Legenda|legend/i.test(mod));
add("Kolommen aanwezig", ["PROJECTEN", "AFDELING", "Beschikbaar", "Gepland", "Over / Tekort"].every(x => mod.includes(x)));
add("Module gebruikt exact 29 weken", mod.includes("const WEEK_COUNT = 29") && mod.includes("Array.from({ length:WEEK_COUNT }"));
add("Periode is 3 weken terug", mod.includes("addWeeks(current.isoYear, current.isoWeek, -3)"));
add("Periodecontract noemt 26 weken vooruit", mod.includes("26 weken vooruit"));
add("ISO-weekkey aanwezig", mod.includes("`${w.isoYear}-W${pad(w.isoWeek)}`"));
add("Maandrij, weekrij en datumrij aanwezig", mod.includes("month-row") && mod.includes("week-row") && mod.includes("date-row"));
add("Hoofd- en summarytabellen delen week-col colgroups", mod.includes("mainColgroup") && mod.includes("summaryColgroup") && mod.includes("week-col"));
add("Geselecteerde afdeling wordt gerespecteerd", mod.includes("selectedDepartments(st, options)") && mod.includes("options.selectedDept") && cap.includes("selectedDept:UI.dept"));
add("Projectregels komen uit projects.order/byId", mod.includes("function projectRows") && mod.includes("st.projects?.order"));
add("Gantt sourcesByDay is bron voor weekuren", mod.includes("st.gantt?.sourcesByDay") && mod.includes("projectWeekHours"));
add("Centrale deptHours worden niet dubbel geteld", mod.includes("const centralRows =") && mod.includes("if(centralRows.length)"));
add("Resource/medewerkerlijst is niet de hoofdinhoud", !/Project Engineer|Tekenaar|Werkvoorbereider als projectregel/i.test(mod));
add("Cellen blijven blanco bij 0 uur", mod.includes('if(!n) return ""') && mod.includes("const style = v > 0"));
add("Afdelingskleurmapping aanwezig", ["productie", "engineering", "montage", "werkvoorbereiding", "conservering"].every(x => mod.includes(x)));
add("Weekcellen gebruiken afdelingskleur en zwarte tekst", mod.includes("weekCells(weeks, project.weeks, dept.color)") && mod.includes(".week-cell{color:#050505"));
add("Overzicht per afdeling aanwezig", mod.includes("OVERZICHT PER AFDELING") && mod.includes("BENODIGD PER WEEK") && mod.includes("BESCHIKBAAR PER WEEK") && mod.includes("RESTANT PER WEEK"));
add("Metadata rechtsboven aanwezig", ["Projectgroep / Afdeling", "Periode", "Auteur", "Plotdatum", "Revisie", "Pagina"].every(x => mod.includes(x)));
add("Geen popup window.open in capaciteit-printmodule", !/window\.open|opener\.open|window\.top\.open/.test(mod));
add("Hidden iframe printpad aanwezig", mod.includes('document.createElement("iframe")') && mod.includes("iframe.contentWindow.print()") && mod.includes("position:fixed;right:0;bottom:0;width:0;height:0"));
add("Geen save/write/fetch PUT/POST in printmodule", !/CWS\.save|clearAll|resetDemo|fetch\s*\([^)]*(PUT|POST)/s.test(mod));
add("Entrypoints aanwezig", mod.includes("window.CWS_CapacityPrintTascheA3") && mod.includes("window.CWS.capacityPrint.printTascheA3"));
add("Package heeft preflight:capacity-print", pkg.scripts?.["preflight:capacity-print"] === "node scripts/v150-capacity-tasche-print-preflight.mjs");

let ok = 0;
for(const [name, pass] of checks){
  console.log(`${pass ? "OK" : "FOUT"} - ${name}`);
  if(pass) ok += 1;
}
if(ok !== checks.length){
  console.error(`${ok}/${checks.length} controles OK.`);
  process.exit(1);
}
console.log(`${ok}/${checks.length} controles OK.`);
