import fs from "node:fs";

let ok = true;
function check(label, pass){
  console.log(`${pass ? "OK" : "FAIL"} - ${label}`);
  if(!pass) ok = false;
}
const read = (file) => fs.readFileSync(file, "utf8");
const pkg = read("package.json");
const health = read("functions/api/health.js");
const server = read("playwright/server.js");
const store = read("js/core/store.js");
const io = read("layers/laag11_io.html");
const gantt = read("layers/laag4_gantt.html");

check("V70 package script geregistreerd", /"preflight:v70"\s*:\s*"node scripts\/v70-live-stability-gantt-capacity-preflight\.mjs"/.test(pkg));
check("Cloudflare health marker V70", /internal-test-v70/.test(health) && /v70-lightweight-no-state-load/.test(health));
check("Lokale health marker V70", /local-test-v70/.test(server) && /local-test-server-v70/.test(server));
check("V70 runtime marker aanwezig", /V70_LIVE_STABILITY_MARKER/.test(store) && /v70-live-stability-gantt-capacity-hardening/.test(store));
check("Live readiness report beschikbaar", /buildLiveReadinessReport/.test(store) && /workingDayHourViolations/.test(store) && /orphanGanttProjects/.test(store));
check("Remote D1 legacy waarschuwingen houden app niet unsynced", /storageStatus\.unsynced\s*=\s*false;[\s\S]{0,450}liveValidationWarnings/.test(store));
check("Succesvolle remote save markeert last-good snapshot", /markRemoteSaveOk/.test(store) && /lastSuccessfulRemoteVersion/.test(store) && /rememberLastGoodSnapshot\(state, label\)/.test(store));
check("V70 readiness export in Import\/Export UI", /v70ReadinessBtn/.test(io) && /Live readiness rapport/.test(io));
check("Gantt blijft centrale brede balkgeometrie gebruiken", /function continuousBarGeometry/.test(gantt) && /calendarDuration\(start, end\) \* pxPerDay\(\)/.test(gantt));
check("Drag gebruikt zichtbare effectieve planning", /rowSchedule\(model,row,rowIndex\)/.test(gantt) && /bar\.dataset\.tmpStart/.test(gantt) && /saveModel\(pid,model,"Balk bijgewerkt op werkbare dagen"\)/.test(gantt));
check("Playwright blijft volledige tests-map draaien", /testDir:\s*['"]\.\/tests['"]/.test(read("playwright.config.js")));

if(!ok) process.exit(1);
