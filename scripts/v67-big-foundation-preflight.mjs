import fs from "node:fs";
import vm from "node:vm";

const read = p => fs.readFileSync(p, "utf8");
const store = read("js/core/store.js");
const health = read("functions/api/health.js");
const pkg = read("package.json");
const io = read("layers/laag11_io.html");
const gantt = read("layers/laag4_gantt.html");
let ok = true;
function check(label, pass){ console.log(`${pass ? "OK" : "FAIL"} - ${label}`); if(!pass) ok = false; }

check("V67 health marker aanwezig", /internal-test-v67/.test(health) && /v67-lightweight-no-state-load/.test(health));
check("V67 package script geregistreerd", /"preflight:v67"/.test(pkg));
check("V67 fixture en recovery API aanwezig", /createRestoredD1Fixture/.test(store) && /loadRestoredD1Fixture/.test(store) && /importRawState/.test(store) && /V67_FIXTURE_MARKER/.test(store));
check("V67 laatste-goede snapshot guard aanwezig", /V67_LAST_GOOD_KEY/.test(store) && /rememberLastGoodSnapshot/.test(store));
check("V67 IO herstelpaneel aanwezig", /V67 Backup \/ Restore \/ Testmodus/.test(io) && /v67ImportText/.test(io) && /v67Fixture/.test(io));
check("V67 Gantt blijft centrale continue geometrie gebruiken", /function continuousBarGeometry/.test(gantt) && /data-v66-continuous-geometry="1"/.test(gantt));

const fakeStore = new Map();
const fakeLocalStorage = {
  getItem(k){ return fakeStore.has(k) ? fakeStore.get(k) : null; },
  setItem(k,v){ fakeStore.set(k,String(v)); },
  removeItem(k){ fakeStore.delete(k); },
  clear(){ fakeStore.clear(); }
};
const windowObj = { CWS:{}, UI:{ toast(){} }, location:{ search:"?fixture=restored-d1" }, addEventListener(){}, dispatchEvent(){} };
const ctx = { window:windowObj, localStorage:fakeLocalStorage, console, setTimeout, clearTimeout, Date, JSON, Math, Number, String, Object, Array, Boolean, parseFloat, URLSearchParams, TextEncoder, encodeURIComponent, decodeURIComponent, fetch: async()=>({ ok:false, json:async()=>({ok:false}), text:async()=>"", headers:{ get(){ return null; } } }) };
ctx.window.window = ctx.window;
ctx.window.localStorage = fakeLocalStorage;
vm.createContext(ctx);
try{
  vm.runInContext(store, ctx, { filename:"js/core/store.js", timeout:10000 });
  const CWS = ctx.window.CWS;
  const metrics = CWS.getStateMetrics();
  const st = CWS.getState();
  const main = st.projects.byId["P-ZERNIKE-19158"];
  const rows = st.ganttV2.byProject["P-ZERNIKE-19158"]?.rows || [];
  check("V67 fixture laadt 76 projecten", metrics.projectCount === 76 && st.projects.order.length === 76);
  check("V67 fixture bevat Zernike project", main && /Sportcentrum Zernike/.test(main.name || ""));
  check("V67 fixture bevat brede PDF-taken", rows.some(r=>r.name === "Productie") && rows.some(r=>r.name === "Conservering epoxy") && rows.length >= 18);
  check("V67 fixture vult Gantt rows", metrics.ganttProjectCount >= 10 && metrics.ganttRowCount >= 35);
  check("V67 recovery API werkt", CWS.recovery && typeof CWS.recovery.exportStateJson === "function" && typeof CWS.recovery.restoreLastGoodSnapshot === "function");
  const exported = CWS.recovery.exportStateJson();
  check("V67 export bevat legacy schema", /"projects"/.test(exported) && /"ganttV2"/.test(exported) && /"tasks"/.test(exported));
}catch(error){
  console.error(error);
  check("V67 fixture runtime test", false);
}
if(!ok) process.exit(1);
