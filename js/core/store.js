/* CWS Planning - Persistent Store (Build 26) */
window.CWS = window.CWS || {};

(function(){
  const KEY_GLOBAL = "cws.state.snapshot.v12";
  const KEY_TENANT = "tenant:default:cws.state.snapshot.v12";
  const SCHEMA_VERSION = 12;
  const API_STATE = "/api/state";
  const API_HEALTH = "/api/health";

  const DEFAULT_ROLES = {
    admin:  { name:"Admin",  permissions:["*"] },
    planner:{ name:"Planner",permissions:["view_projects","edit_projects","view_planning","edit_planning","auto_plan","view_reports","audit_view"] },
    viewer: { name:"Viewer", permissions:["view_projects","view_planning","view_reports"] }
  };

  const deepClone = (x) => JSON.parse(JSON.stringify(x));

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
    gantt: { hoursByDay:{}, sourcesByDay:{} },
    templates: { taskSets: [ { id:"default", name:"Standaard", phases:[] } ] },

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

  const load = () => {
    const raw = localStorage.getItem(KEY_TENANT) || localStorage.getItem(KEY_GLOBAL);
    if(!raw) return normalizeState(defaultState());
    try{
      const st = JSON.parse(raw);
      return normalizeState(st);
    }catch(_){
      return normalizeState(defaultState());
    }
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
    st.allocations = st.allocations || { byWeek:{} };
    st.allocations.byWeek = st.allocations.byWeek && typeof st.allocations.byWeek === "object" ? st.allocations.byWeek : {};
    st.tasks = st.tasks || { byProject:{} };
    st.tasks.byProject = st.tasks.byProject && typeof st.tasks.byProject === "object" ? st.tasks.byProject : {};
    st.planbord = st.planbord || { byDeptWeek:{} };
    st.planbord.byDeptWeek = st.planbord.byDeptWeek && typeof st.planbord.byDeptWeek === "object" ? st.planbord.byDeptWeek : {};
    st.projectOverview = st.projectOverview || { notesByProject:{}, statusByProject:{} };
    st.projectOverview.notesByProject = st.projectOverview.notesByProject || {};
    st.projectOverview.statusByProject = st.projectOverview.statusByProject || {};
    st.projectPlanning = st.projectPlanning || { byWeek:{}, columns:[] };
    st.projectPlanning.byWeek = st.projectPlanning.byWeek || {};
    st.projectPlanning.columns = Array.isArray(st.projectPlanning.columns) ? st.projectPlanning.columns : [];
    st.transport = st.transport || { vehicles:[], drivers:[], locations:[], trips:[] };
    ["vehicles","drivers","locations","trips"].forEach(k => {
      st.transport[k] = Array.isArray(st.transport[k]) ? st.transport[k] : [];
    });
    st.gantt = st.gantt || { hoursByDay:{}, sourcesByDay:{} };
    st.gantt.hoursByDay = st.gantt.hoursByDay || {};
    st.gantt.sourcesByDay = st.gantt.sourcesByDay || {};
    st.ganttV2 = st.ganttV2 || { expanded:{}, byProject:{}, ui:{ showCritical:false, showDeps:true, viewMode:"both", zoom:"week" } };
    st.ganttV2.expanded = st.ganttV2.expanded || {};
    st.ganttV2.byProject = st.ganttV2.byProject || {};
    st.ganttV2.ui = st.ganttV2.ui || { showCritical:false, showDeps:true, viewMode:"both", zoom:"week" };
    st.templates = st.templates || { taskSets: [ { id:"default", name:"Standaard", phases:[] } ] };
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
      const response = await fetch(API_STATE, { headers:{ "Accept":"application/json" } });
      const data = await response.json().catch(()=>({}));
      if(!response.ok || !data.ok) throw new Error(data.error || `State laden mislukt (${response.status}).`);
      remoteVersion = Number(data.version || 0);
      storageStatus.remoteVersion = remoteVersion;
      return data;
    },
    async save(snapshot){
      if(storageStatus.mode !== "api") return { ok:true, local:true };
      const response = await fetch(API_STATE, {
        method:"PUT",
        headers:{ "Content-Type":"application/json", "Accept":"application/json" },
        body:JSON.stringify({ state:snapshot, baseVersion:remoteVersion })
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
      localStorage.setItem(KEY_GLOBAL, JSON.stringify(state));
      localStorage.removeItem(KEY_TENANT);
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

  const num = (v) => {
    const n = (typeof v === 'number') ? v : parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

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
      // SSOT requirement: default all weekdays workbaar (Ma..Zo)
      cal.workweek = { 1:true,2:true,3:true,4:true,5:true,6:true,7:true };
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
    const ww = emp.workweek || st.settings?.calendar?.workweek || {1:true,2:true,3:true,4:true,5:true,6:true,7:true};
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
    st.settings = st.settings || { activeSection:"Accountinformatie", datasets:{} };
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

  const rebuildGanttHoursByDay = (target=state) => {
    normalizeState(target);
    const hoursByDay = {};
    const sourcesByDay = {};
    (target.projects?.deptHours || []).forEach(row => {
      const dept = row.deptId || "(Geen)";
      const days = [...getDeptWorkdaysSetForProject(target, row.projectId, dept)].sort();
      if(!days.length) return;
      const perDay = num(row.hours) / days.length;
      days.forEach(iso => {
        if(getGlobalNonWorkISO(target, iso)) return;
        hoursByDay[iso] = hoursByDay[iso] || {};
        hoursByDay[iso][dept] = (hoursByDay[iso][dept] || 0) + perDay;
        sourcesByDay[iso] = sourcesByDay[iso] || {};
        sourcesByDay[iso][dept] = sourcesByDay[iso][dept] || [];
        sourcesByDay[iso][dept].push({ projectId:row.projectId, hours:perDay });
      });
    });
    target.gantt.hoursByDay = hoursByDay;
    target.gantt.sourcesByDay = sourcesByDay;
    return target.gantt;
  };

  const ganttApi = {
    getProjectGantt(projectId){
      return deepClone(state.ganttV2?.byProject?.[projectId] || { rows:[], sched:{} });
    },
    saveProjectGantt(projectId, model){
      return mutate("gantt_save", { projectId }, draft => {
        draft.ganttV2 = draft.ganttV2 || { byProject:{}, ui:{} };
        draft.ganttV2.byProject = draft.ganttV2.byProject || {};
        draft.ganttV2.byProject[projectId] = deepClone(model);
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
        const pack = draft.tasks?.byProject?.[projectId];
        const phases = pack?.phases?.length ? pack.phases : [{ id:"PH-1", name:"Engineering", tasks:[{id:"T-1",name:"Voorbereiding"},{id:"T-2",name:"Uitvoering"}] }];
        const model = { rows:[], sched:{} };
        let day = 0;
        phases.forEach(phase => {
          model.rows.push({ id:`${projectId}-${phase.id}`, name:phase.name, type:"summary", level:0, department:phase.name, progress:0, predecessor:"", locked:false });
          (phase.tasks || []).forEach((task, index) => {
            const id = `${projectId}-${task.id}`;
            const start = isoDateUTC(addDaysUTC(base, day));
            const end = isoDateUTC(addDaysUTC(base, day+4));
            model.rows.push({ id, name:task.name, type:"task", level:1, department:phase.name, progress:0, predecessor:index ? `${projectId}-${phase.tasks[index-1].id}FS` : "", locked:false });
            model.sched[id] = { start, end };
            day += 5;
          });
        });
        draft.ganttV2.byProject[projectId] = model;
        rebuildGanttHoursByDay(draft);
      });
    },
    recalculateHours(){
      return setState(draft => { rebuildGanttHoursByDay(draft); return draft; });
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
          if(validation.valid) state = incoming;
        }else{
          await storageAdapter.save(state);
        }
      }catch(error){
        storageStatus.mode = "local";
        storageStatus.label = "D1 niet bereikbaar - lokale fallback";
        storageStatus.unsynced = true;
        storageStatus.lastError = error.message;
      }
    }
    state = normalizeState(state);
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
    rebuildGanttHoursByDay: () => setState(s => { rebuildGanttHoursByDay(s); return s; }),
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
    setUserRole
  };
})();
