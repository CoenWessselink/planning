import fs from "node:fs";

const html = fs.readFileSync("layers/laag4_gantt.html", "utf8");
const pkg = fs.readFileSync("package.json", "utf8");
const fallback = fs.readFileSync("scripts/e2e-fallback.mjs", "utf8");

const checks = [
  ["V53 CSS marker aanwezig", html.includes("V53 — onderste printkalender omgekeerd")],
  ["Onderste kalender krijgt eigen bottom timeline", html.includes("print-calendar-timeline-bottom") && html.includes("v53BottomPrintTimelineHtml")],
  ["Bottom volgorde is dag-week-maand-jaar", html.includes("return `${dayRow.outerHTML}${weekRow.outerHTML}${bottomMonthRow.outerHTML}<div class=\"tl-row tl-row-years\"")],
  ["Jaarregel wordt uit maandlabels gegroepeerd", html.includes("yearGroups") && html.includes("tl-cell year") && html.includes("match(/(\\d{4})\\s*$/)")],
  ["Maandlabel onderaan wordt zonder jaartal getoond", html.includes("const stripped=txt.replace(/\\s+\\d{4}$/,") && html.includes("cell.textContent=stripped||txt")],
  ["Bovenste kalender blijft apart boven tabel", html.includes("top.innerHTML=topLeft+topRight") && html.includes("Regel nr")],
  ["Onderste kalender gebruikt lege linkerspacer", html.includes("print-calendar-left-bottom") && html.includes("bottom.innerHTML=bottomLeft+bottomRight")],
  ["Bottom CSS heeft vier rijen", html.includes(".printing .print-calendar-bottom .timeline") && html.includes("grid-template-rows:20px 17px 17px 18px")],
  ["Package heeft preflight:v53", pkg.includes('"preflight:v53": "node scripts/v53-gantt-bottom-calendar-inverted-preflight.mjs"')],
  ["Fallback E2E bewaakt V53", fallback.includes("V53 onderste printkalender omgekeerd dag-week-maand-jaar")],
];

let ok = 0;
for (const [label, pass] of checks) {
  if (pass) { console.log(`OK - ${label}`); ok++; }
  else { console.error(`FAIL - ${label}`); process.exitCode = 1; }
}
if (!process.exitCode) console.log(`${ok}/${checks.length} V53 onderste kalender-correcties OK.`);
