import fs from "node:fs";
import vm from "node:vm";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));
const settings = read("layers/laag10_instellingen.html");
const store = read("js/core/store.js");
const ui = read("js/core/ui.js");
const stateApi = read("functions/api/state.js");
const health = read("functions/api/health.js");
const server = read("playwright/server.js");
const index = read("index.html");

function check(label, ok) {
  if (!ok) throw new Error(`[preflight:v87] ${label}`);
  console.log(`OK - ${label}`);
}

check("package.json bevat preflight:v87", pkg.scripts?.["preflight:v87"] === "node scripts/v87-settings-department-delete-preflight.mjs");
check("health bevat internal-test-v87", health.includes("internal-test-v87") && health.includes("v87-lightweight-no-state-load"));
check("lokale server bevat local-test-v87", server.includes("local-test-v87") && server.includes("local-test-server-v87"));
check("UI/build marker staat op V87", index.includes("V87_SETTINGS_DEPARTMENT_DELETE_FIX"));
check("settings layer bevat delete handler voor afdelingen", settings.includes("removeUnusedDepartment") && settings.includes('moduleId==="afdelingen"') && settings.includes("onDelete"));
check("findDepartmentUsage helper bestaat", settings.includes("function findDepartmentUsage") && settings.includes("projects:[]") && settings.includes("ganttTasks:[]") && settings.includes("capacitySources:[]"));
check("gebruikte afdeling wordt geblokkeerd met duidelijke melding", settings.includes("Afdeling kan niet worden verwijderd omdat deze nog gebruikt wordt") && settings.includes("department_delete_blocked") && settings.includes("usage.total > 0"));
check("ongebruikte afdeling wordt via mutate opgeslagen", settings.includes('CWS.mutate ? CWS.mutate("department_delete"') && settings.includes("Afdeling verwijderd.") && settings.includes("settings.deletedDepartments"));
check("legacy departments registry wordt mee opgeschoond", settings.includes("delete draft.departments.byId") && settings.includes("draft.departments.order"));
check("normalizer voegt verwijderde afdeling niet direct opnieuw toe", store.includes("settings.deletedDepartments") && store.includes("deletedMatches") && store.includes("!options.explicit && deletedMatches"));
check("D1 chunked save/load blijft aanwezig", stateApi.includes("app_state_chunks") && stateApi.includes("X-CWS-Chunked-Manifest") && store.includes("loadChunkedRemoteStateBody"));
check("save guard settings-wijzigingen niet blokkeert", stateApi.includes("assertIncomingStateSafe") && stateApi.includes("looksLikeDemoOrEmpty") && !stateApi.includes("departmentDrop"));
check("mobiel/modal regels blijven aanwezig", settings.includes("width:min(1150px, 96vw)") && settings.includes("table-wrap") && ui.includes("tableWrap.className = 'table-wrap'"));

const context = {
  window: {
    addEventListener() {},
    location: { search: "" },
    CWS: {},
    localStorage: { getItem(){ return null; }, setItem(){}, removeItem(){} },
    UI: { toast(){} }
  },
  document: { addEventListener(){} },
  console,
  setTimeout,
  clearTimeout,
  fetch: async () => ({ ok:false, status:404, text:async()=>"", json:async()=>({}) }),
  URL,
  Blob
};
context.window.window = context.window;
context.window.document = context.document;
context.globalThis = context.window;
vm.createContext(context);
vm.runInContext(store, context, { filename:"store.js" });

const st = context.window.CWS.normalizeState({
  settings:{
    deletedDepartments:[{ name:"TEST VERWIJDEREN", code:"TV" }],
    tables:{ departments:[], employees:[] }
  },
  departments:{ order:["TEST VERWIJDEREN"], byId:{ "TEST VERWIJDEREN":{ id:"TEST VERWIJDEREN", name:"TEST VERWIJDEREN", code:"TV" } } },
  projects:{ order:[], byId:{}, deptHours:[] },
  ganttV2:{ byProject:{}, ui:{} },
  gantt:{ hoursByDay:{}, sourcesByDay:{} }
});
const rows = st.settings?.tables?.departments || [];
const registry = st.departments?.byId || {};
check("runtime normalizer houdt bewust verwijderde ongebruikte afdeling weg", !rows.some(r => String(r.name) === "TEST VERWIJDEREN") && !registry["TEST VERWIJDEREN"]);

console.log("[preflight:v87] settings department delete checks OK");
