import fs from "node:fs";

const html = fs.readFileSync("layers/laag4_gantt.html", "utf8");
const pkg = fs.readFileSync("package.json", "utf8");
const fallback = fs.readFileSync("scripts/e2e-fallback.mjs", "utf8");

const checks = [
  ["V49 CSS marker aanwezig", html.includes("V49 — niet-werkbare dagen met zichtbare dunne daglijnen")],
  ["Niet-werkbare dagen behouden lichtgrijze vulling", html.includes("--v49-nonwork-fill:#e6eaef") && html.includes("var(--v49-nonwork-fill)!important")],
  ["Schermweergave krijgt dunne donkere daglijn in nonwork-shade", html.includes("--v49-nonwork-line-screen:rgba(0,0,0,.36)") && html.includes(".nonwork-shade::after")],
  ["Printweergave krijgt dunne zwarte daglijn", html.includes("--v49-nonwork-line-print:rgba(0,0,0,.68)") && html.includes("--v49-nonwork-line-width-print:.18px")],
  ["Dag-gridlijnen liggen boven niet-werkbare vlakken", html.includes(".printing .nonwork-shade") && html.includes("z-index:1!important") && html.includes(".printing .day-grid-line") && html.includes("z-index:2!important")],
  ["Geen dikke borders op niet-werkbare dagen", html.includes(".printing .nonwork-shade") && html.includes("border:0!important")],
  ["Timeline-header houdt daglijn over nonwork/weekend", html.includes(".printing .tl-cell.day.weekend,.printing .tl-cell.day.nonwork") && html.includes("border-right:var(--v49-nonwork-line-width-print)")],
  ["Render maakt nonwork-shade per dag", html.includes("nonWorkShadeHtml=days.map") && html.includes("width:${pxPerDay()}px")],
  ["Package heeft preflight:v49", pkg.includes('"preflight:v49": "node scripts/v49-nonwork-daylines-preflight.mjs"')],
  ["Fallback E2E bewaakt V49 regressie", fallback.includes("V49 niet-werkbare daglijnen blijven zichtbaar")],
];

let ok = 0;
for (const [label, pass] of checks) {
  if (pass) { console.log(`OK - ${label}`); ok++; }
  else { console.error(`FAIL - ${label}`); process.exitCode = 1; }
}
if (!process.exitCode) console.log(`${ok}/${checks.length} V49 niet-werkbare-dagen daglijncontroles OK.`);
