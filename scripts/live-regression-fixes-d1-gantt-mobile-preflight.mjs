import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));
const settings = read("layers/laag10_instellingen.html");
const store = read("js/core/store.js");
const gantt = read("layers/laag4_gantt.html");
const capacity = read("layers/laag5_capaciteit.html");
const theme = read("css/theme.css");
const stateApi = read("functions/api/state.js");

function check(label, ok) {
  if (!ok) throw new Error(`[preflight:live-regression] ${label}`);
  console.log(`OK - ${label}`);
}

check("package.json bevat preflight:v88 en preflight:live-regression", pkg.scripts?.["preflight:v88"] === "node scripts/live-regression-fixes-d1-gantt-mobile-preflight.mjs" && pkg.scripts?.["preflight:live-regression"] === "node scripts/live-regression-fixes-d1-gantt-mobile-preflight.mjs");

check(
  "auditlog modal sluit via X en Escape",
  settings.includes("function openAuditModal(open)") &&
  settings.includes("auditEscapeHandler") &&
  settings.includes("document.addEventListener(\"keydown\", auditEscapeHandler, true)") &&
  settings.includes("openAuditModal(false)") &&
  settings.includes("__auditClose")
);

check(
  "D1 remote saves zijn geserialiseerd via centrale queue",
  store.includes("remoteSaveInFlight") &&
  store.includes("remoteSaveQueued") &&
  store.includes("flushRemoteSaveQueue") &&
  store.includes("runRemoteSaveOnce") &&
  store.includes("Opslaan ingepland")
);

check(
  "save queue voorkomt parallelle remote saves",
  store.includes("if(remoteSaveInFlight)") &&
  store.includes("await runRemoteSaveOnce(currentReason)") &&
  store.includes("}while(remoteSaveQueued)")
);

check(
  "D1 chunked save/load blijft aanwezig",
  stateApi.includes("app_state_chunks") &&
  stateApi.includes("X-CWS-Chunked-Manifest") &&
  store.includes("loadChunkedRemoteStateBody") &&
  store.includes("payload=raw-state")
);

check(
  "Gantt-labels zijn compact en geclamped",
  gantt.includes("max-width:132px!important") &&
  gantt.includes("text-overflow:ellipsis!important") &&
  gantt.includes("background:rgba(255,255,255,.50)!important") &&
  gantt.includes("Math.min(132,firstLeft-beforeGap)") &&
  gantt.includes("Math.min(132,chartW-afterLeft)")
);

check(
  "Gantt header/grid isolatie blijft aanwezig",
  gantt.includes("body:not(.printing) .lane") &&
  gantt.includes("contain:paint!important") &&
  gantt.includes("body:not(.printing) .today-line")
);

check(
  "capaciteit start vanuit actuele week minus drie en reset stale periodes",
  capacity.includes("function defaultCapacityRange") &&
  capacity.includes("addWeeks(current.year,current.week,-3)") &&
  capacity.includes("savedCapacityPeriodIsRelevant") &&
  capacity.includes("!savedCapacityPeriodIsRelevant(activePeriod)") &&
  !capacity.includes("W32 2029")
);

check(
  "capaciteit eindigt rond laatste planning plus drie weken",
  capacity.includes("latestPlanningIso") &&
  capacity.includes("addWeeks(lastWeek.year,lastWeek.week,3)") &&
  capacity.includes("weeksBetweenInclusive(start,end)")
);

check(
  "mobiele/tablet toolbars houden acties bereikbaar met zichtbare scrollbars",
  theme.includes("scrollbar-width:thin") &&
  theme.includes(".v37-mobile-optimized .toolbar::-webkit-scrollbar") &&
  theme.includes("display:block;height:9px") &&
  capacity.includes("scrollbar-width:thin") &&
  capacity.includes("display:block;height:10px")
);

check(
  "Gantt toolbar mobiele bereikbaarheid blijft aanwezig",
  gantt.includes("data-testid=\"gantt-toolbar\"") &&
  gantt.includes("id=\"addPhaseBtn\"") &&
  gantt.includes("id=\"addTaskBtn\"") &&
  gantt.includes(".toolbar{overflow-x:auto")
);

console.log("[preflight:live-regression] live regression checks OK");
