/* CWS Planning - Persistent Store (Build 26) */
window.CWS = window.CWS || {};

(function(){
  const KEY_GLOBAL = "cws.state.snapshot.v12";
  const KEY_TENANT = "tenant:default:cws.state.snapshot.v12";
  const KEY_BACKUP = "tenant:default:cws.state.snapshot.v12.backup";
  const LEGACY_STATE_KEYS = ["cws.state.snapshot.v11", "cws.state.snapshot", "cwsPlanningState", "cws.state", "cws.planning.state"];
  const SCHEMA_VERSION = 12;
  const API_STATE = "/api/state";
  const API_HEALTH = "/api/health";

  const DEFAULT_ROLES = {
    admin:  { name:"Admin",  permissions:["*"] },
    planner:{ name:"Planner",permissions:["view_projects","edit_projects","view_planning","edit_planning","auto_plan","view_reports","audit_view"] },
    viewer: { name:"Viewer", permissions:["view_projects","view_planning","view_reports"] }
  };

  const deepClone = (x) => JSON.parse(JSON.stringify(x));
  const baseNum = (v) => {
    const n = (typeof v === 'number') ? v : parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  // V58 — Gantt urenbron hard gemaakt. Projecturen per afdeling zijn standaard de SSOT.
  // Alleen wanneer een taak expliciet op handmatige override staat, gebruikt Gantt taakuren.
  const ganttTaskHoursMode = (row) => {
    const mode = String(row?.hoursMode || row?.hoursSource || row?.allocationMode || '').trim().toLowerCase();
    if(mode === 'manual' || mode === 'handmatig' || mode === 'manual-override' || mode === 'task-hours') return 'manual';
    return 'auto';
  };
  const ganttTaskManualHours = (row) => Math.max(0, baseNum(row?.manualHours ?? row?.hours));
  const CWS_COLOR_MAP = { c1:"#2f6fbd", c2:"#16a34a", c3:"#f59e0b", c4:"#dc2626", c5:"#8b5cf6", c6:"#14b8a6", c7:"#f97316", c8:"#22c55e" };
  const CWS_COLOR_NAMES = { c1:"Blauw", c2:"Groen", c3:"Geel", c4:"Rood", c5:"Paars", c6:"Turquoise", c7:"Oranje", c8:"Lime" };
  const normalizeColorKey = (value, fallback="c1") => {
    const raw = String(value ?? "").trim();
    if(CWS_COLOR_MAP[raw]) return raw;
    const lower = raw.toLowerCase();
    const byName = Object.entries(CWS_COLOR_NAMES).find(([,name]) => String(name).toLowerCase() === lower);
    if(byName) return byName[0];
    const byHex = Object.entries(CWS_COLOR_MAP).find(([,hex]) => String(hex).toLowerCase() === lower);
    if(byHex) return byHex[0];
    return CWS_COLOR_MAP[fallback] ? fallback : "c1";
  };

  const defaultState = () => ({
    schemaVersion: SCHEMA_VERSION,
    meta: { dirty:false, updatedAt:null, lastAction:null },
    globalState: { auditLog:[] },
    sessionState: { filters:{}, selections:{}, scroll:{} },
    uiState: { modals:{}, focus:null },
    ui: {
      role: "Admin",
      lastApp: "projecten",
      lastTab: "Alle",
      week: { year: 2026, week: 15 },
      planView: "week",
      scroll: {}
    },
    user: { name: "Gebruiker", role: "admin", dept: "" },
    roles: deepClone(DEFAULT_ROLES),
    auditLog: [],
    projects: { order: [], byId: {} },
    resources: { order: [], byId: {} },
    tasks: { byProject: {} },
    allocations: { byWeek: {} },
    planbord: { byDeptWeek: {} },
    projectOverview: { notesByProject:{}, statusByProject:{} },
    projectPlanning: { byWeek:{}, columns:[] },
    transport: { vehicles:[], drivers:[], locations:[], trips:[] },
    capacity: { availabilityOverrides:{}, updatedAt:null },
    gantt: { hoursByDay:{}, sourcesByDay:{} },
    templates: { taskSets: [ { id:"default", name:"Standaard", phases:[] } ] },
    company: { name:"Tasche Staalbouw", logo:null },
    print: { gantt:{ paper:"A3 landscape", rangeRule:"one-week-before-first-task-one-week-after-last-task" }, capacity:{ paper:"A0 landscape", mode:"matrix" } },

    settings: {
      activeSection: "Accountinformatie",
      // CRUD datasets (editable via Instellingen)
      datasets: {
        users: { order: [], byId: {} },
        teams: { order: [], byId: {} },
        categories: { order: [], byId: {} },
        statuses: { order: [], byId: {} },
        labels: { order: [], byId: {} },
        integrations: { order: [], byId: {} },
        portalInvites: { order: [], byId: {} },
        notifications: { email:true, push:false },
        locale: { timezone:"Europe/Amsterdam", weekStart:1, dateFormat:"DD-MM-YYYY" }
      }
    },
    reports: { active: "cap_week", templates: [] },
    ganttV2: { expanded:{}, byProject:{}, ui:{ showCritical:false } }
  });

  const mergeDefaults = (target, defaults) => {
    const out = (target && typeof target === "object" && !Array.isArray(target)) ? target : {};
    Object.keys(defaults || {}).forEach(k => {
      const dv = defaults[k];
      const tv = out[k];
      if(tv === undefined || tv === null){
        out[k] = deepClone(dv);
      }else if(dv && typeof dv === "object" && !Array.isArray(dv) && tv && typeof tv === "object" && !Array.isArray(tv)){
        mergeDefaults(tv, dv);
      }
    });
    return out;
  };


  // Central department reconciliation.
  // SSOT rule: every department defined anywhere (Instellingen, legacy departments,
  // resources, Gantt/Capacity hour sources or imported project hours) must be available
  // as a project-hours column immediately. This prevents the Projecten screen from
  // showing only "Engineering" when settings/departments are stored in a newer path.
  const deptNorm = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const deptActive = (value) => {
    if(value === undefined || value === null || value === "") return true;
    if(value === false) return false;
    const v = String(value).trim().toLowerCase();
    return !(v === "false" || v === "nee" || v === "no" || v === "0" || v === "inactive" || v === "uit");
  };
  const deptRowName = (row) => String(row?.name ?? row?.afdeling ?? row?.Afdeling ?? row?.Naam ?? row?.dept ?? row?.department ?? row?.id ?? row?.code ?? "").trim();
  const deptRowCode = (row) => String(row?.code ?? row?.Code ?? row?.afdelingCode ?? row?.departmentCode ?? "").trim();
  const syncDepartments = (st) => {
    st.company = st.company && typeof st.company === "object" && !Array.isArray(st.company) ? st.company : {};
    st.company.name = (Array.isArray(st.settings?.tables?.company) && st.settings.tables.company[0]?.name) || st.company.name || "Tasche Staalbouw";
    st.company.logo = st.company.logo && typeof st.company.logo === "object" ? st.company.logo : null;
    st.print = st.print && typeof st.print === "object" && !Array.isArray(st.print) ? st.print : {};
    st.print.gantt = st.print.gantt && typeof st.print.gantt === "object" ? st.print.gantt : { paper:"A3 landscape", rangeRule:"one-week-before-first-task-one-week-after-last-task" };
    st.print.capacity = st.print.capacity && typeof st.print.capacity === "object" ? st.print.capacity : { paper:"A0 landscape", mode:"matrix" };
    st.settings = st.settings || {};
    st.settings.tables = st.settings.tables && typeof st.settings.tables === "object" ? st.settings.tables : {};
    st.settings.tables.departments = Array.isArray(st.settings.tables.departments) ? st.settings.tables.departments : [];
    st.settings.tables.afdelingen = Array.isArray(st.settings.tables.afdelingen) ? st.settings.tables.afdelingen : [];
    st.departments = st.departments || { order:[], byId:{} };
    st.departments.order = Array.isArray(st.departments.order) ? st.departments.order : [];
    st.departments.byId = st.departments.byId && typeof st.departments.byId === "object" ? st.departments.byId : {};

    const add = (raw, preferredId=null) => {
      const name = deptRowName(raw);
      const code = deptRowCode(raw);
      if(!name && !code) return null;
      if(!deptActive(raw?.active ?? raw?.actief ?? raw?.Actief ?? raw?.enabled)) return null;
      const displayName = name || code;
      const norm = deptNorm(displayName);
      let id = null;
      for(const did of st.departments.order){
        const d = st.departments.byId?.[did];
        if(!d) continue;
        if(deptNorm(d.name || did) === norm || (code && deptNorm(d.code || "") === deptNorm(code))){ id = did; break; }
      }
      if(!id){
        id = String(preferredId || raw?.id || displayName);
        if(!id.trim()) id = displayName;
        if(st.departments.byId[id] && deptNorm(st.departments.byId[id].name || id) !== norm){
          id = displayName;
        }
        if(!st.departments.order.includes(id)) st.departments.order.push(id);
      }
      st.departments.byId[id] = { ...(st.departments.byId[id] || {}), id, name:displayName, code:code || st.departments.byId[id]?.code || "", active:true };
      const tableHas = st.settings.tables.departments.some(r => deptNorm(deptRowName(r) || deptRowCode(r)) === norm || (code && deptNorm(deptRowCode(r)) === deptNorm(code)));
      if(!tableHas){
        st.settings.tables.departments.push({ name:displayName, code:code || String(displayName).slice(0,4).toUpperCase(), color:raw?.color || raw?.kleur || "#4B5563", active:true, source:raw?.source || "sync" });
      }
      return id;
    };

    // New canonical settings table + legacy Dutch alias.
    st.settings.tables.departments.forEach(r => add(r));
    st.settings.tables.afdelingen.forEach(r => add(r));

    // Legacy departments registry.
    [...new Set(st.departments.order.slice())].forEach(id => add({ id, ...(st.departments.byId[id] || {}), name:(st.departments.byId[id]?.name || id) }, id));

    // Resources/employees often carry the practical department names.
    (st.resources?.order || []).forEach(id => { const r = st.resources?.byId?.[id]; if(r?.dept) add({ name:r.dept, source:"resource" }); });
    (Array.isArray(st.settings.tables.employees) ? st.settings.tables.employees : []).forEach(e => { if(e?.dept) add({ name:e.dept, source:"employee" }); });

    // Project-hours rows and generated Gantt/capacity maps can introduce department keys.
    (Array.isArray(st.projects?.deptHours) ? st.projects.deptHours : []).forEach(r => { if(r?.deptId) add({ name:r.deptId, id:r.deptId, source:"project-hours" }, r.deptId); });
    Object.values(st.gantt?.hoursByDay || {}).forEach(byDept => Object.keys(byDept || {}).forEach(name => add({ name, source:"gantt-hours" })));

    // Gantt task phases imported from Excel/default models are also department phases.
    Object.values(st.tasks?.byProject || {}).forEach(model => (model?.phases || []).forEach(ph => { if(ph?.name) add({ name:ph.name, source:"task-phase" }); }));

    // Keep order unique and byId complete.
    st.departments.order = [...new Set(st.departments.order)].filter(id => st.departments.byId[id]);

    // Ensure every project has a deptHours object with all departments present as 0.
    (st.projects?.order || []).forEach(pid => {
      const p = st.projects?.byId?.[pid];
      if(!p) return;
      p.deptHours = p.deptHours && typeof p.deptHours === "object" && !Array.isArray(p.deptHours) ? p.deptHours : {};
      st.departments.order.forEach(did => { if(p.deptHours[did] == null) p.deptHours[did] = 0; });
    });
  };

  const stateHasBusinessData = (candidate) => {
    const st = candidate || {};
    return Boolean(
      (st.projects?.order || []).length ||
      Object.keys(st.projects?.byId || {}).length ||
      Object.keys(st.ganttV2?.byProject || {}).length ||
      Object.keys(st.tasks?.byProject || {}).length ||
      Object.keys(st.gantt?.hoursByDay || {}).length ||
      (Array.isArray(st.projects?.deptHours) && st.projects.deptHours.length)
    );
  };

  const readStateFromLocalKey = (key) => {
    try{
      const raw = localStorage.getItem(key);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return parsed;
    }catch(_){
      return null;
    }
  };

  const writeLocalSnapshot = (snapshot) => {
    try{
      const raw = JSON.stringify(snapshot);
      localStorage.setItem(KEY_GLOBAL, raw);
      localStorage.setItem(KEY_TENANT, raw);
      localStorage.setItem(KEY_BACKUP, raw);
    }catch(error){
      console.error("CWS local snapshot save failed", error);
    }
  };

  const load = () => {
    const keys = [KEY_TENANT, KEY_GLOBAL, KEY_BACKUP, ...LEGACY_STATE_KEYS];
    for(const key of keys){
      const st = readStateFromLocalKey(key);
      if(st) return normalizeState(st);
    }
    return normalizeState(defaultState());
  };

  const normalizeState = (st) => {
    // Hard reconcile against the full local schema. This is intentionally defensive,
    // because older D1 test rows may only contain a tiny partial object
    // ({schemaVersion, projects, settings, gantt, ...}) without ui/user/roles.
    st = mergeDefaults(st, defaultState());
    st.schemaVersion = SCHEMA_VERSION;
    st.meta = st.meta || { dirty:false, updatedAt:null, lastAction:null };
    st.globalState = st.globalState || { auditLog:[] };
    st.sessionState = st.sessionState || { filters:{}, selections:{}, scroll:{} };
    st.uiState = st.uiState || { modals:{}, focus:null };
    st.ui = st.ui || deepClone(defaultState().ui);
    st.ui.week = st.ui.week || { year:2026, week:15 };
    st.ui.scroll = st.ui.scroll || {};
    st.ui.role = st.ui.role || "Admin";
    st.ui.lastApp = st.ui.lastApp || "projecten";
    st.user = st.user || { name:"Gebruiker", role:"admin", dept:"" };
    st.user.name = st.user.name || "Gebruiker";
    st.user.role = st.user.role || "admin";
    st.roles = st.roles && typeof st.roles === "object" && !Array.isArray(st.roles) ? st.roles : deepClone(DEFAULT_ROLES);
    Object.entries(DEFAULT_ROLES).forEach(([roleId, role]) => {
      if(!st.roles[roleId]) st.roles[roleId] = deepClone(role);
    });
    st.auditLog = Array.isArray(st.auditLog) ? st.auditLog : [];
    st.globalState.auditLog = st.auditLog;
    st.projects = st.projects || { order:[], byId:{} };
    st.projects.order = Array.isArray(st.projects.order) ? [...new Set(st.projects.order)] : [];
    st.projects.byId = st.projects.byId && typeof st.projects.byId === "object" ? st.projects.byId : {};
    st.projects.deptHours = Array.isArray(st.projects.deptHours) ? st.projects.deptHours : [];
    st.resources = st.resources || { order:[], byId:{} };
    st.resources.order = Array.isArray(st.resources.order) ? [...new Set(st.resources.order)] : [];
    st.resources.byId = st.resources.byId && typeof st.resources.byId === "object" ? st.resources.byId : {};
    st.departments = st.departments || { order:[], byId:{} };
    st.departments.order = Array.isArray(st.departments.order) ? [...new Set(st.departments.order)] : [];
    st.departments.byId = st.departments.byId && typeof st.departments.byId === "object" ? st.departments.byId : {};
    st.settings = st.settings || {};
    st.settings.tables = st.settings.tables && typeof st.settings.tables === "object" ? st.settings.tables : {};
    st.settings.datasets = st.settings.datasets && typeof st.settings.datasets === "object" ? st.settings.datasets : {};
    st.company = st.company && typeof st.company === "object" && !Array.isArray(st.company) ? st.company : {};
    st.company.name = st.company.name || (Array.isArray(st.settings.tables.company) && st.settings.tables.company[0]?.name) || "Tasche Staalbouw";
    st.company.logo = st.company.logo && typeof st.company.logo === "object" ? st.company.logo : null;
    st.print = st.print && typeof st.print === "object" && !Array.isArray(st.print) ? st.print : {};
    st.print.gantt = st.print.gantt && typeof st.print.gantt === "object" ? st.print.gantt : { paper:"A3 landscape", rangeRule:"one-week-before-first-task-one-week-after-last-task" };
    st.print.capacity = st.print.capacity && typeof st.print.capacity === "object" ? st.print.capacity : { paper:"A0 landscape", mode:"matrix" };
    syncDepartments(st);
    st.allocations = st.allocations || { byWeek:{} };
    st.allocations.byWeek = st.allocations.byWeek && typeof st.allocations.byWeek === "object" ? st.allocations.byWeek : {};
    st.tasks = st.tasks || { byProject:{} };
    st.tasks.byProject = st.tasks.byProject && typeof st.tasks.byProject === "object" ? st.tasks.byProject : {};
    st.planbord = st.planbord || { byDeptWeek:{} };
    st.planbord.byDeptWeek = st.planbord.byDeptWeek && typeof st.planbord.byDeptWeek === "object" ? st.planbord.byDeptWeek : {};
    st.projectOverview = st.projectOverview || { notesByProject:{}, statusByProject:{} };
    st.projectOverview.notesByProject = st.projectOverview.notesByProject || {};
    st.projectOverview.statusByProject = st.projectOverview.statusByProject || {};
    st.projectOverview.progressByProject = st.projectOverview.progressByProject || {};
    st.projectOverview.feedbackByProject = st.projectOverview.feedbackByProject || {};
    st.projectOverview.updatedAtByProject = st.projectOverview.updatedAtByProject || {};
    st.projectOverview.taskProgressHistory = Array.isArray(st.projectOverview.taskProgressHistory) ? st.projectOverview.taskProgressHistory : [];
    st.projectPlanning = st.projectPlanning || { byWeek:{}, columns:[] };
    st.projectPlanning.byWeek = st.projectPlanning.byWeek || {};
    st.projectPlanning.columns = Array.isArray(st.projectPlanning.columns) ? st.projectPlanning.columns : [];
    st.transport = st.transport || { vehicles:[], drivers:[], locations:[], trips:[] };
    ["vehicles","drivers","locations","trips"].forEach(k => {
      st.transport[k] = Array.isArray(st.transport[k]) ? st.transport[k] : [];
    });
    st.capacity = st.capacity && typeof st.capacity === "object" && !Array.isArray(st.capacity) ? st.capacity : {};
    st.capacity.availabilityOverrides = st.capacity.availabilityOverrides && typeof st.capacity.availabilityOverrides === "object" && !Array.isArray(st.capacity.availabilityOverrides) ? st.capacity.availabilityOverrides : {};
    st.capacity.updatedAt = st.capacity.updatedAt || null;
    st.gantt = st.gantt || { hoursByDay:{}, sourcesByDay:{} };
    st.gantt.hoursByDay = st.gantt.hoursByDay || {};
    st.gantt.sourcesByDay = st.gantt.sourcesByDay || {};
    st.ganttV2 = st.ganttV2 || { expanded:{}, byProject:{}, ui:{ showCritical:false, showDeps:true, viewMode:"both", zoom:"week" } };
    st.ganttV2.expanded = st.ganttV2.expanded || {};
    st.ganttV2.byProject = st.ganttV2.byProject || {};
    st.ganttV2.ui = st.ganttV2.ui || { showCritical:false, showDeps:true, viewMode:"both", zoom:"week" };
    Object.values(st.ganttV2.byProject || {}).forEach(model => {
      if(!model || !Array.isArray(model.rows)) return;
      model.rows.forEach(row => {
        if(!row || row.type === "summary" || row.type === "phase") return;
        const legacyHours = Math.max(0, num(row.manualHours ?? row.hours));
        const mode = ganttTaskHoursMode(row);
        row.hoursMode = mode;
        row.hoursSource = mode === "manual" ? "manual" : "project-dept-hours";
        if(mode === "manual"){
          row.manualHours = legacyHours;
          row.hours = legacyHours;
        }else{
          row.manualHours = Math.max(0, num(row.manualHours || 0));
          row.hours = 0;
        }
      });
    });
    st.templates = st.templates || { taskSets: [ { id:"default", name:"Standaard", phases:[] } ] };
    st.templates.taskSets = Array.isArray(st.templates.taskSets) ? st.templates.taskSets : [];
    if(!st.templates.taskSets.length) st.templates.taskSets.push({ id:"default", name:"Standaard", phases:[] });
    st.templates.taskSets.forEach((set, setIndex) => {
      set.id = set.id || (setIndex === 0 ? "default" : `tpl_${setIndex+1}`);
      set.name = set.name || "Template";
      set.phases = Array.isArray(set.phases) ? set.phases : [];
      set.phases.forEach((phase, phaseIndex) => {
        phase.id = phase.id || `PH-${phaseIndex+1}`;
        phase.name = phase.name || `Fase ${phaseIndex+1}`;
        phase.colorKey = normalizeColorKey(phase.colorKey || phase.color || "c1");
        phase.color = phase.colorKey;
        phase.tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
        phase.tasks.forEach((task, taskIndex) => {
          task.id = task.id || `T-${taskIndex+1}`;
          task.name = task.name || "Taak";
          task.days = Math.max(1, Number(task.days || task.duration || 5) || 5);
          task.hours = Math.max(0, Number(task.hours || 0) || 0);
          task.colorKey = normalizeColorKey(task.colorKey || task.color || phase.colorKey || "c1");
          task.color = task.colorKey;
        });
      });
    });
    st.templates.activeTaskSetId = st.templates.activeTaskSetId || st.templates.taskSets.find(t=>String(t.id)==="default")?.id || st.templates.taskSets[0]?.id || "default";
    st.reports = st.reports || { active:"cap_week", templates:[] };
    return st;
  };

  let state = load();
  const subs = new Set();
  const undoStack = [];
  const redoStack = [];
  let lastValidation = { valid:true, errors:[] };
  let saveTimer = null;
  let privilegedMutation = false;
  let currentUser = { email:"local-dev@cws.test", role:state.user?.role || "admin" };
  let remoteVersion = 0;

  const storageStatus = {
    mode:"unknown",
    label:"Opslag detecteren...",
    unsynced:false,
    lastError:null,
    remoteVersion:0
  };

  const storageAdapter = {
    async detect(){
      try{
        const response = await fetch(API_HEALTH, { headers:{ "Accept":"application/json" } });
        const data = await response.json();
        if(response.ok && data?.ok){
          storageStatus.mode = "api";
          storageStatus.label = "Cloudflare D1 - gedeelde interne testdata";
          return "api";
        }
      }catch(_){}
      storageStatus.mode = "local";
      storageStatus.label = "Lokale browserdata - niet gedeeld";
      return "local";
    },
    async load(){
      if(storageStatus.mode !== "api") return { exists:false, state:null };

      // V57 compatibility marker: if(data.stateJson && typeof data.stateJson === "string"){ data.state = JSON.parse(data.stateJson); }
      // V60: request the large planning state as raw JSON body instead of a JSON
      // wrapper with stateJson. This prevents the Worker from stringifying a huge
      // wrapper object and solves the remaining 1102/503 state-load failures.
      const response = await fetch(`${API_STATE}?payload=raw-state`, {
        headers:{
          "Accept":"application/json",
          "X-CWS-State-Response":"raw-state"
        }
      });

      if(!response.ok){
        let message = `State laden mislukt (${response.status}).`;
        try{
          const err = await response.clone().json();
          if(err?.error) message = err.error;
        }catch(_){}
        throw new Error(message);
      }

      const exists = response.headers.get("X-CWS-State-Exists") === "1";
      const version = Number(response.headers.get("X-CWS-Version") || 0);
      remoteVersion = Number.isFinite(version) ? version : 0;
      storageStatus.remoteVersion = remoteVersion;

      const raw = exists ? await response.text() : "";
      let remoteState = null;
      if(exists && raw){
        try{
          remoteState = JSON.parse(raw);
        }catch(error){
          throw new Error(`D1-state is ongeldige JSON (${error.message}).`);
        }
      }

      return {
        ok:true,
        exists,
        version:remoteVersion,
        state:remoteState,
        bytes:Number(response.headers.get("X-CWS-Bytes") || raw.length || 0),
        user:{
          email:response.headers.get("X-CWS-User-Email") || "local-dev@cws.test",
          displayName:response.headers.get("X-CWS-User-Display-Name") || "",
          role:response.headers.get("X-CWS-User-Role") || "viewer",
          active:true
        },
        v60:{ rawStateResponse:true }
      };
    },
    async save(snapshot){
      if(storageStatus.mode !== "api") return { ok:true, local:true };
      // V60/V57: send the raw state JSON, not a wrapper object. This removes an extra
      // Worker-side JSON.parse(JSON.stringify(state)) pass and prevents 1102/503
      // resource-limit failures on larger planning datasets.
      const stateJson = JSON.stringify(snapshot);
      const response = await fetch(`${API_STATE}?baseVersion=${encodeURIComponent(String(remoteVersion))}&payload=raw-state`, {
        method:"PUT",
        headers:{
          "Content-Type":"application/json; charset=utf-8",
          "Accept":"application/json",
          "X-CWS-Base-Version":String(remoteVersion),
          "X-CWS-State-Payload":"raw-state"
        },
        body:stateJson
      });
      const data = await response.json().catch(()=>({}));
      if(response.status === 409){
        const err = new Error(data.error || "State is gewijzigd door een andere gebruiker.");
        err.status = 409;
        err.currentVersion = data.currentVersion;
        throw err;
      }
      if(!response.ok || !data.ok) throw new Error(data.error || `State opslaan mislukt (${response.status}).`);
      remoteVersion = Number(data.version || remoteVersion);
      storageStatus.remoteVersion = remoteVersion;
      storageStatus.label = "Cloudflare D1 - gedeelde interne testdata";
      return data;
    },
    async audit(action, metadata){
      if(storageStatus.mode !== "api") return;
      try{
        await fetch("/api/audit", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body:JSON.stringify({ action, metadata })
        });
      }catch(_){}
    }
  };

  const scheduleRemoteSave = () => {
    if(saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async()=>{
      try{
        await storageAdapter.save(deepClone(state));
        storageStatus.unsynced = false;
        storageStatus.lastError = null;
        state.meta.dirty = false;
      }catch(error){
        storageStatus.unsynced = true;
        storageStatus.lastError = error.message;
        if(error.status === 409){
          storageStatus.label = "D1 conflict - herladen nodig";
          try{ window.UI?.toast?.("Data is gewijzigd door een andere gebruiker. Herlaad om overschrijven te voorkomen."); }catch(_){}
        }else{
          try{ window.UI?.toast?.("Serveropslag niet bereikbaar - wijzigingen lokaal bewaard."); }catch(_){}
        }
      }
      notify();
    }, 350);
  };

  const validateState = (candidate=state) => {
    const errors = [];
    const st = candidate || {};
    if(Number(st.schemaVersion) !== SCHEMA_VERSION) errors.push("Ongeldige schemaVersion.");
    const order = st.projects?.order || [];
    const byId = st.projects?.byId || {};
    order.forEach(id => { if(!byId[id]) errors.push(`Project ${id} ontbreekt in byId.`); });
    Object.keys(byId).forEach(id => { if(!order.includes(id)) errors.push(`Project ${id} ontbreekt in order.`); });
    (st.projects?.deptHours || []).forEach((row, i) => {
      if(!byId[row.projectId]) errors.push(`Projecturen ${i}: onbekend projectId.`);
      const hours = Number(row.hours);
      if(!Number.isFinite(hours) || hours < 0) errors.push(`Projecturen ${i}: uren moeten >= 0 zijn.`);
    });
    Object.entries(st.allocations?.byWeek || {}).forEach(([week, rows]) => {
      if(!Array.isArray(rows)) return errors.push(`Toewijzingen ${week} zijn ongeldig.`);
      rows.forEach((row, i) => {
        if(!byId[row.projectId]) errors.push(`Toewijzing ${week}/${i}: onbekend projectId.`);
        if(row.resId && !st.resources?.byId?.[row.resId]) errors.push(`Toewijzing ${week}/${i}: onbekend resourceId.`);
        const hours = Number(row.hours);
        if(!Number.isFinite(hours) || hours < 0) errors.push(`Toewijzing ${week}/${i}: uren moeten >= 0 zijn.`);
      });
    });
    Object.entries(st.gantt?.hoursByDay || {}).forEach(([iso, depts]) => {
      if(getGlobalNonWorkISO(st, iso) && Object.values(depts || {}).some(v => Number(v) > 0)){
        errors.push(`Geplande uren op niet-werkbare dag ${iso}.`);
      }
      Object.entries(depts || {}).forEach(([dept, hours]) => {
        if(!Number.isFinite(Number(hours)) || Number(hours) < 0) errors.push(`Gantt ${iso}/${dept}: ongeldige uren.`);
      });
    });
    lastValidation = { valid:errors.length === 0, errors };
    return lastValidation;
  };

  const save = () => {
    const result = validateState(state);
    if(!result.valid){
      try{ window.UI?.toast?.("Opslaan geweigerd: " + result.errors[0]); }catch(_){}
      console.error("CWS state validation failed", result.errors);
      return false;
    }
    try{
      writeLocalSnapshot(state);
      if(storageStatus.mode === "api") scheduleRemoteSave();
      return true;
    }catch(error){
      console.error("CWS state save failed", error);
      return false;
    }
  };

  const notify = () => { subs.forEach(fn => { try{ fn(state); }catch(_){ } }); };

  const getState = () => state;

  const tenantProjection = (source) => {
    const clone = deepClone(source);
    delete clone.ui;
    delete clone.uiState;
    delete clone.sessionState;
    delete clone.meta;
    delete clone.globalState;
    delete clone.auditLog;
    return clone;
  };

  const viewerBlocked = (before, next) => {
    if(privilegedMutation || state.user?.role !== "viewer") return false;
    return JSON.stringify(tenantProjection(before)) !== JSON.stringify(tenantProjection(next));
  };

  const setState = (mutator) => {
    const before = deepClone(state);
    const draft = deepClone(state);
    const resultValue = mutator(draft);
    const next = resultValue && typeof resultValue === "object" && !Array.isArray(resultValue) ? resultValue : draft;
    normalizeState(next);
    rebuildGanttHoursByDay(next);
    if(viewerBlocked(before, next)){
      try{ window.UI?.toast?.("Viewer heeft alleen leesrechten."); }catch(_){}
      return state;
    }
    const result = validateState(next);
    if(!result.valid){
      try{ window.UI?.toast?.("Wijziging geweigerd: " + result.errors[0]); }catch(_){}
      return state;
    }
    if(JSON.stringify(tenantProjection(before)) !== JSON.stringify(tenantProjection(next))){
      undoStack.push(before);
      if(undoStack.length > 100) undoStack.shift();
      redoStack.length = 0;
    }
    state = next;
    state.meta.updatedAt = new Date().toISOString();
    if(!save()){ state = before; return state; }
    notify();
    return state;
  };

  const appendAudit = (target, action, meta={}) => {
    const entry = {
      ts:new Date().toISOString(),
      user:target.user?.name || "Gebruiker",
      role:target.user?.role || "unknown",
      action,
      meta
    };
    target.auditLog = Array.isArray(target.auditLog) ? target.auditLog : [];
    target.auditLog.push(entry);
    if(target.auditLog.length > 2000) target.auditLog = target.auditLog.slice(-2000);
    target.globalState = target.globalState || {};
    target.globalState.auditLog = target.auditLog;
  };

  const mutate = (action, payload, mutator) => {
    const fn = typeof payload === "function" ? payload : mutator;
    if(typeof fn !== "function") throw new Error("CWS.mutate vereist een mutatiefunctie.");
    const before = deepClone(state);
    const draft = deepClone(state);
    let resultValue;
    try{
      resultValue = fn(draft, payload);
    }catch(error){
      try{ window.UI?.toast?.("Wijziging geweigerd: " + error.message); }catch(_){}
      return { ok:false, errors:[error.message], state };
    }
    const next = resultValue && typeof resultValue === "object" && !Array.isArray(resultValue) ? resultValue : draft;
    normalizeState(next);
    rebuildGanttHoursByDay(next);
    if(viewerBlocked(before, next)){
      try{ window.UI?.toast?.("Viewer heeft alleen leesrechten."); }catch(_){}
      return { ok:false, errors:["Viewer heeft alleen leesrechten."], state };
    }
    next.meta.dirty = true;
    next.meta.lastAction = action;
    next.meta.updatedAt = new Date().toISOString();
    appendAudit(next, action, typeof payload === "function" ? {} : (payload || {}));
    const result = validateState(next);
    if(!result.valid){
      try{ window.UI?.toast?.("Wijziging geweigerd: " + result.errors[0]); }catch(_){}
      return { ok:false, errors:result.errors, state };
    }
    undoStack.push(before);
    if(undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    state = next;
    save();
    notify();
    storageAdapter.audit(action, typeof payload === "function" ? {} : (payload || {}));
    return { ok:true, state };
  };

  const restoreSnapshot = (source, target) => {
    if(!source.length) return false;
    target.push(deepClone(state));
    state = normalizeState(source.pop());
    rebuildGanttHoursByDay(state);
    state.meta.updatedAt = new Date().toISOString();
    save();
    notify();
    return true;
  };
  const undo = () => restoreSnapshot(undoStack, redoStack);
  const redo = () => restoreSnapshot(redoStack, undoStack);
  const canUndo = () => undoStack.length > 0;
  const canRedo = () => redoStack.length > 0;

  const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };

  const audit = (action, meta={}) => {
    try{
      appendAudit(state, action, { ...meta, actorEmail:currentUser.email });
      save();
      storageAdapter.audit(action, meta);
    }catch(_){}
  };

  // ----------------------------
  // Capacity engine (SSOT-safe)
  // ----------------------------
  // Employees define daily workable hours (Ma..Zo).
  // Department capacity is the sum of employee hours per day.
  // This becomes the single basis for:
  // - Instellingen > Afdelingen totals
  // - Laag 5 Capaciteit matrix (available vs planned)
  // Notes:
  // - If no employees table exists yet, we fall back to demo resources.

  const DAY_KEYS = ["ma","di","wo","do","vr","za","zo"]; // NL

  const num = baseNum;


  const getEmployees = (st) => {
    const rows = st?.settings?.tables?.employees;
    if(Array.isArray(rows) && rows.length) return rows;
    // fallback: derive from demo resources
    const res = st?.resources?.order?.map(id => st.resources.byId[id]).filter(Boolean) || [];
    return res.map(r => ({
      name: r.name,
      dept: r.dept || "",
      email: "",
      ma: num(r.daily), di: num(r.daily), wo: num(r.daily), do: num(r.daily), vr: num(r.daily),
      za: 0, zo: 0,
      active: true
    }));
  };

  const computeDeptCapacity = (st) => {
    const emps = getEmployees(st).filter(e => (e.active ?? true) !== false);
    const out = {}; // dept -> { ma..zo, week }
    for(const e of emps){
      const dept = (e.dept || "").trim() || "(Geen)";
      out[dept] = out[dept] || { ma:0,di:0,wo:0,do:0,vr:0,za:0,zo:0, week:0, count:0 };
      DAY_KEYS.forEach(k => { out[dept][k] += num(e[k]); });
      out[dept].count += 1;
    }
    Object.keys(out).forEach(dept => {
      out[dept].week = DAY_KEYS.reduce((s,k)=> s + out[dept][k], 0);
    });
    return out;
  };

  // Planned demand per dept per week key (YYYY-Www) from allocations + gantt distribution.
  const computePlannedWeekByDept = (st, wkKeyStr) => {
    const planned = {}; // dept -> hours
    const wk = parseWeekKey(wkKeyStr);
    if(!wk) return planned;
    const weekStart = isoWeekStartUTC(wk.year, wk.week);
    const start = isoDateUTC(weekStart);
    const end = isoDateUTC(addDaysUTC(weekStart, 6));
    Object.entries(st?.gantt?.hoursByDay || {}).forEach(([iso, depts]) => {
      if(iso < start || iso > end) return;
      Object.entries(depts || {}).forEach(([dept, hours]) => {
        planned[dept] = (planned[dept] || 0) + num(hours);
      });
    });
    return planned;
  };

  // --- Gantt distribution engine (Project -> DeptHours -> Union Workdays -> Week demand)
  const parseNLDateToUTC = (s) => {
    // "DD-MM-YYYY" -> Date (UTC midnight)
    if(!s || typeof s !== 'string') return null;
    const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if(!m) return null;
    const dd = Number(m[1]), mm = Number(m[2]) - 1, yy = Number(m[3]);
    return new Date(Date.UTC(yy, mm, dd));
  };
  const pad2 = (n) => String(n).padStart(2,'0');
  const isoDateUTC = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}-${pad2(d.getUTCDate())}`;
  const addDaysUTC = (d, n) => {
    const x = new Date(d.getTime());
    x.setUTCDate(x.getUTCDate() + n);
    return x;
  };
  const isoWeekStartUTC = (year, week) => {
    const simple = new Date(Date.UTC(year,0,1 + (week-1)*7));
    const dow = simple.getUTCDay();
    const ISOweekStart = new Date(simple);
    const diff = (dow<=4 ? 1-dow : 8-dow);
    ISOweekStart.setUTCDate(simple.getUTCDate() + diff);
    return ISOweekStart; // Monday
  };
  const parseWeekKey = (wkKeyStr) => {
    const m = String(wkKeyStr||'').match(/^(\d{4})-W(\d{1,2})$/);
    if(!m) return null;
    return { year: Number(m[1]), week: Number(m[2]) };
  };
  // ------------------------------
  // Global + per-employee calendars
  // ------------------------------
  const isoWeekdayUTC = (d) => {
    const dow = d.getUTCDay(); // 0=Sun..6=Sat
    return dow === 0 ? 7 : dow; // 1=Mon..7=Sun
  };

  const ensureCalendarModel = (st) => {
    st.settings = st.settings || {};
    st.settings.calendar = st.settings.calendar || {};
    const cal = st.settings.calendar;
    if(!cal.workweek){
      // V59: Gantt/Capaciteit mogen nooit op weekend plannen; standaard Ma-Vr werkbaar.
      cal.workweek = { 1:true,2:true,3:true,4:true,5:true,6:false,7:false };
    }
    if(!cal.overrides){ cal.overrides = {}; }
  };

  const getGlobalNonWorkISO = (st, iso) => {
    ensureCalendarModel(st);
    const cal = st.settings.calendar;
    const ov = cal.overrides?.[iso];
    if(typeof ov === 'boolean') return ov;
    const d = new Date(iso + 'T00:00:00Z');
    const wd = isoWeekdayUTC(d);
    if(wd === 6 || wd === 7) return true;
    const isWork = !!cal.workweek?.[wd];
    // backwards compat: settings.tables.calendar with isWorking=false
    const legacy = Array.isArray(st?.settings?.tables?.calendar) ? st.settings.tables.calendar : [];
    const hit = legacy.find(r => String(r?.date||'')===String(iso));
    if(hit && hit.isWorking === false) return true;
    return !isWork;
  };

  const isWorkdayUTC = (st, d) => {
    const iso = isoDateUTC(d);
    return !getGlobalNonWorkISO(st, iso);
  };

  const getEmployeeNonWorkISO = (emp, st, iso) => {
    if(!emp) return getGlobalNonWorkISO(st, iso);
    // global closure always wins
    if(getGlobalNonWorkISO(st, iso)) return true;
    // per-employee overrides/workweek
    const ov = emp.overrides?.[iso];
    if(typeof ov === 'boolean') return ov;
    const d = new Date(iso + 'T00:00:00Z');
    const wd = isoWeekdayUTC(d);
    const ww = emp.workweek || st.settings?.calendar?.workweek || {1:true,2:true,3:true,4:true,5:true,6:false,7:false};
    const isWork = !!ww[wd];
    return !isWork;
  };

  const computeDeptCapacityForWeek = (st, wkKeyStr) => {
    const wk = parseWeekKey(wkKeyStr);
    if(!wk) return { byDept:{}, total:0 };
    const ws = isoWeekStartUTC(wk.year, wk.week);
    const emps = getEmployees(st).filter(e => (e.active ?? true) !== false);
    const byDept = {};
    let total = 0;

    for(let i=0;i<7;i++){
      const d = addDaysUTC(ws, i);
      const iso = isoDateUTC(d);
      const wd = isoWeekdayUTC(d); // 1..7
      const dayKey = DAY_KEYS[wd-1];

      for(const e of emps){
        if(getEmployeeNonWorkISO(e, st, iso)) continue;
        const dept = (e.dept || '').trim() || '(Geen)';
        const h = num(e[dayKey]);
        if(h<=0) continue;
        byDept[dept] = (byDept[dept]||0) + h;
        total += h;
      }
    }
    return { byDept, total };
  };

  const getDeptWorkdaysSetForProject = (st, projectId, deptName) => {
    const out = new Set();
    const proj = st?.projects?.byId?.[projectId] || {};
    const base = parseNLDateToUTC(proj.start) || isoWeekStartUTC(st.ui?.week?.year||2026, st.ui?.week?.week||1);

    const g = st?.ganttV2?.byProject?.[projectId];
    if(!g) return out;
    const rows = Array.isArray(g.rows) ? g.rows : [];
    const sched = g.sched || {};

    const phaseById = {};
    rows.filter(r=>r.type==='phase' || r.type==='summary').forEach(ph=>{ phaseById[ph.id]=ph; });

    rows.filter(r=>r.type==='task').forEach(task=>{
      const rowIndex = rows.findIndex(r=>r.id===task.id);
      let ph = phaseById[task.parent];
      if(!ph){
        for(let i=rowIndex-1;i>=0;i--){
          if((rows[i].type==='phase' || rows[i].type==='summary') && Number(rows[i].level||0) < Number(task.level||1)){
            ph = rows[i];
            break;
          }
        }
      }
      const dept = (task.department || ph?.department || ph?.name || '').trim();
      if(!dept || dept !== deptName) return;
      const sc = sched[task.id];
      if(!sc) return;
      const d0 = sc.start ? new Date(sc.start+"T00:00:00Z") : addDaysUTC(base, Math.max(0, (Number(sc.s)||1)-1));
      const d1 = sc.end ? new Date(sc.end+"T00:00:00Z") : addDaysUTC(base, Math.max(0, (Number(sc.e)||Number(sc.s)||1)-1));
      let d = d0;
      while(d <= d1){
        if(isWorkdayUTC(st, d)) out.add(isoDateUTC(d));
        d = addDaysUTC(d, 1);
      }
    });
    return out;
  };

  function computeGanttDistributedHours(st, projectId, deptName, wkKeyStr) {
    // Total hours for this project+dept come from projects.deptHours array.
    const total = (st?.projects?.deptHours||[])
      .filter(r => r.projectId===projectId && (r.deptId||'(Geen)')===deptName)
      .reduce((s,r)=> s + num(r.hours), 0);
    if(total<=0) return 0;

    const daysSet = getDeptWorkdaysSetForProject(st, projectId, deptName);
    const allDays = daysSet.size;
    if(allDays<=0) return 0;

    const wk = parseWeekKey(wkKeyStr);
    if(!wk) return 0;
    const ws = isoWeekStartUTC(wk.year, wk.week);
    const we = addDaysUTC(ws, 6);
    let daysInWeek = 0;
    for(const iso of daysSet){
      if(iso >= isoDateUTC(ws) && iso <= isoDateUTC(we)) daysInWeek++;
    }
    const perDay = total / allDays;
    return perDay * daysInWeek;
  }

  // Recalculate derived fields so tables can show totals without special UI.
  const recalcDerivedCapacityFields = () => {
    try{
      setState(s => {
        s.settings = s.settings || {};
        s.settings.tables = s.settings.tables || {};
        const emps = Array.isArray(s.settings.tables.employees) ? s.settings.tables.employees : [];
        // employee totals
        emps.forEach(e => {
          e.totalWeek = DAY_KEYS.reduce((sum,k)=> sum + num(e[k]), 0);
        });
        // departments totals
        const caps = computeDeptCapacity(s);
        const deps = Array.isArray(s.settings.tables.departments) ? s.settings.tables.departments : [];
        deps.forEach(d => {
          const name = (d.name || d.dept || "").trim() || "(Geen)";
          const c = caps[name] || { ma:0,di:0,wo:0,do:0,vr:0,za:0,zo:0, week:0, count:0 };
          DAY_KEYS.forEach(k => { d[`cap_${k}`] = Math.round(c[k]*100)/100; });
          d.cap_week = Math.round(c.week*100)/100;
          d.emp_count = c.count;
        });
        return s;
      });
    }catch(e){ console.warn('recalcDerivedCapacityFields failed', e); }
  };

  // Expose helpers for layers (no imports needed).
  window.CWS.capacity = {
    DAY_KEYS,
    num,
    getEmployees: () => getEmployees(getState()),
    computeDeptCapacity: () => computeDeptCapacity(getState()),
    computeDeptCapacityForWeek: (wkKeyStr) => computeDeptCapacityForWeek(getState(), wkKeyStr),
    computePlannedWeekByDept: (wkKeyStr) => computePlannedWeekByDept(getState(), wkKeyStr),
    computeGanttDistributedHours: (projectId, deptName, wkKeyStr) => computeGanttDistributedHours(getState(), projectId, deptName, wkKeyStr),
    getAvailabilityOverrides: () => getState().capacity?.availabilityOverrides || {},
    setAvailabilityOverride: (dept, iso, hours, note="") => setState(s => {
      s.capacity = s.capacity || { availabilityOverrides:{} };
      s.capacity.availabilityOverrides = s.capacity.availabilityOverrides || {};
      const d = String(dept || "").trim();
      const day = String(iso || "").trim();
      if(!d || !day) return s;
      s.capacity.availabilityOverrides[d] = s.capacity.availabilityOverrides[d] || {};
      const h = Math.max(0, num(hours));
      const n = String(note || "").trim();
      s.capacity.availabilityOverrides[d][day] = { hours:h, note:n, updatedAt:new Date().toISOString() };
      s.capacity.updatedAt = new Date().toISOString();
      return s;
    }),
    removeAvailabilityOverride: (dept, iso) => setState(s => {
      const d = String(dept || "").trim();
      const day = String(iso || "").trim();
      if(s.capacity?.availabilityOverrides?.[d]?.[day]){
        delete s.capacity.availabilityOverrides[d][day];
        if(Object.keys(s.capacity.availabilityOverrides[d]).length===0) delete s.capacity.availabilityOverrides[d];
        s.capacity.updatedAt = new Date().toISOString();
      }
      return s;
    }),
    recalcDerivedCapacityFields
  };

  const hasPermission = (perm) => {
    const rid = state.user?.role || "viewer";
    const role = (state.roles||{})[rid] || {};
    const perms = role.permissions || [];
    if(perms.includes("*")) return true;
    return perms.includes(perm);
  };

  const setUserRole = (roleId) => {
    privilegedMutation = true;
    try{
      setState(s=>{
        s.roles = s.roles || deepClone(DEFAULT_ROLES);
        s.user = s.user || { name:"Gebruiker", role:"viewer", dept:"" };
        s.user.role = roleId;
        s.ui = s.ui || {};
        s.ui.role = (s.roles?.[roleId]?.name) || roleId;
        return s;
      });
    }finally{
      privilegedMutation = false;
    }
  };

  const clearAll = () => {
    audit("clear_data");
    localStorage.removeItem(KEY_TENANT);
    localStorage.removeItem(KEY_GLOBAL);
    state = defaultState();
    undoStack.length = 0;
    redoStack.length = 0;
    save();
    notify();
  };

  const resetDemo = () => {
    const st = defaultState();

    // Demo projects (match UI fields)
    const demoProjects = [
      { id:"P-1001", nr:"1001", name:"Nieuwbouw Hal A", client:"Van Dijk BV", status:"Ingepland", start:"15-04-2026" },
      { id:"P-1002", nr:"1002", name:"Machine Upgrade X", client:"De Groot Techniek", status:"In uitvoering", start:"02-05-2026" },
      { id:"P-1003", nr:"1003", name:"Offshore Platform Z", client:"Marinex BV", status:"Te plannen", start:"" },
      { id:"P-1004", nr:"1004", name:"Logistiek Centrum Y", client:"TransLogistics NV", status:"Gereed", start:"12-01-2026" },
      { id:"P-1005", nr:"1005", name:"Onderzoek Innovatiepark", client:"Wiersma Advies", status:"Te plannen", start:"" },
    ];
    demoProjects.forEach(p=>{ st.projects.order.push(p.id); st.projects.byId[p.id]=p; });

    // Demo resources (dept names used in filters)
    const demoRes = [
      { id:"R-01", name:"Rob Janssen",  dept:"Engineering",      daily:8 },
      { id:"R-02", name:"Eva Koopman",  dept:"Werkvoorbereiding",daily:8 },
      { id:"R-03", name:"Mark de Wit",  dept:"Productie",        daily:6 },
      { id:"R-04", name:"Sanne Vos",    dept:"Beheer",           daily:2 },
      { id:"R-05", name:"Tim Verbeek",  dept:"Engineering",      daily:2 },
      { id:"R-06", name:"Linda van der Meijs", dept:"Productie", daily:4 },
      { id:"R-07", name:"Paul Smit",    dept:"Werkvoorbereiding",daily:4 },
    ];
    demoRes.forEach(r=>{ st.resources.order.push(r.id); st.resources.byId[r.id]=r; });

    // Departments (derived from resources) + Projecturen per afdeling (enige bron voor benodigde uren)
    const deptNames = [...new Set(demoRes.map(r=>r.dept).filter(Boolean))];
    st.departments = st.departments || { byId:{}, order:[] };
    deptNames.forEach(name=>{ const id=String(name); st.departments.order.push(id); st.departments.byId[id]={ id, name }; });
    if(!st.departments.byId.Montage){
      st.departments.order.push("Montage");
      st.departments.byId.Montage = { id:"Montage", name:"Montage" };
    }
    st.projects.deptHours = [
      { projectId:'P-1001', deptId:'Engineering', hours:80, note:'' },
      { projectId:'P-1001', deptId:'Werkvoorbereiding', hours:40, note:'' },
      { projectId:'P-1001', deptId:'Productie', hours:60, note:'' },
      { projectId:'P-1001', deptId:'Montage', hours:20, note:'' },
      { projectId:'P-1002', deptId:'Engineering', hours:20, note:'' },
      { projectId:'P-1002', deptId:'Productie', hours:40, note:'' },
      { projectId:'P-1003', deptId:'Engineering', hours:10, note:'' },
      { projectId:'P-1004', deptId:'Productie', hours:30, note:'' },
      { projectId:'P-1005', deptId:'Werkvoorbereiding', hours:12, note:'' },
    ];
    // Precompute totals on projects
    const totals = {};
    st.projects.deptHours.forEach(r=>{ totals[r.projectId]=(totals[r.projectId]||0)+Number(r.hours||0); });
    st.projects.order.forEach(pid=>{ const p=st.projects.byId[pid]; if(p) p.needHours = totals[pid] || 0; });

    // V33: seed full Gantt V2 models so Gantt/Projectoverzicht/Capaciteit are testable immediately.
    st.ganttV2 = st.ganttV2 || { byProject:{}, ui:{} };
    const iso = (d)=>d;
    const makeModel = (pid, start, phases) => {
      const model = { rows:[], sched:{}, revisions:[] };
      let cursor = start;
      const addDaysLocal = (value, days) => {
        const dt = new Date(String(value).slice(0,10)+"T00:00:00Z");
        dt.setUTCDate(dt.getUTCDate()+days);
        return dt.toISOString().slice(0,10);
      };
      phases.forEach((ph, pi)=>{
        const sid = `${pid}-PH${pi+1}`;
        model.rows.push({ id:sid, name:ph.name, type:"summary", level:0, department:ph.dept||ph.name, resourceId:"", progress:ph.progress||0, status:ph.progress>=100?"Gereed":ph.progress>0?"In uitvoering":"Niet gestart", predecessor:"", locked:false, colorKey:ph.colorKey||`c${(pi%8)+1}`, hours:0, why:"", feedback:ph.feedback||"" });
        (ph.tasks||[]).forEach((t, ti)=>{
          const tid = `${pid}-T${pi+1}-${ti+1}`;
          const days = Math.max(1, Number(t.days||5));
          const startIso = t.start || cursor;
          const endIso = t.end || addDaysLocal(startIso, days-1);
          model.rows.push({ id:tid, name:t.name, type:"task", level:1, parent:sid, department:t.dept||ph.dept||ph.name, resourceId:t.resourceId||"", progress:Math.max(0,Math.min(100,Number(t.progress||0))), status:t.status || (Number(t.progress||0)>=100?"Gereed":Number(t.progress||0)>0?"In uitvoering":"Niet gestart"), predecessor:ti>0?`${pid}-T${pi+1}-${ti}FS`:"", locked:false, colorKey:t.colorKey||ph.colorKey||`c${(pi%8)+1}`, hours:Number(t.hours||0), why:t.why||"", feedback:t.feedback||"", progressUpdatedAt:new Date().toISOString() });
          model.sched[tid] = { start:startIso, end:endIso };
          cursor = addDaysLocal(endIso, 1);
        });
      });
      return model;
    };
    st.ganttV2.byProject["P-1001"] = makeModel("P-1001", "2026-04-15", [
      { name:"Engineering", dept:"Engineering", colorKey:"c1", progress:75, feedback:"Tekenwerk grotendeels gereed.", tasks:[
        { name:"Model / tekeningen", days:6, hours:40, progress:100, feedback:"Ter controle verstuurd." },
        { name:"Controle tekenwerk", days:4, hours:40, progress:50, feedback:"Wacht op opmerkingen opdrachtgever." }
      ]},
      { name:"Werkvoorbereiding", dept:"Werkvoorbereiding", colorKey:"c2", progress:40, tasks:[
        { name:"Inkoop en werkvoorbereiding", days:5, hours:40, progress:40, feedback:"Materiaal deels besteld." }
      ]},
      { name:"Productie", dept:"Productie", colorKey:"c7", progress:10, tasks:[
        { name:"Productie staal", days:8, hours:60, progress:10, feedback:"Start gepland." }
      ]},
      { name:"Montage", dept:"Montage", colorKey:"c5", progress:0, tasks:[
        { name:"Montage op locatie", days:4, hours:20, progress:0, feedback:"Nog niet gestart." }
      ]}
    ]);
    st.ganttV2.byProject["P-1002"] = makeModel("P-1002", "2026-05-02", [
      { name:"Engineering", dept:"Engineering", colorKey:"c1", progress:100, tasks:[{ name:"Engineering update", days:3, hours:20, progress:100, feedback:"Gereed." }]},
      { name:"Productie", dept:"Productie", colorKey:"c7", progress:35, tasks:[{ name:"Aanpassen machineframe", days:7, hours:40, progress:35, feedback:"In uitvoering." }]}
    ]);
    st.ganttV2.byProject["P-1003"] = makeModel("P-1003", "2026-05-18", [
      { name:"Engineering", dept:"Engineering", colorKey:"c1", progress:0, tasks:[{ name:"Voorstudie", days:5, hours:10, progress:0, feedback:"Nog niet gestart." }]}
    ]);

    st.templates.taskSets = [{ id:"default", name:"Standaard", phases:[
      { id:"ENG", name:"Engineering", colorKey:"c1", tasks:[{ id:"ENG-1", name:"Tekenwerk", days:5, hours:0, colorKey:"c1" },{ id:"ENG-2", name:"Controle tekenwerk", days:3, hours:0, colorKey:"c1" }]},
      { id:"WVB", name:"Werkvoorbereiding", colorKey:"c2", tasks:[{ id:"WVB-1", name:"Werkvoorbereiding", days:4, hours:0, colorKey:"c2" }]},
      { id:"PROD", name:"Productie", colorKey:"c7", tasks:[{ id:"PROD-1", name:"Productie", days:8, hours:0, colorKey:"c7" }]},
      { id:"MONT", name:"Montage", colorKey:"c5", tasks:[{ id:"MONT-1", name:"Montage", days:4, hours:0, colorKey:"c5" }]}
    ]}];


    // Demo tasks per project (used by Gantt to build rows)
    const mk = (id, name) => ({ id, name });
    // Phases are named as departments so capacity distribution can map tasks -> dept (SSOT rule)
    st.tasks.byProject["P-1001"] = { phases:[
      { id:"PH-E", name:"Engineering", tasks:[ mk("T1","Start engineering"), mk("T2","Model / tekeningen") ] },
      { id:"PH-W", name:"Werkvoorbereiding", tasks:[ mk("T3","Controle & revisie"), mk("T4","Vrijgave") ] },
      { id:"PH-P", name:"Productie", tasks:[ mk("T5","Productie") ] },
      { id:"PH-M", name:"Montage", tasks:[ mk("T6","Montage") ] },
    ]};

    // Demo allocations for week key used by planbord/capaciteit
    const wk = "2026-W15";
    st.allocations.byWeek[wk] = [
      { id:"A-01", projectId:"P-1001", resId:"R-01", day:1, hours:8 },
      { id:"A-02", projectId:"P-1001", resId:"R-05", day:2, hours:8 },
      { id:"A-03", projectId:"P-1002", resId:"R-02", day:2, hours:8 },
      { id:"A-04", projectId:"P-1002", resId:"R-03", day:3, hours:6 },
      { id:"A-05", projectId:"P-1004", resId:"R-06", day:4, hours:4 },
      { id:"A-06", projectId:"P-1005", resId:"R-07", day:5, hours:4 },
    ];
    st.projectPlanning.byWeek[wk] = st.projects.order.map((projectId, index) => ({
      id:`PP-${index+1}`,
      projectId,
      owner:index % 2 ? "Planner" : "Werkvoorbereiding",
      priority:index < 2 ? "Hoog" : "Normaal",
      note:""
    }));
    st.transport.vehicles = [
      { id:"V-01", name:"Bus 1", plate:"V-101-CW", capacity:"1.200 kg" },
      { id:"V-02", name:"Vrachtwagen", plate:"B-202-CW", capacity:"8.000 kg" }
    ];
    st.transport.drivers = [
      { id:"D-01", name:"Jan de Boer" },
      { id:"D-02", name:"Mila Smit" }
    ];
    st.transport.locations = [
      { id:"L-01", name:"CWS Werkplaats", address:"Industrieweg 1" },
      { id:"L-02", name:"Bouwplaats Hal A", address:"Havenstraat 20" }
    ];
    st.transport.trips = [
      { id:"TR-01", date:"2026-04-15", start:"08:00", end:"09:30", projectId:"P-1001", vehicleId:"V-01", driverId:"D-01", fromId:"L-01", toId:"L-02", minutes:90, status:"Gepland" }
    ];


    // Demo settings datasets
    st.settings = st.settings || { activeSection:"Accountinformatie", datasets:{}, tables:{} };
    st.settings.tables = st.settings.tables || {};
    st.settings.sections = [
      { name:"Accountinformatie", hint:"Beheer profiel en beveiliging.", items:[{ id:"profiel", title:"Profiel", desc:"Naam, contactgegevens, handtekening.", icon:"👤" },{ id:"beveiliging", title:"Beveiliging", desc:"Wachtwoord, 2FA, sessies.", icon:"🔒" }]},
      { name:"Organisatie", hint:"Bedrijfsdata, afdelingen en rechten.", items:[{ id:"bedrijf", title:"Bedrijf", desc:"Naam, adres, logo en printgegevens.", icon:"🏢" },{ id:"afdelingen", title:"Afdelingen", desc:"Afdelingen, kleuren, capaciteit.", icon:"🏷️" },{ id:"rollen", title:"Rollen & rechten", desc:"Admin/Planner/Viewer rechten.", icon:"🧩" }]},
      { name:"Resources & Capaciteit", hint:"Werknemers, werkweken en kalenders.", items:[{ id:"werknemers", title:"Werknemers", desc:"Medewerkers, skills, werkweek.", icon:"👷" },{ id:"kalender", title:"Niet-werkbare dagen", desc:"Werkdag/Niet-werkdag per weekdag.", icon:"🗓️" },{ id:"capaciteit", title:"Capaciteit", desc:"Uurtypen, targets, overuren.", icon:"⏱️" }]},
      { name:"Planning & Projectdefinities", hint:"Projectfasen, statussen, kolommen.", items:[{ id:"fasen", title:"Fasen & taken", desc:"Standaard fasen/taken, templates.", icon:"🧱" },{ id:"statussen", title:"Status & voortgang", desc:"Labels, kleuren, workflow.", icon:"🚦" },{ id:"kolommen", title:"Kolommenbeheer", desc:"Zichtbaarheid per module.", icon:"📐" }]},
      { name:"Systeem & Data", hint:"Import/Export, audit en integraties.", items:[{ id:"io", title:"Import/Export", desc:"Excel/CSV, mapping, validatie.", icon:"📥" },{ id:"audit", title:"Auditlog", desc:"Wijzigingen, gebruikers, tijd.", icon:"🧾" },{ id:"integraties", title:"Integraties", desc:"API, webhooks, koppelingen.", icon:"🔌" }]}
    ];
    st.settings.tables.company = [{ name:"Tasche Staalbouw", kvk:"", btw:"", street:"", zip:"", city:"Albergen", country:"NL", email:"info@tasche.nl", phone:"", website:"" }];
    st.company = st.company || {};
    st.company.name = "Tasche Staalbouw";
    st.settings.datasets = st.settings.datasets || {};
    const ds = st.settings.datasets;

    // Users (for Instellingen > Gebruikers)
    ds.users = { order: [], byId: {} };
    const demoUsers = [
      { id:"U-01", name:"Admin", email:"admin@cws.local", role:"admin", dept:"" },
      { id:"U-02", name:"Planner", email:"planner@cws.local", role:"planner", dept:"Engineering" },
      { id:"U-03", name:"Viewer", email:"viewer@cws.local", role:"viewer", dept:"" }
    ];
    demoUsers.forEach(u=>{ ds.users.order.push(u.id); ds.users.byId[u.id]=u; });

    // Teams
    ds.teams = { order: [], byId: {} };
    const demoTeams = [
      { id:"T-ENG", name:"Engineering", lead:"U-02" },
      { id:"T-WVB", name:"Werkvoorbereiding", lead:"U-01" },
      { id:"T-PROD", name:"Productie", lead:"U-01" }
    ];
    demoTeams.forEach(t=>{ ds.teams.order.push(t.id); ds.teams.byId[t.id]=t; });

    // Statuses / labels
    ds.statuses = { order: [], byId: {} };
    const demoStatuses = [
      { id:"S-TP", name:"Te plannen", color:"#f59e0b" },
      { id:"S-IN", name:"Ingepland", color:"#22c55e" },
      { id:"S-UIT", name:"In uitvoering", color:"#3b82f6" },
      { id:"S-GER", name:"Gereed", color:"#10b981" }
    ];
    demoStatuses.forEach(x=>{ ds.statuses.order.push(x.id); ds.statuses.byId[x.id]=x; });

    ds.labels = { order: [], byId: {} };
    const demoLabels = [
      { id:"L-PRIO", name:"Prioriteit", color:"#ef4444" },
      { id:"L-RISK", name:"Risico", color:"#a855f7" }
    ];
    demoLabels.forEach(x=>{ ds.labels.order.push(x.id); ds.labels.byId[x.id]=x; });

    // Categories
    ds.categories = { order: [], byId: {} };
    const demoCats = [
      { id:"C-BW", name:"Bouw", code:"BW" },
      { id:"C-ON", name:"Onderhoud", code:"ON" }
    ];
    demoCats.forEach(x=>{ ds.categories.order.push(x.id); ds.categories.byId[x.id]=x; });

    // Integrations / portal
    ds.integrations = { order: [], byId: {} };
    ds.portalInvites = { order: [], byId: {} };

    // Ensure derived capacity fields are present for tables (dept totals, employee totals)
    try{
      st.settings = st.settings || {};
      st.settings.tables = st.settings.tables || {};
      // seed employees table from resources once if empty
      if(!Array.isArray(st.settings.tables.employees) || st.settings.tables.employees.length===0){
        st.settings.tables.employees = (st.resources?.order||[]).map(id=>{
          const r = st.resources.byId[id] || {};
          const daily = Number(r.daily||0);
          return { name:r.name||id, dept:r.dept||"", email:"", ma:daily, di:daily, wo:daily, do:daily, vr:daily, za:0, zo:0, totalWeek: daily*5, active:true };
        });
      }
      // seed departments table from derived department list if empty
      if(!Array.isArray(st.settings.tables.departments) || st.settings.tables.departments.length===0){
        const names = [...new Set((st.resources?.order||[]).map(id=>st.resources?.byId?.[id]?.dept).filter(Boolean))];
        st.settings.tables.departments = names.map(n=>({ name:n, code:n.slice(0,4).toUpperCase(), color:"#4B5563", active:true }));
      }
      // compute totals
      const caps = (function(){
        const emps = (st.settings.tables.employees||[]).filter(e => (e.active ?? true) !== false);
        const out={};
        for(const e of emps){
          const dept=(e.dept||"").trim()||"(Geen)";
          out[dept]=out[dept]||{ ma:0,di:0,wo:0,do:0,vr:0,za:0,zo:0, week:0, count:0 };
          DAY_KEYS.forEach(k=>{ out[dept][k]+=num(e[k]); });
          out[dept].count += 1;
        }
        Object.keys(out).forEach(d=>{ out[d].week = DAY_KEYS.reduce((s,k)=>s+out[d][k],0); });
        return out;
      })();
      (st.settings.tables.employees||[]).forEach(e=>{ e.totalWeek = DAY_KEYS.reduce((s,k)=>s+num(e[k]),0); });
      (st.settings.tables.departments||[]).forEach(d=>{
        const name=(d.name||d.dept||"").trim()||"(Geen)";
        const c=caps[name]||{ma:0,di:0,wo:0,do:0,vr:0,za:0,zo:0,week:0,count:0};
        DAY_KEYS.forEach(k=>{ d[`cap_${k}`]=Math.round(c[k]*100)/100; });
        d.cap_week=Math.round(c.week*100)/100;
        d.emp_count=c.count;
      });
    }catch(e){ }

    state = st;
    normalizeState(state);
    rebuildGanttHoursByDay(state);
    undoStack.length = 0;
    redoStack.length = 0;
    save();
    notify();
    audit("reset_demo");
  };

  const getTaskWorkdays = (st, startIso, endIso) => {
    const out = [];
    if(!startIso || !endIso) return out;
    let d0 = new Date(String(startIso).slice(0,10) + "T00:00:00Z");
    let d1 = new Date(String(endIso).slice(0,10) + "T00:00:00Z");
    if(!Number.isFinite(d0.getTime()) || !Number.isFinite(d1.getTime())) return out;
    if(d1 < d0){ const t=d0; d0=d1; d1=t; }
    let d = d0;
    while(d <= d1){
      if(isWorkdayUTC(st, d)){
        const iso = isoDateUTC(d);
        if(!getGlobalNonWorkISO(st, iso)) out.push(iso);
      }
      d = addDaysUTC(d, 1);
    }
    return out;
  };

  // V59 — Gantt plant uitsluitend op werkbare dagen.
  // Weekenden en niet-werkbare dagen blijven zichtbaar in de kalender, maar taakdata en capaciteit worden gecorrigeerd.
  const nextGanttWorkIso = (st, iso) => {
    let d = new Date(String(iso || isoDateUTC(new Date())).slice(0,10) + "T00:00:00Z");
    if(!Number.isFinite(d.getTime())) d = new Date();
    for(let i=0;i<900;i++){
      const out = isoDateUTC(d);
      if(!getGlobalNonWorkISO(st, out)) return out;
      d = addDaysUTC(d, 1);
    }
    return isoDateUTC(d);
  };

  const previousGanttWorkIso = (st, iso) => {
    let d = new Date(String(iso || isoDateUTC(new Date())).slice(0,10) + "T00:00:00Z");
    if(!Number.isFinite(d.getTime())) d = new Date();
    for(let i=0;i<900;i++){
      const out = isoDateUTC(d);
      if(!getGlobalNonWorkISO(st, out)) return out;
      d = addDaysUTC(d, -1);
    }
    return isoDateUTC(d);
  };

  const addGanttWorkdays = (st, startIso, workdays) => {
    const total = Math.max(1, Number(workdays)||1);
    let iso = nextGanttWorkIso(st, startIso);
    let count = 1;
    while(count < total){
      iso = nextGanttWorkIso(st, isoDateUTC(addDaysUTC(new Date(iso + "T00:00:00Z"), 1)));
      count += 1;
    }
    return iso;
  };

  const normalizeGanttScheduleRange = (st, startIso, endIso, preferredWorkdays=null) => {
    const start = nextGanttWorkIso(st, startIso || endIso || isoDateUTC(new Date()));
    let days = Number(preferredWorkdays);
    if(!Number.isFinite(days) || days < 1){
      const existing = getTaskWorkdays(st, startIso, endIso);
      days = Math.max(1, existing.length || 1);
    }
    return { start, end:addGanttWorkdays(st, start, days), workdays:days };
  };

  const normalizeGanttModelSchedules = (st, model) => {
    if(!model || !Array.isArray(model.rows)) return model || { rows:[], sched:{} };
    model.sched = model.sched && typeof model.sched === "object" ? model.sched : {};
    model.rows.forEach(row => {
      if(!row || row.type === "summary" || row.type === "phase") return;
      const sc = model.sched[row.id] || {};
      const preferred = Math.max(1, baseNum(row.duration || row.days || row.duur) || (sc.start && sc.end ? Math.max(1, Math.round((new Date(String(sc.end).slice(0,10)+"T00:00:00Z") - new Date(String(sc.start).slice(0,10)+"T00:00:00Z"))/86400000) + 1) : 1));
      const fixed = normalizeGanttScheduleRange(st, sc.start, sc.end, preferred);
      model.sched[row.id] = { ...sc, start:fixed.start, end:fixed.end };
      row.duration = fixed.workdays;
    });
    return model;
  };

  const getProjectDeptHoursTotal = (st, projectId, deptName) => {
    const dept = String(deptName || "(Geen)").trim() || "(Geen)";
    const p = st?.projects?.byId?.[projectId] || {};
    let total = 0;

    (Array.isArray(st?.projects?.deptHours) ? st.projects.deptHours : []).forEach(row => {
      if(String(row?.projectId || row?.project || "") !== String(projectId)) return;
      const rd = String(row?.deptId || row?.dept || row?.department || "(Geen)").trim() || "(Geen)";
      if(rd === dept) total += Math.max(0, num(row?.hours));
    });

    if(total <= 0 && p.deptHours && typeof p.deptHours === "object"){
      total = Math.max(0, num(p.deptHours[dept]));
    }
    if(total <= 0 && p.requiredDeptHours && typeof p.requiredDeptHours === "object"){
      total = Math.max(0, num(p.requiredDeptHours[dept]));
    }
    return Math.round(total * 1000000) / 1000000;
  };

  const getGanttTaskGroups = (st) => {
    const groups = new Map();
    const byProject = st?.ganttV2?.byProject || {};
    Object.entries(byProject).forEach(([projectId, model]) => {
      const rows = Array.isArray(model?.rows) ? model.rows : [];
      const sched = model?.sched || {};
      rows.forEach((row, index) => {
        if(!row || row.type === "summary" || row.type === "phase") return;
        const sc = sched[row.id] || {};
        if(!sc.start || !sc.end) return;
        const dept = String(row.department || row.dept || row.afdeling || "(Geen)").trim() || "(Geen)";
        const days = getTaskWorkdays(st, sc.start, sc.end);
        if(!days.length) return;
        const key = `${projectId}|${dept}`;
        if(!groups.has(key)) groups.set(key, { projectId, dept, tasks:[] });
        groups.get(key).tasks.push({
          row,
          index,
          start: String(sc.start).slice(0,10),
          end: String(sc.end).slice(0,10),
          days,
          hoursMode: ganttTaskHoursMode(row),
          explicitHours: ganttTaskHoursMode(row) === "manual" ? ganttTaskManualHours(row) : 0,
          weight: Math.max(1, Number(row.allocationWeight || row.weight || days.length) || days.length || 1)
        });
      });
    });
    return Array.from(groups.values());
  };

  const ganttHoursSignature = (gantt={}) => JSON.stringify({
    hoursByDay:gantt.hoursByDay || {},
    sourcesByDay:gantt.sourcesByDay || {},
    allocationRule:gantt.allocationRule || ""
  });

  const rebuildGanttHoursByDay = (target=state) => {
    normalizeState(target);
    target.gantt = target.gantt || { hoursByDay:{}, sourcesByDay:{} };

    const previousSignature = ganttHoursSignature(target.gantt);
    const hoursByDay = {};
    const sourcesByDay = {};
    const taskGroups = getGanttTaskGroups(target);

    taskGroups.forEach(group => {
      const projectTotal = getProjectDeptHoursTotal(target, group.projectId, group.dept);
      const explicitSum = group.tasks.reduce((sum, t) => sum + (t.hoursMode === "manual" ? t.explicitHours : 0), 0);
      const tasksWithoutExplicit = group.tasks.filter(t => t.hoursMode !== "manual");
      const allWeight = group.tasks.reduce((sum, t) => sum + t.weight, 0) || group.tasks.length || 1;
      const emptyWeight = tasksWithoutExplicit.reduce((sum, t) => sum + t.weight, 0) || tasksWithoutExplicit.length || 1;

      group.tasks.forEach(task => {
        let taskHours = 0;
        let allocationMode = "none";

        if(task.hoursMode === "manual"){
          taskHours = task.explicitHours;
          allocationMode = "manual-override";
        }else if(projectTotal > 0 && tasksWithoutExplicit.length){
          const remaining = Math.max(0, projectTotal - explicitSum);
          taskHours = remaining > 0 ? remaining * (task.weight / emptyWeight) : 0;
          allocationMode = "project-dept-hours-auto";
        }else if(projectTotal > 0 && explicitSum <= 0){
          taskHours = projectTotal * (task.weight / allWeight);
          allocationMode = "project-dept-hours-auto";
        }

        taskHours = Math.round(taskHours * 1000000) / 1000000;
        if(taskHours <= 0 || !task.days.length) return;
        const perDay = Math.round((taskHours / task.days.length) * 1000000) / 1000000;

        task.days.forEach(iso => {
          if(getGlobalNonWorkISO(target, iso)) return;
          hoursByDay[iso] = hoursByDay[iso] || {};
          hoursByDay[iso][group.dept] = Math.round(((hoursByDay[iso][group.dept] || 0) + perDay) * 1000000) / 1000000;
          sourcesByDay[iso] = sourcesByDay[iso] || {};
          sourcesByDay[iso][group.dept] = sourcesByDay[iso][group.dept] || [];
          sourcesByDay[iso][group.dept].push({
            projectId: group.projectId,
            taskId: task.row.id,
            rowId: task.row.id,
            taskName: task.row.name || task.row.id,
            phaseId: task.row.parent || "",
            resourceId: task.row.resourceId || "",
            start: task.start,
            end: task.end,
            dept: group.dept,
            hours: perDay,
            taskHours,
            projectDeptHoursTotal: projectTotal,
            manualOverrideHours: task.hoursMode === "manual" ? task.explicitHours : 0,
            workdays: task.days.length,
            allocationMode,
            hoursSource: task.hoursMode === "manual" ? "manual-override" : "project-dept-hours"
          });
        });
      });
    });

    const validation = taskGroups.map(group => {
      const projectTotal = getProjectDeptHoursTotal(target, group.projectId, group.dept);
      const plannedTotal = group.tasks.reduce((sum, task) => {
        if(task.hoursMode === "manual") return sum + task.explicitHours;
        return sum;
      }, 0);
      return { projectId:group.projectId, dept:group.dept, projectDeptHours:projectTotal, manualOverrideHours:plannedTotal, hasManualOverride:plannedTotal > 0 };
    });
    target.gantt.hoursByDay = hoursByDay;
    target.gantt.sourcesByDay = sourcesByDay;
    target.gantt.projectDeptHoursValidation = validation;
    target.gantt.allocationRule = "v58-project-dept-hours-ssot-manual-override-only-explicit|v59-working-days-only";
    const nextSignature = ganttHoursSignature(target.gantt);
    if(previousSignature !== nextSignature || !target.gantt.recalculatedAt){
      target.gantt.recalculatedAt = new Date().toISOString();
      target.gantt.autoRecalculated = true;
    }
    return target.gantt;
  };

  const recalculateGanttHoursIfChanged = () => {
    const before = ganttHoursSignature(state.gantt || { hoursByDay:{}, sourcesByDay:{} });
    const next = deepClone(state);
    rebuildGanttHoursByDay(next);
    const after = ganttHoursSignature(next.gantt || { hoursByDay:{}, sourcesByDay:{} });
    if(before === after){
      return { changed:false, state, gantt:state.gantt };
    }
    const updated = setState(() => next);
    return { changed:true, state:updated, gantt:updated.gantt };
  };

  const ganttApi = {
    getProjectGantt(projectId){
      return deepClone(state.ganttV2?.byProject?.[projectId] || { rows:[], sched:{} });
    },
    saveProjectGantt(projectId, model){
      return mutate("gantt_save", { projectId }, draft => {
        draft.ganttV2 = draft.ganttV2 || { byProject:{}, ui:{} };
        draft.ganttV2.byProject = draft.ganttV2.byProject || {};
        draft.ganttV2.byProject[projectId] = normalizeGanttModelSchedules(draft, deepClone(model));
        rebuildGanttHoursByDay(draft);
      });
    },
    generatePhases(projectId){
      return mutate("gantt_generate_phases", { projectId }, draft => {
        draft.ganttV2 = draft.ganttV2 || { byProject:{}, ui:{} };
        draft.ganttV2.byProject = draft.ganttV2.byProject || {};
        const project = draft.projects?.byId?.[projectId];
        if(!project) throw new Error("Project niet gevonden.");
        const base = parseNLDateToUTC(project.start) || new Date();
        let cursorIso = nextGanttWorkIso(draft, isoDateUTC(base));
        const pack = draft.tasks?.byProject?.[projectId];
        const phases = pack?.phases?.length ? pack.phases : [{ id:"PH-1", name:"Engineering", tasks:[{id:"T-1",name:"Voorbereiding"},{id:"T-2",name:"Uitvoering"}] }];
        const model = { rows:[], sched:{} };
        let day = 0;
        phases.forEach(phase => {
          model.rows.push({ id:`${projectId}-${phase.id}`, name:phase.name, type:"summary", level:0, department:phase.name, progress:0, predecessor:"", locked:false });
          (phase.tasks || []).forEach((task, index) => {
            const id = `${projectId}-${task.id}`;
            const start = cursorIso;
            const end = addGanttWorkdays(draft, start, 5);
            model.rows.push({ id, name:task.name, type:"task", level:1, department:phase.name, progress:0, predecessor:index ? `${projectId}-${phase.tasks[index-1].id}FS` : "", locked:false, hoursMode:"auto", hoursSource:"project-dept-hours", hours:0, manualHours:0 });
            model.sched[id] = { start, end };
            cursorIso = nextGanttWorkIso(draft, isoDateUTC(addDaysUTC(new Date(end + "T00:00:00Z"), 1)));
            day += 5;
          });
        });
        draft.ganttV2.byProject[projectId] = model;
        rebuildGanttHoursByDay(draft);
      });
    },
    recalculateHours(){
      return recalculateGanttHoursIfChanged();
    },
    validateDependencies(projectId){
      const model = state.ganttV2?.byProject?.[projectId] || { rows:[] };
      const ids = new Set(model.rows.map(row=>row.id));
      const errors = [];
      model.rows.forEach(row => {
        const predecessor = String(row.predecessor || "").trim();
        if(!predecessor) return;
        const match = predecessor.match(/^(.+?)(FS|SS|FF|SF)([+-]\d+)?$/);
        if(!match || !ids.has(match[1])) errors.push(`Ongeldige voorganger bij ${row.id}.`);
        if(match?.[1] === row.id) errors.push(`Circulaire voorganger bij ${row.id}.`);
      });
      return { valid:errors.length===0, errors };
    }
  };

  const init = async () => {
    await storageAdapter.detect();
    if(storageStatus.mode === "api"){
      try{
        const remote = await storageAdapter.load();
        if(remote?.user){
          currentUser = { email:remote.user.email || "local-dev@cws.test", role:remote.user.role || "viewer" };
        }
        remoteVersion = Number(remote?.version || 0);
        storageStatus.remoteVersion = remoteVersion;
        if(remote?.exists && remote.state && typeof remote.state === "object"){
          const incoming = normalizeState(remote.state);
          const validation = validateState(incoming);
          if(validation.valid){
            state = incoming;
            writeLocalSnapshot(state);
          }
        }else{
          // Do not overwrite an empty D1 row with an accidental empty default when a
          // meaningful local snapshot exists. In that case, the local planning is the
          // safest recovery candidate and is uploaded explicitly.
          if(stateHasBusinessData(state)){
            await storageAdapter.save(state);
          }else{
            storageStatus.unsynced = false;
          }
        }
      }catch(error){
        storageStatus.mode = "local";
        storageStatus.label = "D1 niet bereikbaar - lokale fallback";
        storageStatus.unsynced = true;
        storageStatus.lastError = error.message;
        if(stateHasBusinessData(state)){
          writeLocalSnapshot(state);
        }
      }
    }
    state = normalizeState(state);
    rebuildGanttHoursByDay(state);
    state.user = state.user || {};
    state.user.email = currentUser.email;
    state.ui = state.ui || deepClone(defaultState().ui);
    state.roles = state.roles && typeof state.roles === "object" && !Array.isArray(state.roles) ? state.roles : deepClone(DEFAULT_ROLES);
    if(storageStatus.mode === "api"){
      state.user.role = currentUser.role;
      state.ui.role = state.roles?.[currentUser.role]?.name || currentUser.role;
    }
    notify();
    return { storage:{...storageStatus}, user:{...currentUser} };
  };

  // expose API
  window.CWS = {
    DEFAULT_ROLES,
    init,
    getState,
    setState,
    mutate,
    undo,
    redo,
    canUndo,
    canRedo,
    validateState,
    getLastValidation: () => lastValidation,
    rebuildGanttHoursByDay: () => recalculateGanttHoursIfChanged().gantt,
    gantt: ganttApi,
    storage: storageAdapter,
    storageStatus,
    getRemoteVersion: () => remoteVersion,
    getCurrentUser: () => ({ ...currentUser, name:state.user?.name || currentUser.email }),
    subscribe,
    resetDemo,
    clearAll,
    audit,
    hasPermission,
    setUserRole,
    getCompanyLogo: () => state.company?.logo?.dataUrl || "",
    getCompanyName: () => (Array.isArray(state.settings?.tables?.company) && state.settings.tables.company[0]?.name) || state.company?.name || "",
    colors: { map:CWS_COLOR_MAP, names:CWS_COLOR_NAMES, normalize:normalizeColorKey }
  };
})();
