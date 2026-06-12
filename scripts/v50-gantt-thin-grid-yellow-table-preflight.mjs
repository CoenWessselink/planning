import fs from "node:fs";

const html = fs.readFileSync("layers/laag4_gantt.html", "utf8");
const pkg = fs.readFileSync("package.json", "utf8");
const fallback = fs.readFileSync("scripts/e2e-fallback.mjs", "utf8");

const checks = [
  ["V50 CSS marker aanwezig", html.includes("V50 — raster dunner + gele samenvattingsbalk alleen in tabel")],
  ["V50 gebruikt subtiele print-daglijn", html.includes("--v50-day-line-width-print:.10px") && html.includes("--v50-print-day-line-color:rgba(17,24,39,.24)")],
  ["V50 voorkomt dubbele dikke nonwork-lijnen", html.includes(".nonwork-shade::after{display:none!important;}") && html.includes(".printing .nonwork-shade::after{display:none!important;}")],
  ["V50 nonwork-vlak blijft herkenbaar", html.includes("--v50-nonwork-fill:#e6eaef") && html.includes("background:var(--v50-nonwork-fill)!important")],
  ["V50 print-grid blijft boven nonwork maar subtiel", html.includes(".printing .day-grid-line") && html.includes("width:var(--v50-day-line-width-print)!important") && html.includes("opacity:.72!important") && html.includes("z-index:2!important")],
  ["V50 diagram-samenvattingsrij is niet geel", html.includes(".lane.summary-lane{background-color:#fff!important;}") && html.includes(".printing .lane.summary-lane,.printing .summary-lane{background-color:#fff!important;}")],
  ["V50 linkertabel behoudt gele samenvattingsmarkering", html.includes(".printing .print-task-table tbody tr.summary-row td") && html.includes("background:#ffd400!important")],
  ["Package heeft preflight:v50", pkg.includes('"preflight:v50": "node scripts/v50-gantt-thin-grid-yellow-table-preflight.mjs"')],
  ["Fallback E2E bewaakt V50 regressie", fallback.includes("V50 dunner raster en geel alleen in tabel")],
];

let ok = 0;
for (const [label, pass] of checks) {
  if (pass) { console.log(`OK - ${label}`); ok++; }
  else { console.error(`FAIL - ${label}`); process.exitCode = 1; }
}
if (!process.exitCode) console.log(`${ok}/${checks.length} V50 raster/geel-correcties OK.`);
