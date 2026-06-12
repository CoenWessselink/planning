import fs from "node:fs";
import vm from "node:vm";

const storePath = "js/core/store.js";
const indexPath = "index.html";
const store = fs.readFileSync(storePath, "utf8");
const health = fs.readFileSync("functions/api/health.js", "utf8");
const pkg = fs.readFileSync("package.json", "utf8");

let ok = true;
function check(label, pass){
  console.log(`${pass ? "OK" : "FAIL"} - ${label}`);
  if(!pass) ok = false;
}

check("V61 health-versie herkenbaar", health.includes("internal-test-v61") && health.includes("v61-lightweight-no-state-load"));
check("V61 preflight script geregistreerd", pkg.includes('"preflight:v61"'));
check("V61 num helper staat vóór eerste load()/normalizeState runtime", store.indexOf("const num = baseNum;") > -1 && store.indexOf("const num = baseNum;") < store.indexOf("const load = () =>"));
check("Geen late dubbele const num meer", (store.match(/const num = baseNum;/g) || []).length === 1);

const sampleState = {
  schemaVersion: 12,
  projects: { order: ["P-BOOT"], byId: { "P-BOOT": { id:"P-BOOT", number:"BOOT", name:"Boot regressie", client:"Test", status:"Ingepland", deptHours:{ Productie: 16 } } } },
  ganttV2: { expanded:{}, ui:{}, byProject: { "P-BOOT": { rows: [
    { id:"P-BOOT-PH", name:"Fase", type:"summary", department:"Productie" },
    { id:"P-BOOT-T1", name:"Taak", type:"task", department:"Productie", hours: 8, manualHours: 8, hoursMode:"auto" }
  ], sched: { "P-BOOT-T1": { start:"01-06-2026", end:"05-06-2026" } } } } },
  settings: { tables: { departments:[{ name:"Productie", active:true }], employees:[] } },
  gantt: { hoursByDay:{}, sourcesByDay:{} }
};
const raw = JSON.stringify(sampleState);
const fakeLocalStorage = {
  getItem(key){ return key === "tenant:default:cws.state.snapshot.v12" ? raw : null; },
  setItem(){},
  removeItem(){},
  clear(){}
};
const windowObj = { CWS:{}, UI:{ toast(){} }, addEventListener(){}, dispatchEvent(){} };
const ctx = {
  window: windowObj,
  localStorage: fakeLocalStorage,
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
  encodeURIComponent,
  decodeURIComponent,
  URLSearchParams,
  fetch: async () => ({ ok:false, json:async()=>({ok:false}), text:async()=>"" })
};
ctx.window.window = ctx.window;
ctx.window.localStorage = fakeLocalStorage;
vm.createContext(ctx);
try{
  vm.runInContext(store, ctx, { filename:storePath, timeout:5000 });
  check("store.js boot zonder TDZ-runtimefout met bestaande Gantt-data", typeof ctx.window.CWS?.init === "function");
  check("CWS API blijft beschikbaar na store boot", ["getState","mutate","gantt","storage","validateState"].every(k => ctx.window.CWS && k in ctx.window.CWS));
}catch(error){
  console.error(error);
  check("store.js boot zonder TDZ-runtimefout met bestaande Gantt-data", false);
}

check("index blijft CWS.init verwachten", fs.readFileSync(indexPath, "utf8").includes("CWS.init"));

if(!ok) process.exit(1);
