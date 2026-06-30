import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

const [indexHtml, finalModule, ganttLayer, packageJson] = await Promise.all([
  read("index.html"),
  read("js/core/gantt_print_bws_a3_final.js"),
  read("layers/laag4_gantt.html"),
  read("package.json"),
]);

const checks = [];
const check = (name, ok) => checks.push({ name, ok:Boolean(ok) });

check("index loads only the V146 final BWS print module", indexHtml.includes("js/core/gantt_print_bws_a3_final.js?v=146"));
check("index does not load old BWS print css bridge", !indexHtml.includes("gantt_print_bws_css.js"));
check("index does not load old A3 bouwplanning renderer", !indexHtml.includes("gantt_print_a3_bouwplanning.js"));
check("index does not load old V144 final renderer", !indexHtml.includes("gantt_print_bws_final.js"));

check("Gantt layer exposes read-only print source", ganttLayer.includes("window.CWS_GANTT_PRINT_SOURCE") && ganttLayer.includes("getBwsPrintModel()"));
check("Gantt layer can load final renderer directly", ganttLayer.includes("../js/core/gantt_print_bws_a3_final.js?v=146"));
check("final module only binds inside Gantt document", finalModule.includes("function isGanttDocument") && finalModule.includes('getElementById?.("boardWrap")') && finalModule.includes('getElementById?.("chartPane")') && finalModule.includes('getElementById?.("tableRows")') && finalModule.includes("if (!isGanttDocument()) return false"));
check("Gantt source uses effective screen schedule map", ganttLayer.includes("effectiveScheduleMap(model,st)") && ganttLayer.includes("filteredRows(model,scheduleMap)"));
check("Gantt printA3 delegates to final renderer", ganttLayer.includes("CWS_BWS_A3_PRINT.printCurrentProject"));

check("final module has A3 landscape page css", /@page\s*\{\s*size:\s*A3 landscape;\s*margin:\s*6mm;\s*\}/.test(finalModule));
check("final module uses hidden iframe print renderer", finalModule.includes("document.createElement(\"iframe\")") && finalModule.includes("contentDocument") && finalModule.includes("frameWindow.print()"));
check("final module does not use window.open", !finalModule.includes("window.open"));
check("final module does not call save APIs", !/CWS\.save|saveProjectGantt|setState\s*\(|clearAll|resetDemo|fetch\s*\(/.test(finalModule));

check("final module renders Regel", finalModule.includes("\"Regel\""));
check("final module renders Naam", finalModule.includes("\"Naam\""));
check("final module renders Bouwkundig", finalModule.includes("\"Bouwkundig\""));
check("final module renders Resource and Dagen", finalModule.includes("\"Resource\"") && finalModule.includes("\"Dagen\""));
check("final module renders top calendar", finalModule.includes("kalender boven"));
check("final module renders bottom calendar", finalModule.includes("kalender onder"));
check("final module renders legend", finalModule.includes("\"Legenda\""));
check("final module renders task bars", finalModule.includes("data-taakbalken"));
check("final module renders weekend shading", finalModule.includes("data-weekendvlak"));
check("final module renders day/week/month lines", finalModule.includes("data-daglijnen") && finalModule.includes("data-weeklijnen") && finalModule.includes("data-maandlijnen"));
check("final module renders selected label positions", finalModule.includes("data-label-before") && finalModule.includes("data-label-inside") && finalModule.includes("data-label-after"));
check("final module renders dependencies when enabled", finalModule.includes("data-afhankelijkheden") && finalModule.includes("bwsDepArrow") && finalModule.includes("showDeps"));
check("final module renders today line", finalModule.includes("data-vandaaglijn") && finalModule.includes("Vandaag"));
check("final module sets requested PDF filename", finalModule.includes("function printFileName") && finalModule.includes("projectTitle(data.project)") && finalModule.includes("projectClient(data.project)") && finalModule.includes("__CWS_BWS_PRINT_LAST_FILENAME__"));
check("final module range is one week before/after tasks", finalModule.includes("startOfWeek(addDays(start, -7))") && finalModule.includes("endOfWeek(addDays(end, 7))"));
check("final module validates missing dates", finalModule.includes("meer dan 30%"));
check("final module guards project-wide bars", finalModule.includes("projectbreed") && finalModule.includes("broadTasks"));
check("final module stores inspection HTML", finalModule.includes("__CWS_BWS_PRINT_LAST_HTML__"));

const pkg = JSON.parse(packageJson);
check("package registers preflight:v145", pkg.scripts?.["preflight:v145"] === "node scripts/v145-bws-a3-print-final-preflight.mjs");

const failed = checks.filter(item => !item.ok);
if (failed.length) {
  console.error("V145 BWS A3 print preflight failed:");
  for (const item of failed) console.error(`- ${item.name}`);
  process.exit(1);
}

console.log(`V145 BWS A3 print preflight passed (${checks.length} checks).`);
