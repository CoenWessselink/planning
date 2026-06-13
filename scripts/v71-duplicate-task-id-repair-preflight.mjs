import fs from "node:fs";
import vm from "node:vm";

const store = fs.readFileSync("js/core/store.js", "utf8");
const pkg = fs.readFileSync("package.json", "utf8");
let ok = true;
function check(label, pass){
  console.log(`${pass ? "OK" : "FAIL"} - ${label}`);
  if(!pass) ok = false;
}

check("V71 package script geregistreerd", /"preflight:v71"\s*:\s*"node scripts\/v71-duplicate-task-id-repair-preflight\.mjs"/.test(pkg));
check("V71 centrale duplicate-id repair aanwezig", /repairDuplicateGanttRowIds/.test(store) && /v71-duplicate-task-id-repair/.test(store));

const duplicateState = {
  schemaVersion: 12,
  projects: {
    order:["P-DUP"],
    byId:{"P-DUP":{id:"P-DUP", name:"Duplicate repair test", status:"Ingepland"}},
    deptHours:[{projectId:"P-DUP", deptId:"Engineering", hours:40}]
  },
  ganttV2:{
    expanded:{},
    ui:{},
    byProject:{
      "P-DUP":{
        rows:[
          {id:"PH", name:"Fase A", type:"summary", level:0, department:"Engineering"},
          {id:"T1", name:"Eerste taak", type:"task", level:1, parent:"PH", department:"Engineering", predecessor:""},
          {id:"PH", name:"Fase B", type:"summary", level:0, department:"Engineering"},
          {id:"T1", name:"Tweede taak", type:"task", level:1, parent:"PH", department:"Engineering", predecessor:"T1FS"},
          {id:"T2", name:"Vervolg", type:"task", level:1, parent:"PH", department:"Engineering", predecessor:"T1FS+2"}
        ],
        sched:{
          PH:{start:"2026-06-15", end:"2026-06-19"},
          T1:{start:"2026-06-15", end:"2026-06-19"},
          T2:{start:"2026-06-22", end:"2026-06-26"}
        }
      }
    }
  },
  gantt:{hoursByDay:{}, sourcesByDay:{}},
  settings:{tables:{departments:[{name:"Engineering", active:true}], employees:[]}}
};

const raw = JSON.stringify(duplicateState);
const fakeLocalStorage = {
  getItem(key){ return key === "tenant:default:cws.state.snapshot.v12" ? raw : null; },
  setItem(){},
  removeItem(){},
  clear(){}
};
const windowObj = { CWS:{}, UI:{toast(){}}, location:{search:""}, addEventListener(){}, dispatchEvent(){} };
const ctx = {
  window:windowObj,
  localStorage:fakeLocalStorage,
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
  fetch:async()=>({ok:false, json:async()=>({}), text:async()=>"", headers:{get(){return null;}}})
};
ctx.window.window = ctx.window;
ctx.window.localStorage = fakeLocalStorage;
vm.createContext(ctx);

try{
  vm.runInContext(store, ctx, {filename:"js/core/store.js", timeout:10000});
  const state = ctx.window.CWS.getState();
  const model = state.ganttV2.byProject["P-DUP"];
  const ids = model.rows.map(row => row.id);
  check("Eerste taak en fase behouden originele id", ids[0] === "PH" && ids[1] === "T1");
  check("Duplicaten krijgen stabiele unieke ids", ids[2] === "PH__dup2" && ids[3] === "T1__dup2" && new Set(ids).size === ids.length);
  check("Schedule wordt voor duplicaten gekopieerd", model.sched.PH__dup2?.start === model.sched.PH?.start && model.sched.T1__dup2?.end === model.sched.T1?.end);
  check("Parent volgt gerepareerde duplicate fase", model.rows[3].parent === "PH__dup2" && model.rows[4].parent === "PH__dup2");
  check("Voorganger volgt gerepareerde duplicate taak", model.rows[4].predecessor === "T1__dup2FS+2");
  check("Gerepareerde state valideert zonder dubbele taak-id", ctx.window.CWS.validateState(state).valid);

  const exported = JSON.parse(ctx.window.CWS.recovery.exportStateJson());
  const preview = ctx.window.CWS.recovery.previewImport(JSON.stringify(exported));
  const previewIds = preview.state.ganttV2.byProject["P-DUP"].rows.map(row => row.id);
  check("Repair is idempotent bij opnieuw normaliseren", JSON.stringify(previewIds) === JSON.stringify(ids));
}catch(error){
  console.error(error);
  check("V71 duplicate-id runtime test", false);
}

if(!ok) process.exit(1);
