import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));
const index = read("index.html");
const gantt = read("layers/laag4_gantt.html");
const capacity = read("layers/laag5_capaciteit.html");
const store = read("js/core/store.js");
const health = read("functions/api/health.js");
const server = read("playwright/server.js");
const stateApi = read("functions/api/state.js");
const projects = read("layers/laag3_projecten.html");
const overview = read("layers/laag6_projectoverzicht.html");

function check(label, ok) {
  if (!ok) throw new Error(`[preflight:v86] ${label}`);
  console.log(`OK - ${label}`);
}

check("package.json bevat preflight:v86", pkg.scripts?.["preflight:v86"] === "node scripts/v86-complete-gantt-capacity-mobile-visual-hardening-preflight.mjs");
check("health bevat internal-test-v86", health.includes("internal-test-v86") && health.includes("v86-lightweight-no-state-load"));
check("lokale server bevat local-test-v86", server.includes("local-test-v86") && server.includes("local-test-server-v86"));
check("UI/build marker staat op V86", index.includes("V86_COMPLETE_GANTT_CAPACITY_MOBILE_VISUAL_HARDENING"));
check("knop Nieuwe fase bestaat", gantt.includes('id="addPhaseBtn"') && gantt.includes("Nieuwe fase") && gantt.includes("insertSummaryAfter"));
check("type selector uit V83 blijft bestaan", gantt.includes('id="mType"') && gantt.includes('value="summary"') && gantt.includes('value="task"'));
check("dblclick op bar opent taakpopup", gantt.includes('addEventListener("dblclick"') && gantt.includes("openEdit(id)") && gantt.includes('$("#chartPane").addEventListener("dblclick"'));
check("Ctrl/Shift multiselect-code aanwezig", gantt.includes("selectedRows:new Set()") && gantt.includes("event.ctrlKey") && gantt.includes("event.shiftKey") && gantt.includes("UI.lastSelectedRow"));
check("bulkacties UI aanwezig", gantt.includes("data-v86-bulk-actions") && gantt.includes("bulkDeleteBtn") && gantt.includes("bulkStatus") && gantt.includes("bulkShiftBtn") && gantt.includes("bindBulkActions"));
check("Gantt labels hebben max-width/ellipsis/overflow hidden", /bar-label[\s\S]{0,220}max-width/.test(gantt) && gantt.includes("text-overflow:ellipsis") && gantt.includes("overflow:hidden"));
check("geen brede witte labelachtergrond", gantt.includes("V86 - screen label") && !/\.lane \.bar\.summary \.bar-label\{[^}]*background:#fff!important/.test(gantt));
check("Gantt calendar/header z-index isolatie aanwezig", gantt.includes("day-grid-line") && gantt.includes("nonwork-shade") && gantt.includes("calendar") && gantt.includes("z-index"));
check("Capaciteit recalc vanuit Gantt aanwezig", store.includes("recalculateCapacityFromGantt") && store.includes("buildHoursByDayFromGantt") && store.includes("buildSourcesByDayFromGantt"));
check("Capacity range start huidige week", capacity.includes("applyDefaultCapacityRange") && capacity.includes("const start=current") && capacity.includes("weeks:26"));
check("Capacity print range is 3 weken terug en 26 weken vooruit", capacity.includes("capacityPrintWeeks") && capacity.includes("addWeeks(tw.year,tw.week,-3)") && capacity.includes("addWeeks(tw.year,tw.week,26)") && capacity.includes("3 weken terug t/m 26 weken vooruit"));
check("scrollbars voor Gantt/Capaciteit/Projectoverzicht/Projecten aanwezig", gantt.includes("boardWrap") && gantt.includes("overflow-x:auto") && capacity.includes("matrixScrollProxy") && overview.includes("projectScrollProxy") && projects.includes("table-wrap"));
check("responsive CSS voor toolbar-scroll aanwezig", gantt.includes(".toolbar{overflow-x:auto") && gantt.includes("@media(max-width:760px)") && capacity.includes("overflow-x:auto"));
check("mobile/tablet Gantt toolbar overflow oplossing aanwezig", gantt.includes(".toolbar::-webkit-scrollbar") && gantt.includes("flex-wrap:nowrap"));
check("D1 chunked save/load code blijft aanwezig", stateApi.includes("app_state_chunks") && stateApi.includes("X-CWS-Chunked-Manifest") && store.includes("loadChunkedRemoteStateBody"));
check("save during boot guard blijft aanwezig", store.includes("setState tijdens boot geblokkeerd") && store.includes("save during boot guard") || store.includes("setStateCallsDuringBoot"));
check("render roept saveModel niet aan", !/function\s+render\s*\([^)]*\)\s*\{[\s\S]{0,9000}saveModel\s*\(/.test(gantt));

console.log("[preflight:v86] complete Gantt/capacity/mobile visual hardening checks OK");
