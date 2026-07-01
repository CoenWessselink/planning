import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const mod = read("js/core/capacity_print_tasche_a3.js");
const index = read("index.html");
const cap = read("layers/laag5_capaciteit.html");
const printView = read("layers/capacity_print_view.html");
const pkg = JSON.parse(read("package.json"));

const checks = [];
const add = (name, pass) => checks.push([name, !!pass]);

add("Nieuwe printmodule bestaat", fs.existsSync("js/core/capacity_print_tasche_a3.js"));
add("Index laadt nieuwe printmodule met cachebust", index.includes("js/core/capacity_print_tasche_a3.js?v=159"));
add("Capaciteit-laag laadt printmodule direct in eigen document", cap.includes('../js/core/capacity_print_tasche_a3.js?v=159'));
add("Capaciteit vindt printmodule in eigen document of parent", cap.includes("function capacityTaschePrint()") && cap.includes("window.CWS_CapacityPrintTascheA3?.printCurrentDocument") && cap.includes("window.parent.CWS_CapacityPrintTascheA3"));
add("Capaciteit printknop gebruikt current-document renderer", cap.includes("printer.printCurrentDocument({ selectedDept:UI.dept })") && !cap.includes('document.body.classList.add("cap-printing"); const oldTitle=document.title'));
add("Oude A0 knoptekst is verwijderd", !cap.includes("Afdrukken A0"));
add("Oude Gantt printmodules worden niet gekoppeld aan Capaciteit", !cap.includes("gantt_print_bws") && !cap.includes("printBws"));
add("Module bevat CAPACITEITSOVERZICHT", mod.includes("CAPACITEITSOVERZICHT"));
add("Module bevat Tasche Staalbouw", mod.includes("Tasche Staalbouw"));
add("Module heeft eigen capaciteit-printroot en marker", mod.includes("CWS_CAPACITY_TASCHE_A3_PRINT_V159") && mod.includes("cwsCapacityPrintRoot") && mod.includes('data-cws-print-kind="capacity-overview"'));
add("Module verwijdert stale BWS/Gantt printframe", mod.includes("cwsBwsA3PrintFrame") && mod.includes("removeStalePrintFrames()"));
add("Capaciteit-output bevat geen BWS/Gantt marker", !/CWS_BWS_A3_PRINT_FINAL|data-bws-marker|Bouwplanning/.test(mod));
add("Module bevat geen CWS-logo tekst als printlogo", !/CWS-logo|CWS logo|CAPACITY PLANNING/.test(mod));
add("Geen hardcoded projecttitel onder kop", !mod.includes("Project Deventer - ABC Bouw BV - TSB-2026-045"));
add("Module bevat geen legenda", !/LEGenda|Legenda|legend/i.test(mod));
add("Kolommen aanwezig", ["PROJECTEN", "AFDELING", "Beschikbaar", "Gepland", "Over / Tekort"].every(x => mod.includes(x)));
add("Module gebruikt 29 weken", mod.includes("WEEK_COUNT = 29"));
add("Module gebruikt 3 weken terug", mod.includes("addWeeks(current.isoYear, current.isoWeek, -3)") && mod.includes("3 weken"));
add("Module gebruikt 26 weken vooruit contract", mod.includes("26 weken") || mod.includes("WEEK_COUNT = 29"));
add("Project-afdelingsuren tellen centrale deptHours niet dubbel met project.deptHours", mod.includes("const centralRows =") && mod.includes("if(centralRows.length)") && mod.includes("project.requiredDeptHours"));
add("Capaciteit print via dedicated printpagina", mod.includes("PRINT_STORAGE_PREFIX") && mod.includes("/layers/capacity_print_view.html") && mod.includes(".open(printUrl, PRINT_WINDOW_NAME)") && mod.includes("cws_capacity_overview_print"));
add("Capaciteit gebruikt geen hidden iframe printpad", !mod.includes("document.createElement(\"iframe\")") && !mod.includes("frameWindow.print()"));
add("Dedicated printpagina bevat alleen capaciteitsoverzicht", printView.includes("CWS_CAPACITY_TASCHE_A3_PRINT_V159") && printView.includes("CAPACITEITSOVERZICHT") && printView.includes("localStorage.getItem") && printView.includes("window.print()") && !/CWS_BWS_A3_PRINT_FINAL|data-bws-marker|Bouwplanning/.test(printView));
add("Geen destructieve save/write/fetch PUT/POST", !/CWS\.save|clearAll|resetDemo|fetch\s*\([^)]*(PUT|POST)/s.test(mod));
add("Entrypoint aanwezig", mod.includes("window.CWS_CapacityPrintTascheA3") && mod.includes("window.CWS.capacityPrint.printTascheA3"));
add("Afdelingskleurmapping aanwezig", mod.includes("DEPARTMENT_COLORS") && mod.includes("productie") && mod.includes("engineering") && mod.includes("montage"));
add("Cellen blijven leeg bij 0 uren", mod.includes('if(!n) return ""') && mod.includes("v > 0 ?"));
add("Overzicht per afdeling aanwezig", mod.includes("OVERZICHT PER AFDELING"));
add("Plus/min totalen krijgen duidelijke kleurvlakken", mod.includes(".metric.pos{color:#047857") && mod.includes("background:#ecfdf5") && mod.includes(".metric.neg{color:#b91c1c") && mod.includes("background:#fef2f2"));
add("Current-document printroot en beforeprint vangnet aanwezig", mod.includes("function printCurrentDocument") && mod.includes("function prepareCurrentDocumentPrint") && mod.includes("installCurrentDocumentPrintRoot(printHtml)") && mod.includes("beforeprint") && mod.includes("body > :not(#${ROOT_ID})"));
add("Oude A0 printlaag verwijderd uit capaciteit", !cap.includes("a0-day-print") && !cap.includes("a0-day-table") && !cap.includes("printHeader") && !cap.includes("@page{size:A0"));
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
