import { execFileSync } from "node:child_process";
import fs from "node:fs";
import vm from "node:vm";

const read = (file) => fs.readFileSync(file, "utf8");
const pkg = JSON.parse(read("package.json"));
const store = read("js/core/store.js");
const gantt = read("layers/laag4_gantt.html");
const capacity = read("layers/laag5_capaciteit.html");
const overview = read("layers/laag6_projectoverzicht.html");
const io = read("layers/laag11_io.html");
const responsive = read("js/core/responsive.js");
const patches = read("css/patches.css");
const uiReset = read("css/ui/01-reset.css");
const health = read("functions/api/health.js");
const localServer = read("playwright/server.js");
const stateFunction = read("functions/api/state.js");
const playwrightConfig = read("playwright.config.js");

let ok = true;
function check(label, pass) {
  console.log(`${pass ? "OK" : "FAIL"} - ${label}`);
  if (!pass) ok = false;
}

const requiredScripts = ["build","test","lint","start","dev","serve","test:e2e","preflight:all","preflight:v72"];
check("package scripts compleet", requiredScripts.every(name => typeof pkg.scripts?.[name] === "string" && pkg.scripts[name].trim()));
check("Cloudflare health internal-test-v72", health.includes('version: "internal-test-v72"') && health.includes("v72-lightweight-no-state-load"));
check("lokale testserver local-test-v72", localServer.includes('const version = "local-test-v72"') && localServer.includes("local-test-server-v72"));
check("Playwright testDir omvat tests", /testDir:\s*['"]\.\/tests['"]/.test(playwrightConfig));

const modules = [
  "index.html",
  "layers/laag3_projecten.html",
  "layers/laag4_gantt.html",
  "layers/laag5_capaciteit.html",
  "layers/laag6_projectoverzicht.html",
  "layers/laag7_projectplanning.html",
  "layers/laag8_planbord.html",
  "layers/laag9_transport.html",
  "layers/laag8_rapporten.html",
  "layers/laag9_dashboard.html",
  "layers/laag10_instellingen.html",
  "layers/laag10_nietwerkbaredagen.html",
  "layers/laag10_werknemers_werkweek.html",
  "layers/laag11_io.html",
  "layers/laag12_audit.html",
  "layers/laag13_preflight.html"
];
check("alle hoofdmodules bestaan", modules.every(file => fs.existsSync(file)));
check("centrale Gantt duplicate repair en metadata", store.includes("normalizeGanttState") && store.includes("repairDuplicateGanttRowIds") && store.includes("ganttRowIdRepairCount"));
check("continue Gantt-geometrie", gantt.includes("function continuousBarGeometry") && gantt.includes('data-v66-continuous-geometry="1"'));
check("drag/resize immutable ref en rollback", gantt.includes("immutableRef=Object.freeze") && gantt.includes("finishPointerMutation") && gantt.includes("releasePointerCapture") && gantt.includes("gantt_task_resized"));
check("client/server state shrink guard", store.includes("v72-state-shrink-guard") && stateFunction.includes("assertIncomingStateSafe") && stateFunction.includes("Opslaan geblokkeerd: inkomende state lijkt leeg/demo"));
check("State Doctor en live readiness", store.includes("buildStateDoctorReport") && store.includes("buildLiveReadinessReport") && store.includes("lastStateDoctorAt"));
check(
  "V72 responsive hooks",
  responsive.includes("dataset.cwsViewport") &&
    responsive.includes("observeDynamicContent") &&
    responsive.includes("mobileBottomNav") &&
    responsive.includes("makeWideAreasScrollable") &&
    uiReset.includes("#cwsV37MobileActionDock")
);
check("Capaciteit scrollbar en WHY bron", capacity.includes('id="matrixScrollProxy"') && capacity.includes("Auto / projecturen") && capacity.includes("Handmatig"));
check("Projectoverzicht scrollbar en statuskleuren", overview.includes("scrollbar-proxy") && overview.includes("task-done") && overview.includes("task-late"));
check("printkleurbehoud", [gantt, capacity, overview, patches].every(text => text.includes("print-color-adjust")));
check("import-preview en typed confirmations", io.includes("lastImportPreview") && io.includes('typedConfirm("IMPORTEREN"') && io.includes('typedConfirm("DEMO OVERSCHRIJVEN"') && io.includes('typedConfirm("DATA LEEGMAKEN"'));

try {
  if (!fs.existsSync(".git")) {
    check("git repositoryhygiëne controle overgeslagen in ZIP-workspace", true);
  } else {
    const tracked = execFileSync("git", ["ls-files"], { encoding:"utf8" }).split(/\r?\n/).filter(Boolean);
    const forbidden = tracked.filter(file => /(^|\/)(node_modules|test-results|playwright\/artifacts|playwright\/reports|dist|build)(\/|$)/i.test(file));
    check("geen node_modules/test/build-artifacts getrackt", forbidden.length === 0);
  }
} catch (error) {
  console.error(error.message);
  check("git repositoryhygiëne controle", false);
}

const duplicateState = {
  schemaVersion:12,
  projects:{order:["P1"],byId:{P1:{id:"P1",name:"Test"}},deptHours:[{projectId:"P1",deptId:"Engineering",hours:32}]},
  ganttV2:{byProject:{P1:{
    rows:[
      {id:"F1",name:"Fase",type:"summary",department:"Engineering"},
      {id:"T1",name:"Eerste",type:"task",parent:"F1",department:"Engineering"},
      {id:"T1",name:"Tweede",type:"task",parent:"F1",department:"Engineering",predecessor:"T1FS"}
    ],
    sched:{F1:{start:"2026-06-15",end:"2026-06-19"},T1:{start:"2026-06-15",end:"2026-06-19"}}
  }}},
  gantt:{hoursByDay:{},sourcesByDay:{}},
  settings:{tables:{departments:[{name:"Engineering",active:true}],employees:[]}}
};
const raw = JSON.stringify(duplicateState);
const localStorage = {
  getItem(key){ return key === "tenant:default:cws.state.snapshot.v12" ? raw : null; },
  setItem(){},
  removeItem(){}
};
const windowObj = { CWS:{}, UI:{toast(){}}, location:{search:""}, addEventListener(){}, dispatchEvent(){} };
const context = {
  window:windowObj,
  localStorage,
  console,
  setTimeout,
  clearTimeout,
  Date,
  JSON,
  Math,
  Number,
  String,
  Object,
  Array,
  Boolean,
  parseFloat,
  URLSearchParams,
  TextEncoder,
  encodeURIComponent,
  decodeURIComponent,
  fetch:async()=>({ok:false,json:async()=>({}),text:async()=>"",headers:{get(){return null;}}})
};
context.window.window = context.window;
context.window.localStorage = localStorage;
vm.createContext(context);

try {
  vm.runInContext(store, context, { filename:"js/core/store.js", timeout:10_000 });
  const state = context.window.CWS.getState();
  const ids = state.ganttV2.byProject.P1.rows.map(row => row.id);
  check("runtime duplicate repair stabiel", ids.join(",") === "F1,T1,T1__dup2");
  check("runtime V72 metadata aanwezig", state.meta.v72CompleteHardening === true && state.meta.ganttRowIdRepairCount === 1);
  check("runtime state valideert", context.window.CWS.validateState(state).valid);
  const preview = context.window.CWS.recovery.previewImport(JSON.stringify(state));
  check("runtime import-preview bevat verschiloverzicht", preview.ok && preview.canImport && preview.currentMetrics && preview.delta);
} catch (error) {
  console.error(error);
  check("V72 runtime storecontrole", false);
}

if (!ok) process.exit(1);
