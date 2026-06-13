import fs from "node:fs";
import vm from "node:vm";

const read = p => fs.readFileSync(p, "utf8");
const store = read("js/core/store.js");
const health = read("functions/api/health.js");
const pkg = read("package.json");
const io = read("layers/laag11_io.html");
const gantt = read("layers/laag4_gantt.html");
const stateApi = read("functions/api/state.js");
let ok = true;
function check(label, pass){ console.log(`${pass ? "OK" : "FAIL"} - ${label}`); if(!pass) ok = false; }

check("V68 health marker aanwezig", /internal-test-v68/.test(health) && /v68-lightweight-no-state-load/.test(health));
check("V68 package script geregistreerd", /"preflight:v68"/.test(pkg));
check("V68 complete marker aanwezig", /V68_COMPLETE_MARKER/.test(store) && /v68-complete-foundation/.test(store));
check("V68 D1 SQL import extractie aanwezig", /extractStateJsonFromAnyText/.test(store) && /previewImport/.test(store));
check("V68 State Doctor aanwezig", /buildStateDoctorReport/.test(store) && /no-weekend-hours/.test(store));
check("V68 recovery-lock aanwezig", /V68_LOCK_KEY/.test(store) && /setRecoveryLock/.test(store) && /clearRecoveryLock/.test(store));
check("V68 IO bevat analyse, diagnose en recovery-lock", /Analyseer import/.test(io) && /Download diagnose/.test(io) && /Recovery-lock aan/.test(io) && /\.sql/.test(io));
check("V68 server-side D1 guard blijft aanwezig", /assertNoCatastrophicOverwrite/.test(stateApi) && /overschrijven geblokkeerd/.test(stateApi));
check("V68 Gantt blijft centrale continue geometrie gebruiken", /function continuousBarGeometry/.test(gantt) && /data-v66-continuous-geometry="1"/.test(gantt));

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
  check("V68 fixture laadt 76 projecten", metrics.projectCount === 76 && st.projects.order.length === 76);
  check("V68 fixture bevat lange Zernike Gantt taken", (st.ganttV2.byProject["P-ZERNIKE-19158"]?.rows || []).some(r => r.name === "Productie") && metrics.ganttRowCount >= 35);
  const json = CWS.recovery.exportStateJson();
  const previewJson = CWS.recovery.previewImport(json);
  check("V68 previewImport accepteert state_json", previewJson.ok && previewJson.metrics.projectCount === 76);
  const sql = `INSERT INTO app_state (tenant_id,state_key,state_json,version) VALUES ('internal','main','${json.replaceAll("'", "''")}',1068);`;
  const previewSql = CWS.recovery.previewImport(sql);
  check("V68 previewImport accepteert D1 SQL-export tekst", previewSql.ok && previewSql.metrics.projectCount === 76 && previewSql.metrics.ganttRowCount >= 35);
  const doctor = CWS.recovery.buildStateDoctorReport();
  check("V68 state doctor geeft compleet rapport", doctor && Array.isArray(doctor.checks) && doctor.checks.length >= 6 && doctor.metrics.projectCount === 76);
  const lock = CWS.recovery.setRecoveryLock();
  check("V68 recovery-lock kan worden gezet", lock.ok && CWS.recovery.getRecoveryLock()?.locked === true);
  check("V68 recovery-lock kan worden gewist", CWS.recovery.clearRecoveryLock().ok && !CWS.recovery.getRecoveryLock());
}catch(error){
  console.error(error);
  check("V68 complete foundation runtime test", false);
}
if(!ok) process.exit(1);
