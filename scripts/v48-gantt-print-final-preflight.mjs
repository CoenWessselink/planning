import fs from "node:fs";

const html = fs.readFileSync("layers/laag4_gantt.html", "utf8");
const checks = [
  ["V48 print fine-tune marker", "V48 — final small Gantt print fine-tune"],
  ["Logo 1.5x groter", "max-width:203px"],
  ["Diagram en tabel zelfde font", ".printing .chart-pane *"],
  ["Uniforme dunne daglijnen", "--v48-print-inner-line:.18px"],
  ["Uniforme taakrijlijnen diagram", ".printing .lane{height:var(--v48-print-row-h)"],
  ["Niet-werkbare dagen lichtgrijs", "--v48-print-nonwork:#e6eaef"],
  ["Scheidingslijn tabel/diagram exact", "border-right:var(--v48-print-outer-line)"],
  ["Headerhoogte gelijk", "--v48-print-head-h:58px"],
  ["Rijhoogte gelijk", "--v48-print-row-h:24px"],
  ["Bar-font gelijk", ".printing .bar .bar-label"],
];
let ok = 0;
for (const [name, needle] of checks) {
  if (html.includes(needle)) { console.log(`OK - ${name}`); ok++; }
  else { console.error(`FAIL - ${name}`); process.exitCode = 1; }
}
if (!process.exitCode) console.log(`${ok}/${checks.length} controles OK.`);
