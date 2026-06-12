import fs from "node:fs";

const html = fs.readFileSync("layers/laag4_gantt.html", "utf8");
const pkg = fs.readFileSync("package.json", "utf8");
const fallback = fs.readFileSync("scripts/e2e-fallback.mjs", "utf8");

const checks = [
  ["V51 CSS marker aanwezig", html.includes("V51 — kalender direct boven én onder de printtabel")],
  ["Printkalender top en bottom DOM aanwezig", html.includes('id="printCalendarTop"') && html.includes('id="printCalendarBottom"')],
  ["Kalender renderfunctie vult boven en onder printkalenders", html.includes("function renderPrintCalendars") && html.includes("top.innerHTML=") && html.includes("bottom.innerHTML=") && html.includes("printCalendarTop") && html.includes("printCalendarBottom")],
  ["Printkalender gebruikt dezelfde timeline-opbouw", html.includes("print-calendar-timeline") && html.includes("timelineInnerHtml")],
  ["Kalender staat in print als grid boven tabel/diagram", html.includes(".printing .print-calendar") && html.includes("grid-template-columns:var(--v47-print-left-w")],
  ["Originele chart timeline verborgen in print om dubbele kalender/witruimte te voorkomen", html.includes(".printing .chart-pane > .timeline{display:none!important")],
  ["Printtafelkop is verplaatst naar linker kalenderdeel", html.includes(".printing .print-task-table thead{display:none!important") && html.includes("print-calendar-left") && html.includes("Regel nr")],
  ["Dependencies starten op rijgebied zonder kalenderoffset", html.includes(".printing .chart-pane > .dep-svg{top:0!important;height:100%!important;}")],
  ["Render roept printkalenders na printtafelbreedtes aan", html.includes("renderPrintTaskTable(rows);\n      renderPrintCalendars")],
  ["Package heeft preflight:v51", pkg.includes('"preflight:v51": "node scripts/v51-print-calendar-top-bottom-preflight.mjs"')],
  ["Fallback E2E bewaakt V51 regressie", fallback.includes("V51 kalender boven en onder printtabel")],
];

let ok = 0;
for (const [label, pass] of checks) {
  if (pass) { console.log(`OK - ${label}`); ok++; }
  else { console.error(`FAIL - ${label}`); process.exitCode = 1; }
}
if (!process.exitCode) console.log(`${ok}/${checks.length} V51 printkalender-correcties OK.`);
