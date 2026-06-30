import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const mod = read("js/core/capacity_print_tasche_a3.js");
const index = read("index.html");
const cap = read("layers/laag5_capaciteit.html");
const pkg = JSON.parse(read("package.json"));

const checks = [];
const add = (name, pass) => checks.push([name, !!pass]);

add("Nieuwe printmodule bestaat", fs.existsSync("js/core/capacity_print_tasche_a3.js"));
add("Index laadt nieuwe printmodule met cachebust", index.includes("js/core/capacity_print_tasche_a3.js?v=153"));
add("Capaciteit vindt printmodule in iframe of parent", cap.includes("function capacityTaschePrint()") && cap.includes("window.parent.CWS_CapacityPrintTascheA3") && cap.includes("window.parent.CWS?.capacityPrint?.printTascheA3"));
add("Capaciteit printknop gebruikt alleen nieuwe renderer", cap.includes("printer.print({ selectedDept:UI.dept })") && !cap.includes('document.body.classList.add("cap-printing"); const oldTitle=document.title'));
add("Oude A0 knoptekst is verwijderd", !cap.includes("Afdrukken A0"));
add("Oude Gantt printmodules worden niet gekoppeld aan Capaciteit", !cap.includes("gantt_print_bws") && !cap.includes("printBws"));
add("Module bevat CAPACITEITSOVERZICHT", mod.includes("CAPACITEITSOVERZICHT"));
add("Module bevat Tasche Staalbouw", mod.includes("Tasche Staalbouw"));
add("Module heeft eigen capaciteit-printframe en marker", mod.includes("CWS_CAPACITY_TASCHE_A3_PRINT_V153") && mod.includes("cwsCapacityTaschePrintFrame") && mod.includes('data-cws-print-kind="capacity-overview"'));
add("Module verwijdert stale BWS/Gantt printframe", mod.includes("cwsBwsA3PrintFrame") && mod.includes("removeStalePrintFrames()"));
add("Capaciteit-output bevat geen BWS/Gantt marker", !/CWS_BWS_A3_PRINT_FINAL|data-bws-marker|Bouwplanning/.test(mod));
add("Module bevat geen CWS-logo tekst als printlogo", !/CWS-logo|CWS logo|CAPACITY PLANNING/.test(mod));
add("Geen hardcoded projecttitel onder kop", !mod.includes("Project Deventer - ABC Bouw BV - TSB-2026-045"));
add("Module bevat geen legenda", !/LEGenda|Legenda|legend/i.test(mod));
add("Kolommen aanwezig", ["PROJECTEN", "AFDELING", "Beschikbaar", "Gepland", "Over / Tekort"].every(x => mod.includes(x)));
add("Module gebruikt 29 weken", mod.includes("WEEK_COUNT = 29"));
add("Module gebruikt 3 weken terug", mod.includes("addWeeks(current.isoYear, current.isoWeek, -3)") && mod.includes("3 weken"));
add("Module gebruikt 26 weken vooruit contract", mod.includes("26 weken") || mod.includes("WEEK_COUNT = 29"));
add("Geen window.open", !mod.includes("window.open"));
add("Geen destructieve save/write/fetch PUT/POST", !/CWS\.save|clearAll|resetDemo|fetch\s*\([^)]*(PUT|POST)/s.test(mod));
add("Entrypoint aanwezig", mod.includes("window.CWS_CapacityPrintTascheA3") && mod.includes("window.CWS.capacityPrint.printTascheA3"));
add("Afdelingskleurmapping aanwezig", mod.includes("DEPARTMENT_COLORS") && mod.includes("productie") && mod.includes("engineering") && mod.includes("montage"));
add("Cellen blijven leeg bij 0 uren", mod.includes('if(!n) return ""') && mod.includes("v > 0 ?"));
add("Overzicht per afdeling aanwezig", mod.includes("OVERZICHT PER AFDELING"));
add("Hidden iframe print aanwezig", mod.includes("document.createElement(\"iframe\")") && mod.includes("doc.write(printHtml)") && mod.includes("frameWindow.print()"));
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
