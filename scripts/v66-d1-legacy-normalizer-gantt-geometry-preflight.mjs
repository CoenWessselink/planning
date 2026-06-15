import fs from 'node:fs';
import vm from 'node:vm';

const store = fs.readFileSync('js/core/store.js','utf8');
const gantt = fs.readFileSync('layers/laag4_gantt.html','utf8');
const health = fs.readFileSync('functions/api/health.js','utf8');
const pkg = fs.readFileSync('package.json','utf8');
let ok = true;
function check(name, pass){ console.log(`${pass ? 'OK' : 'FOUT'} - ${name}`); if(!pass) ok=false; }

check('V66 health marker aanwezig', /internal-test-v66/.test(health) && /v66-lightweight-no-state-load/.test(health));
check('V66 package script geregistreerd', /"preflight:v66"/.test(pkg));
check('V66 centrale Gantt-balkgeometrie aanwezig', /function continuousBarGeometry/.test(gantt) && /data-v66-continuous-geometry="1"/.test(gantt));
check('V66 drag gebruikt effectieve rowSchedule als basis', /const eff=rowSchedule\(model,row,rowIndex\)\|\|\{\}/.test(gantt));
check('V66 pointermove gebruikt continuousBarGeometry', /const geom=continuousBarGeometry\(row,sc,\{start:UI\.originStart,days:9999\},st\)/.test(gantt));
check('V66 dependencylijnen gebruiken effectiveScheduleMap', /const effectiveMap=effectiveScheduleMap\(model,state\(\)\)/.test(gantt));
check('V66 visuele balkbreedte vertrouwt stored end alleen bij passende werkdagenduur', /storedWorkdays===desiredWorkdays\s*\?\s*storedEnd\s*:\s*derivedEnd/.test(gantt) && /taskDurationForInteraction\(row, sc \|\| \{\}\)/.test(gantt));
check('V66 geen workday shell segment renderer', !/data-workday-shell="1"/.test(gantt) && !/segmentHtml=renderSegments/.test(gantt));

const legacy = {
  schemaVersion: 12,
  projects: { order:['P-LEG'], byId:{ 'P-LEG':{ id:'P-LEG', number:'19158', name:'Sportcentrum Zernike te Groningen', client:'Hegeman', status:'Ingepland', deptHours:{ Productie:100 } } } },
  ganttV2:{ expanded:{}, byProject:{ 'P-LEG':{ rows:[
    { id:'PH-1', name:'FASE 1', type:'summary', level:0, department:'Fase 1' },
    { id:'T-31', name:'Detailberekeningen ter controle', type:'task', level:1, parent:'PH-1', department:'Engineering', resourceId:'TSA', duration:31, colorKey:'c4', hoursMode:'auto' },
    { id:'T-100', name:'Productie', type:'task', level:1, parent:'PH-1', department:'Productie', resourceId:'Tasche', duration:100, colorKey:'c2', hoursMode:'auto' }
  ], sched:{ 'T-31':{start:'2026-06-08', end:'2026-06-08'}, 'T-100':{start:'2026-09-08', end:'2026-09-08'} } } }, ui:{} },
  gantt:{ hoursByDay:{}, sourcesByDay:{} },
  settings:{ tables:{ departments:[{name:'Engineering',active:true},{name:'Productie',active:true}], employees:[] } }
};
const raw = JSON.stringify(legacy);
const fakeLocalStorage = { getItem(k){ return k==='tenant:default:cws.state.snapshot.v12'?raw:null; }, setItem(){}, removeItem(){}, clear(){} };
const windowObj = { CWS:{}, UI:{ toast(){} }, addEventListener(){}, dispatchEvent(){} };
const ctx = { window:windowObj, localStorage:fakeLocalStorage, console, setTimeout, clearTimeout, Date, JSON, Math, Number, String, Object, Array, Boolean, parseFloat, encodeURIComponent, decodeURIComponent, URLSearchParams, fetch: async()=>({ok:false,json:async()=>({}),text:async()=>''}) };
ctx.window.window=ctx.window; ctx.window.localStorage=fakeLocalStorage;
vm.createContext(ctx);
try{
  vm.runInContext(store, ctx, {filename:'store.js', timeout:5000});
  const st = ctx.window.CWS.getState();
  const projectCount = st.projects.order.length;
  const rows = st.ganttV2.byProject['P-LEG']?.rows || [];
  const prod = rows.find(r=>r.id==='T-100');
  check('legacy D1 projects.order/byId blijft geladen', projectCount===1 && st.projects.byId['P-LEG']);
  check('legacy D1 ganttV2.byProject blijft geladen', rows.length===3);
  check('auto uren blijven SSOT projecturen, geen oude handmatige override', prod && prod.hoursMode==='auto' && prod.hours===0 && prod.hoursSource==='project-dept-hours');
}catch(e){ console.error(e); check('store boot met legacy D1 fixture', false); }

if(!ok) process.exit(1);
