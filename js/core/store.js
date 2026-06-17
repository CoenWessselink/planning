/* CWS Planning - Persistent Store (Build 26) */
window.CWS = window.CWS || {};

(function(){
  const KEY_GLOBAL = "cws.state.snapshot.v12";
  const KEY_TENANT = "tenant:default:cws.state.snapshot.v12";
  const KEY_BACKUP = "tenant:default:cws.state.snapshot.v12.backup";
  const LEGACY_STATE_KEYS = ["cws.state.snapshot.v11", "cws.state.snapshot", "cwsPlanningState", "cws.state", "cws.planning.state"];
  
  const V74_GANTT_DRAG_RESIZE_FREEZE_FIX_MARKER = "v74-gantt-drag-resize-freeze-fix";
  const SCHEMA_VERSION = 12;
  const API_STATE = "/api/state";
  const API_HEALTH = "/api/health";
  const API_IDENTITY = "/api/identity";
  const V77_APP_BOOT_D1_ACCESS_PRODUCTION_FIX = "v77-app-boot-d1-access-production-fix";
  const V78_PRODUCTION_BOOT_DATA_HYDRATION_FIX = "v78-production-boot-data-hydration-fix";
  const HEALTH_FETCH_TIMEOUT_MS = 8000;
  const IDENTITY_FETCH_TIMEOUT_MS = 8000;
  const STATE_FETCH_TIMEOUT_MS = 30000;
  const SAVE_FETCH_TIMEOUT_MS = 15000;
  const MAX_GANTT_DATE_SCAN_DAYS = 3660;
  const MAX_GANTT_WORKDAYS = 2600;
  const BOOT_PHASES = [
    "booting",
    "shell-ready",
    "identity-loading",
    "identity-ready",
    "identity-failed-nonblocking",
    "remote-state-loading",
    "remote-state-ready",
    "remote-state-failed",
    "local-fallback-considered",
    "state-normalized",
    "app-ready",
    "boot-error"
  ];

  const DEFAULT_ROLES = {
    admin:  { name:"Admin",  permissions:["*"] },
    planner:{ name:"Planner",permissions:["view_projects","edit_projects","view_planning","edit_planning","auto_plan","view_reports","audit_view","import_data"] },
    viewer: { name:"Viewer", permissions:["view_projects","view_planning","view_reports"] }
  };

  const deepClone = (x) => JSON.parse(JSON.stringify(x));

  const V82_D1_STATE_SIZE_AND_SAVE_FIX = "v82-d1-state-size-and-save-fix";
  const V85_D1_CHUNKED_STATE_STREAMING_LOAD_FIX = "v85-d1-chunked-state-streaming-load-fix";
  const V82_REMOTE_WARN_BYTES = 900_000;

  const createRemoteSaveSnapshot = (candidate=state) => {
    const snapshot = deepClone(candidate || {});
    snapshot.meta = snapshot.meta || {};
    snapshot.meta.v82D1StateSizeAndSaveFix = true;
    snapshot.meta.v82RemoteProjectionAt = new Date().toISOString();
    // Keep persistent planning data, but remove transient diagnostics that can make
    // the single tenant-state grow until D1 refuses it with SQLITE_TOOBIG.
    delete snapshot.meta.liveReadiness;
    delete snapshot.meta.bootReport;
    delete snapshot.meta.lastStateDoctorReport;
    delete snapshot.meta.lastImportPreview;
    delete snapshot.meta.lastExportPreview;
    delete snapshot.meta.dragPreview;
    if(snapshot.ui){
      delete snapshot.ui.scroll;
      delete snapshot.ui.modal;
      delete snapshot.ui.contextMenu;
      delete snapshot.ui.printPreview;
      delete snapshot.ui.temp;
      delete snapshot.ui.drag;
      delete snapshot.ui.selectionBox;
    }
    if(Array.isArray(snapshot.auditLog) && snapshot.auditLog.length > 150){
      snapshot.auditLog = snapshot.auditLog.slice(-150);
      snapshot.meta.v82AuditLogTrimmed = true;
    }
    return snapshot;
  };

  const remoteSnapshotBytes = (snapshot) => {
    try { return new TextEncoder().encode(JSON.stringify(snapshot || {})).byteLength; }
    catch(_) { return 0; }
  };

  const loadChunkedRemoteStateBody = async (manifest, version) => {
    const count = Number(manifest?.chunkCount || 0);
    if(!count || count < 1) throw new Error("D1 chunked state manifest bevat geen chunks.");
    const chunks = new Array(count);
    const maxParallel = 4;
    let next = 0;
    const fetchOne = async (index) => {
      const url = `${API_STATE}?payload=raw-state&chunkIndex=${encodeURIComponent(String(index))}&version=${encodeURIComponent(String(version || manifest.version || 0))}`;
      const response = await fetchWithTimeout(url, {
        headers:{
          "Accept":"application/json",
          "X-CWS-State-Response":"raw-state"
        }
      }, STATE_FETCH_TIMEOUT_MS, `D1 state chunk ${index + 1}/${count}`);
      if(!response.ok){
        let message = `State chunk ${index + 1}/${count} laden mislukt (${response.status}).`;
        try{
          const err = await response.clone().json();
          if(err?.error) message = err.error;
        }catch(_){}
        const error = new Error(message);
        error.status = response.status;
        throw error;
      }
      chunks[index] = await response.text();
    };
    const workers = Array.from({ length: Math.min(maxParallel, count) }, async () => {
      while(next < count){
        const index = next++;
        await fetchOne(index);
      }
    });
    await Promise.all(workers);
    const body = chunks.join("");
    storageStatus.lastRemoteChunked = true;
    storageStatus.lastRemoteChunkCount = count;
    storageStatus.v85ChunkedStateStreamingLoad = true;
    storageStatus.v85Marker = V85_D1_CHUNKED_STATE_STREAMING_LOAD_FIX;
    return body;
  };
  const baseNum = (v) => {
    const n = (typeof v === 'number') ? v : parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  const num = baseNum;

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
    ganttV2: { expanded:{}, byProject:{}, ui:{ showCritical:false, showDeps:true, viewMode:"both", zoom:"week" } }
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
    st.settings.deletedDepartments = Array.isArray(st.settings.deletedDepartments) ? st.settings.deletedDepartments : [];
    st.departments = st.departments || { order:[], byId:{} };
    st.departments.order = Array.isArray(st.departments.order) ? st.departments.order : [];
    st.departments.byId = st.departments.byId && typeof st.departments.byId === "object" ? st.departments.byId : {};

    const deletedMatches = (raw, preferredId=null) => {
      const candidates = [preferredId, raw?.id, raw?.name, raw?.code, raw?.dept, raw?.department, deptRowName(raw), deptRowCode(raw)]
        .map(deptNorm).filter(Boolean);
      if(!candidates.length) return false;
      return st.settings.deletedDepartments.some(d => {
        const markers = [d?.id, d?.name, d?.code, d?.deletedName].map(deptNorm).filter(Boolean);
        return markers.some(m => candidates.includes(m));
      });
    };
    const removeDeletedMarker = (raw, preferredId=null) => {
      const candidates = [preferredId, raw?.id, raw?.name, raw?.code, raw?.dept, raw?.department, deptRowName(raw), deptRowCode(raw)]
        .map(deptNorm).filter(Boolean);
      if(!candidates.length) return;
      st.settings.deletedDepartments = st.settings.deletedDepartments.filter(d => {
        const markers = [d?.id, d?.name, d?.code, d?.deletedName].map(deptNorm).filter(Boolean);
        return !markers.some(m => candidates.includes(m));
      });
    };

    const add = (raw, preferredId=null, options={}) => {
      const name = deptRowName(raw);
      const code = deptRowCode(raw);
      if(!name && !code) return null;
      if(!deptActive(raw?.active ?? raw?.actief ?? raw?.Actief ?? raw?.enabled)) return null;
      if(!options.explicit && deletedMatches(raw, preferredId)) return null;
      if(options.explicit) removeDeletedMarker(raw, preferredId);
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
    st.settings.tables.departments.forEach(r => add(r, null, { explicit:true }));
    st.settings.tables.afdelingen.forEach(r => add(r, null, { explicit:true }));

    if(st.settings.deletedDepartments.length){
      st.departments.order.slice().forEach(id => {
        const d = st.departments.byId?.[id];
        if(d && deletedMatches({ id, ...d }, id)){
          delete st.departments.byId[id];
        }
      });
      st.departments.order = st.departments.order.filter(id => st.departments.byId[id]);
    }

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

  const stateMetrics = (candidate) => {
    const st = candidate || {};
    const projectOrder = Array.isArray(st.projects?.order) ? st.projects.order.length : 0;
    const projectById = st.projects?.byId && typeof st.projects.byId === "object" && !Array.isArray(st.projects.byId) ? Object.keys(st.projects.byId).length : 0;
    const legacyProjectArray = Array.isArray(st.projects) ? st.projects.length : 0;
    const ganttProjectCount = st.ganttV2?.byProject && typeof st.ganttV2.byProject === "object" && !Array.isArray(st.ganttV2.byProject) ? Object.keys(st.ganttV2.byProject).length : 0;
    const ganttRowCount = Object.values(st.ganttV2?.byProject || {}).reduce((sum, model) => sum + (Array.isArray(model?.rows) ? model.rows.length : 0), 0);
    const tasksProjectCount = st.tasks?.byProject && typeof st.tasks.byProject === "object" && !Array.isArray(st.tasks.byProject) ? Object.keys(st.tasks.byProject).length : 0;
    const taskPhaseCount = Object.values(st.tasks?.byProject || {}).reduce((sum, model) => sum + (Array.isArray(model?.phases) ? model.phases.length : 0), 0);
    const hourDays = st.gantt?.hoursByDay && typeof st.gantt.hoursByDay === "object" && !Array.isArray(st.gantt.hoursByDay) ? Object.keys(st.gantt.hoursByDay).length : 0;
    const sourceCount = Object.values(st.gantt?.sourcesByDay || {}).reduce((sum, byDept) => sum + Object.values(byDept || {}).reduce((n, rows) => n + (Array.isArray(rows) ? rows.length : 0), 0), 0);
    const deptHours = Array.isArray(st.projects?.deptHours) ? st.projects.deptHours.length : 0;
    const projectCount = Math.max(projectOrder, projectById, legacyProjectArray);
    return {
      projectCount,
      projectOrder,
      projectById,
      legacyProjectArray,
      ganttProjectCount,
      ganttRowCount,
      tasksProjectCount,
      taskPhaseCount,
      hourDays,
      sourceCount,
      deptHours,
      hasLegacyObjectSchema: Boolean(st.projects?.order && st.projects?.byId && !Array.isArray(st.projects)),
      hasArraySchema: Array.isArray(st.projects) || Array.isArray(st.ganttTasks)
    };
  };

  const stateHasBusinessData = (candidate) => {
    const m = stateMetrics(candidate);
    return Boolean(m.projectCount || m.ganttProjectCount || m.ganttRowCount || m.tasksProjectCount || m.hourDays || m.deptHours);
  };

  const stateHasAuthoritativeBusinessData = (candidate, metadata={}) => {
    const m = stateMetrics(candidate);
    const bytes = Number(metadata.bytes || 0);
    const version = Number(metadata.version || candidate?.schemaVersion || 0);
    const richProjects = m.projectOrder > 10 && m.projectById > 10;
    const richPlanning = m.ganttProjectCount > 0 || m.ganttRowCount > 0;
    return Boolean(version > 0 && richProjects && (richPlanning || bytes > 25000));
  };

  let remoteSafetySnapshot = { projectCount:0, ganttRowCount:0, bytes:0, version:0, loadedAt:null };

  const protectAgainstCatastrophicOverwrite = (snapshot, reason="save") => {
    const local = stateMetrics(snapshot);
    const remote = remoteSafetySnapshot || {};
    const remoteProjects = Number(remote.projectCount || 0);
    const localProjects = Number(local.projectCount || 0);
    const remoteRows = Number(remote.ganttRowCount || 0);
    const localRows = Number(local.ganttRowCount || 0);
    const looksLikeDemoOrEmpty = localProjects <= 5 || (localProjects < 10 && localRows <= 20);
    const projectDrop = remoteProjects >= 10 &&
      localProjects < remoteProjects &&
      (remoteProjects - localProjects >= Math.max(5, Math.ceil(remoteProjects * 0.2)));
    const ganttDrop = remoteRows >= 20 &&
      localRows < remoteRows &&
      (remoteRows - localRows >= Math.max(10, Math.ceil(remoteRows * 0.25)));
    if(storageStatus.mode === "api" && (projectDrop || ganttDrop || (remoteProjects >= 20 && looksLikeDemoOrEmpty))){
      const msg = `Opslaan geblokkeerd: inkomende state zou planning verkleinen van ${remoteProjects} projecten/${remoteRows} Gantt-rijen naar ${localProjects}/${localRows}. Reden: ${reason}.`;
      const error = new Error(msg);
      error.status = 409;
      error.cwsGuard = "v63-catastrophic-overwrite";
      error.cwsGuardVersion = "v72-state-shrink-guard";
      error.remoteMetrics = remote;
      error.localMetrics = local;
      throw error;
    }
    return true;
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


  // V67 BIG FOUNDATION: deterministic restored-D1 fixture + safe recovery snapshots.
  // This makes the real legacy D1 shape testable without Cloudflare Access:
  // projects.order/byId + ganttV2.byProject + tasks.byProject + gantt.hoursByDay/sourcesByDay.
  const V67_RECOVERY_SNAPSHOT_KEY = "tenant:default:cws.state.snapshot.v67.recovery";
  const V67_LAST_GOOD_KEY = "tenant:default:cws.state.snapshot.v67.lastGood";
  const V67_FIXTURE_MARKER = "v67-restored-d1-fixture";
  const V68_COMPLETE_MARKER = "v68-complete-foundation";
  const V69_TEST_RUNNER_HARDENING = "v69-test-runner-hardening";
  const V70_LIVE_STABILITY_MARKER = "v70-live-stability-gantt-capacity-hardening";
  const V72_COMPLETE_HARDENING_MARKER = "v72-complete-program-mobile-hardening";
  const V68_LOCK_KEY = "tenant:default:cws.state.v68.recoveryLock";

  const makeIsoRangeTask = (id, name, parent, dept, start, workdays, colorKey="c1", extra={}) => ({
    row:{ id, name, type:extra.type || "task", level:extra.level ?? 1, parent:parent || "", department:dept, resourceId:extra.resourceId || "", progress:extra.progress || 0, status:extra.status || "Niet gestart", predecessor:extra.predecessor || "", locked:false, colorKey, hoursMode:extra.hoursMode || "auto", hoursSource:extra.hoursSource || "project-dept-hours", manualHours:0, hours:0, why:"", feedback:"", milestone:!!extra.milestone },
    sched:{ start, end:extra.end || start, workdays }
  });

  const fixtureCalendarEnd = (startIso, calendarDays) => {
    const d = new Date(String(startIso) + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + Math.max(0, Number(calendarDays||1) - 1));
    const pad = n => String(n).padStart(2,"0");
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
  };

  const createRestoredD1Fixture = () => {
    const st = defaultState();
    st.meta.fixture = V67_FIXTURE_MARKER;
    st.meta.v68CompleteFoundation = true;
    st.meta.updatedAt = new Date().toISOString();
    st.company.name = "Tasche Staalbouw";
    st.settings.tables = st.settings.tables || {};
    st.settings.tables.departments = [
      { name:"Engineering", active:true },
      { name:"Tekenwerk", active:true },
      { name:"Productie", active:true },
      { name:"Conservering", active:true },
      { name:"Montage", active:true }
    ];
    st.settings.tables.employees = [
      { name:"Engineering team", dept:"Engineering", ma:8, di:8, wo:8, do:8, vr:8, za:0, zo:0, active:true },
      { name:"Tekenkamer", dept:"Tekenwerk", ma:16, di:16, wo:16, do:16, vr:16, za:0, zo:0, active:true },
      { name:"Werkplaats", dept:"Productie", ma:40, di:40, wo:40, do:40, vr:40, za:0, zo:0, active:true },
      { name:"Conservering", dept:"Conservering", ma:16, di:16, wo:16, do:16, vr:16, za:0, zo:0, active:true },
      { name:"Montageploeg", dept:"Montage", ma:24, di:24, wo:24, do:24, vr:24, za:0, zo:0, active:true }
    ];
    st.projects.deptHours = Array.isArray(st.projects.deptHours) ? st.projects.deptHours : [];
    const mainId = "P-ZERNIKE-19158";
    st.projects.order.push(mainId);
    st.projects.byId[mainId] = { id:mainId, nr:"19158", number:"19158", name:"Sportcentrum Zernike te Groningen - 19158 - Hegemen", client:"Hegeman", opdrachtgever:"Hegeman", status:"Ingepland", start:"01-06-2026", startDate:"01-06-2026", end:"07-03-2027", deptHours:{ Engineering:120, Tekenwerk:420, Productie:700, Conservering:260, Montage:480 } };
    Object.entries(st.projects.byId[mainId].deptHours).forEach(([dept,hours]) => st.projects.deptHours.push({ projectId:mainId, dept, deptId:dept, hours }));
    const model = { rows:[], sched:{} };
    model.rows.push({ id:"Z-F1", name:"FASE 1", type:"summary", level:0, department:"Tekenwerk", resourceId:"", progress:0, status:"In uitvoering", predecessor:"", locked:false, colorKey:"c3", hoursMode:"auto", hoursSource:"project-dept-hours", hours:0, manualHours:0 });
    model.sched["Z-F1"] = { start:"2026-06-01", end:"2027-03-07", workdays:266 };
    const tasks = [
      ["Z-T01","Werktekeningen ontvangen","Opdrachtgever","Engineering","2026-06-01",3,"c1"],
      ["Z-T02","Detailberekeningen ter controle","Z-F1","Engineering","2026-06-04",31,"c1","Z-T01FS"],
      ["Z-T03","Detailberekeningen definitief","Z-F1","Engineering","2026-07-17",14,"c1","Z-T02FS"],
      ["Z-T04","Tekenwerk ter controle","Z-F1","Tekenwerk","2026-08-06",62,"c5","Z-T03FS"],
      ["Z-T05","Tekenwerk gecontroleerd retour","Z-F1","Tekenwerk","2026-10-30",14,"c5","Z-T04FS"],
      ["Z-T06","Tekenwerk voor uitvoering 1","Z-F1","Tekenwerk","2026-11-19",21,"c5","Z-T05FS"],
      ["Z-T07","Tekenwerk gecontroleerd retour 1","Z-F1","Tekenwerk","2026-12-18",14,"c5","Z-T06FS"],
      ["Z-T08","Tekenwerk voor uitvoering 2","Z-F1","Tekenwerk","2027-01-07",7,"c5","Z-T07FS"],
      ["Z-T09","Ankers geleverd fase A","Z-F1","Productie","2027-01-18",5,"c2","Z-T08FS"],
      ["Z-T10","Tekenwerk definitief","Z-F1","Tekenwerk","2027-01-25",5,"c5","Z-T09FS"],
      ["Z-T11","Ankers geleverd fase B","Z-F1","Productie","2027-02-01",5,"c2","Z-T10FS"],
      ["Z-T12","Werkplaatstekeningen","Z-F1","Tekenwerk","2027-02-08",12,"c5","Z-T11FS"],
      ["Z-T13","Productie","Z-F1","Productie","2026-09-01",100,"c2","Z-T12FS"],
      ["Z-T14","Conservering epoxy","Z-F1","Conservering","2026-11-02",73,"c6","Z-T13FS"],
      ["Z-T15","Conservering verzinkt","Z-F1","Conservering","2027-02-15",5,"c6","Z-T14FS"],
      ["Z-T16","Montage Fase A","Z-F1","Montage","2027-01-04",57,"c7","Z-T15FS"],
      ["Z-T17","Montage fase B","Z-F1","Montage","2027-02-01",43,"c7","Z-T16FS"]
    ];
    tasks.forEach(([id,name,parent,dept,start,wd,color,pred])=>{
      const end = fixtureCalendarEnd(start, Math.max(wd, Math.ceil(wd/5)*7 - 2));
      const item = makeIsoRangeTask(id, name, parent === "Opdrachtgever" ? "Z-F1" : parent, dept, start, wd, color, { predecessor:pred||"", end });
      model.rows.push(item.row);
      model.sched[id] = item.sched;
    });
    st.ganttV2.byProject[mainId] = model;
    st.tasks.byProject[mainId] = { phases:[{ id:"Z-F1", name:"FASE 1", tasks:model.rows.filter(r=>r.type!=="summary").map(r=>({ id:r.id, name:r.name, department:r.department })) }] };
    for(let i=2;i<=76;i++){
      const id = `P-FIX-${String(i).padStart(3,"0")}`;
      const dept = ["Engineering","Tekenwerk","Productie","Conservering","Montage"][i%5];
      st.projects.order.push(id);
      st.projects.byId[id] = { id, nr:`F${String(i).padStart(4,"0")}`, number:`F${String(i).padStart(4,"0")}`, name:`Fixture project ${String(i).padStart(2,"0")}`, client:"Tasche Staalbouw", status:i%7===0?"Gereed":i%5===0?"In uitvoering":"Ingepland", start:"01-06-2026", deptHours:{ [dept]:80+i } };
      st.projects.deptHours.push({ projectId:id, dept, deptId:dept, hours:80+i });
      if(i<=12){
        const mid=`${id}-F1`; const tid=`${id}-T1`;
        st.ganttV2.byProject[id]={ rows:[{ id:mid, name:"Fase 1", type:"summary", level:0, department:dept, colorKey:"c1", hoursMode:"auto", hoursSource:"project-dept-hours" }, { id:tid, name:`${dept} taak`, type:"task", level:1, parent:mid, department:dept, colorKey:"c2", progress:0, status:"Niet gestart", predecessor:"", hoursMode:"auto", hoursSource:"project-dept-hours", hours:0, manualHours:0 }], sched:{} };
        st.ganttV2.byProject[id].sched[mid] = { start:"2026-06-01", end:"2026-06-26", workdays:20 };
        st.ganttV2.byProject[id].sched[tid] = { start:"2026-06-01", end:"2026-06-26", workdays:20 };
        st.tasks.byProject[id] = { phases:[{ id:mid, name:"Fase 1", tasks:[{ id:tid, name:`${dept} taak`, department:dept }] }] };
      }
    }
    return st;
  };

  const rememberLastGoodSnapshot = (snapshot, label="auto") => {
    try{
      const metrics = stateMetrics(snapshot);
      if(Number(metrics.projectCount || 0) >= 20){
        const raw = JSON.stringify({ label, createdAt:new Date().toISOString(), metrics, state:snapshot });
        localStorage.setItem(V67_LAST_GOOD_KEY, raw);
      }
    }catch(_e){}
  };

  const readLastGoodSnapshot = () => {
    try{
      const raw = localStorage.getItem(V67_LAST_GOOD_KEY);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.state && typeof parsed.state === "object" ? parsed : null;
    }catch(_e){ return null; }
  };

  const load = () => {
    try{
      const params = new URLSearchParams(window.location?.search || "");
      const fixture = String(params.get("fixture") || params.get("loadLocalFixture") || "").toLowerCase();
      if(fixture === "restored-d1" || fixture === "1" || fixture === "v67" || fixture === "v68" || fixture === "complete"){
        const st = normalizeState(createRestoredD1Fixture());
        rememberLastGoodSnapshot(st, "v67-fixture-load");
        return st;
      }
    }catch(_e){}
    const keys = [KEY_TENANT, KEY_GLOBAL, V67_LAST_GOOD_KEY, KEY_BACKUP, ...LEGACY_STATE_KEYS];
    for(const key of keys){
      if(key === V67_LAST_GOOD_KEY){
        const packed = readLastGoodSnapshot();
        if(packed?.state) return normalizeState(packed.state);
        continue;
      }
      const st = readStateFromLocalKey(key);
      if(st) return normalizeState(st);
    }
    return normalizeState(defaultState());
  };

  const rewriteGanttReference = (value, resolveId) => {
    const raw = String(value || "");
    if(!raw.trim()) return raw;
    return raw.split(/([;,])/).map(part => {
      if(part === "," || part === ";") return part;
      const leading = part.match(/^\s*/)?.[0] || "";
      const trailing = part.match(/\s*$/)?.[0] || "";
      const token = part.trim();
      const match = token.match(/^(.+?)(FS|SS|FF|SF)([+-]\d+)?$/i);
      if(!match) return `${leading}${resolveId(token)}${trailing}`;
      return `${leading}${resolveId(match[1])}${match[2].toUpperCase()}${match[3] || ""}${trailing}`;
    }).join("");
  };

  const repairDuplicateGanttRowIds = (projectId, model) => {
    if(!model || !Array.isArray(model.rows)) return { repaired:0, scheduleKeysRepaired:0, referencesRepaired:0, model };
    model.sched = model.sched && typeof model.sched === "object" && !Array.isArray(model.sched) ? model.sched : {};

    const used = new Set();
    const occurrences = new Map();
    const repairs = [];
    let scheduleKeysRepaired = 0;
    let referencesRepaired = 0;

    model.rows.forEach((row, index) => {
      if(!row || typeof row !== "object") return;
      const originalId = String(row.id || row.taskId || `${projectId}-TASK-${index+1}`).trim() || `${projectId}-TASK-${index+1}`;
      const occurrence = (occurrences.get(originalId) || 0) + 1;
      occurrences.set(originalId, occurrence);

      let repairedId = originalId;
      if(used.has(repairedId)){
        let suffix = occurrence;
        repairedId = `${originalId}__dup${suffix}`;
        while(used.has(repairedId)){
          suffix += 1;
          repairedId = `${originalId}__dup${suffix}`;
        }
      }

      used.add(repairedId);
      repairs.push({ row, originalId, repairedId });
      row.id = repairedId;

      if(repairedId !== originalId && model.sched[repairedId] == null && model.sched[originalId] != null){
        model.sched[repairedId] = deepClone(model.sched[originalId]);
        scheduleKeysRepaired += 1;
      }
    });

    const firstByOriginal = new Map();
    repairs.forEach(item => {
      if(!firstByOriginal.has(item.originalId)) firstByOriginal.set(item.originalId, item.repairedId);
    });
    const latestByOriginal = new Map();
    repairs.forEach(item => {
      const resolveId = rawId => {
        const id = String(rawId || "").trim();
        return latestByOriginal.get(id) || firstByOriginal.get(id) || id;
      };
      if(item.row.parent){
        const before = item.row.parent;
        item.row.parent = resolveId(item.row.parent);
        if(before !== item.row.parent) referencesRepaired += 1;
      }
      ["predecessor","predecessors","dependency","dependenciesText"].forEach(field => {
        if(!item.row[field]) return;
        const before = item.row[field];
        item.row[field] = rewriteGanttReference(item.row[field], resolveId);
        if(before !== item.row[field]) referencesRepaired += 1;
      });
      latestByOriginal.set(item.originalId, item.repairedId);
    });

    const resolveFirst = rawId => {
      const id = String(rawId || "").trim();
      return firstByOriginal.get(id) || id;
    };
    (Array.isArray(model.dependencies) ? model.dependencies : []).forEach(dependency => {
      if(!dependency || typeof dependency !== "object") return;
      ["from","source","sourceId","predecessorId","to","target","targetId","successorId"].forEach(field => {
        if(!dependency[field]) return;
        const before = dependency[field];
        dependency[field] = resolveFirst(dependency[field]);
        if(before !== dependency[field]) referencesRepaired += 1;
      });
    });

    return {
      repaired:repairs.filter(item => item.repairedId !== item.originalId).length,
      scheduleKeysRepaired,
      referencesRepaired,
      model
    };
  };

  const parseDiagnosticDate = (value) => {
    const raw = String(value || "").trim();
    if(!raw) return null;
    let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(match) return new Date(Date.UTC(Number(match[1]), Number(match[2])-1, Number(match[3])));
    match = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if(match) return new Date(Date.UTC(Number(match[3]), Number(match[2])-1, Number(match[1])));
    return null;
  };

  const isDiagnosticNonWorkday = (st, iso) => {
    const date = parseDiagnosticDate(iso);
    if(!date || !Number.isFinite(date.getTime())) return false;
    const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    const override = st?.settings?.calendar?.overrides?.[iso];
    if(typeof override === "boolean") return override;
    if(weekday >= 6) return true;
    const workweek = st?.settings?.calendar?.workweek;
    return workweek && workweek[weekday] === false;
  };

  const collectGanttDiagnostics = (st) => {
    const diagnostics = {
      orphanScheduleCount:0,
      orphanPredecessorCount:0,
      invalidDateCount:0,
      missingDepartmentCount:0,
      weekendHourViolationCount:0
    };
    Object.values(st?.ganttV2?.byProject || {}).forEach(model => {
      const rows = Array.isArray(model?.rows) ? model.rows : [];
      const ids = new Set(rows.map(row => String(row?.id || "")).filter(Boolean));
      Object.keys(model?.sched || {}).forEach(id => {
        if(!ids.has(String(id))) diagnostics.orphanScheduleCount += 1;
      });
      rows.forEach(row => {
        if(!row || !row.id) return;
        if(row.type !== "summary" && row.type !== "phase" && !String(row.department || row.dept || row.afdeling || "").trim()){
          diagnostics.missingDepartmentCount += 1;
        }
        const schedule = model?.sched?.[row.id] || {};
        const start = schedule.start ? parseDiagnosticDate(schedule.start) : null;
        const end = schedule.end ? parseDiagnosticDate(schedule.end) : null;
        if((schedule.start && (!start || !Number.isFinite(start.getTime()))) ||
          (schedule.end && (!end || !Number.isFinite(end.getTime()))) ||
          (start && end && end < start)){
          diagnostics.invalidDateCount += 1;
        }
        [row.predecessor, row.predecessors].filter(Boolean).forEach(value => {
          String(value).split(/[;,]/).map(token => token.trim()).filter(Boolean).forEach(token => {
            const predecessorId = token.replace(/(FS|SS|FF|SF)([+-]\d+)?$/i, "").trim();
            if(predecessorId && !ids.has(predecessorId)) diagnostics.orphanPredecessorCount += 1;
          });
        });
      });
    });
    Object.entries(st?.gantt?.hoursByDay || {}).forEach(([iso, byDept]) => {
      if(isDiagnosticNonWorkday(st, iso) && Object.values(byDept || {}).some(value => Number(value) > 0)){
        diagnostics.weekendHourViolationCount += 1;
      }
    });
    return diagnostics;
  };

  const normalizeGanttState = (st) => {
    st.ganttV2 = st.ganttV2 || { expanded:{}, byProject:{}, ui:{} };
    st.ganttV2.byProject = st.ganttV2.byProject && typeof st.ganttV2.byProject === "object" && !Array.isArray(st.ganttV2.byProject) ? st.ganttV2.byProject : {};
    const repairs = { rows:0, scheduleKeys:0, references:0 };
    const repairModel = (projectId, model) => {
      const result = repairDuplicateGanttRowIds(projectId, model);
      repairs.rows += result.repaired;
      repairs.scheduleKeys += result.scheduleKeysRepaired;
      repairs.references += result.referencesRepaired;
    };
    Object.entries(st.ganttV2.byProject).forEach(([projectId, model]) => {
      if(!model || !Array.isArray(model.rows)) return;
      repairModel(projectId, model);
      (Array.isArray(model.revisions) ? model.revisions : []).forEach(revision => {
        const snapshot = revision?.snapshot;
        if(snapshot && Array.isArray(snapshot.rows)) repairModel(`${projectId}-revision`, snapshot);
      });
    });
    const diagnostics = collectGanttDiagnostics(st);
    return { repairs, diagnostics };
  };

  const normalizeState = (st) => {
    // V67: single runtime normalizer. All legacy/object/array states must pass through here exactly once.
    // Runtime invariant: projects.order/byId + ganttV2.byProject + tasks.byProject + gantt.hoursByDay/sourcesByDay.
    // V62 recovery normalizer: D1 can contain the older rich object schema
    // (projects.order/byId, ganttV2.byProject, gantt.hoursByDay) or, in older
    // trial exports, a flat array schema. Keep the rich schema intact and only
    // convert legacy arrays when needed.
    if(!st || typeof st !== "object" || Array.isArray(st)) st = {};
    if(Array.isArray(st.projects)){
      const rows = st.projects;
      st.projects = { order:[], byId:{}, deptHours:[] };
      rows.forEach((p, index) => {
        if(!p || typeof p !== "object") return;
        const id = String(p.id || p.projectId || p.nr || p.code || `LEGACY-${index+1}`);
        st.projects.order.push(id);
        st.projects.byId[id] = { id, ...p };
      });
    }
    if(st.projects && typeof st.projects === "object" && !Array.isArray(st.projects)){
      st.projects.byId = st.projects.byId && typeof st.projects.byId === "object" && !Array.isArray(st.projects.byId) ? st.projects.byId : {};
      st.projects.order = Array.isArray(st.projects.order) && st.projects.order.length ? st.projects.order : Object.keys(st.projects.byId);
    }
    if(Array.isArray(st.ganttTasks)){
      st.ganttV2 = st.ganttV2 || { expanded:{}, byProject:{}, ui:{ showCritical:false, showDeps:true, viewMode:"both", zoom:"week" } };
      st.ganttV2.byProject = st.ganttV2.byProject || {};
      st.ganttTasks.forEach(row => {
        if(!row || typeof row !== "object") return;
        const pid = String(row.projectId || row.project || "legacy");
        st.ganttV2.byProject[pid] = st.ganttV2.byProject[pid] || { rows:[], sched:{} };
        const id = String(row.id || row.taskId || `${pid}-LEGACY-${st.ganttV2.byProject[pid].rows.length+1}`);
        st.ganttV2.byProject[pid].rows.push({ id, ...row });
        if(row.start || row.end) st.ganttV2.byProject[pid].sched[id] = { start:row.start, end:row.end || row.start };
      });
    }
    // Hard reconcile against the full local schema. This is intentionally defensive,
    // because older D1 test rows may only contain a tiny partial object
    // ({schemaVersion, projects, settings, gantt, ...}) without ui/user/roles.
    st = mergeDefaults(st, defaultState());
    st.schemaVersion = SCHEMA_VERSION;
    st.meta = st.meta || { dirty:false, updatedAt:null, lastAction:null };
    st.meta.v74GanttDragResizeFreezeFix = true;
    st.meta.v74Marker = V74_GANTT_DRAG_RESIZE_FREEZE_FIX_MARKER;
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
    st.projects.order = [...new Set([...st.projects.order.filter(id => st.projects.byId[id]), ...Object.keys(st.projects.byId)])];
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
    st.ganttV2.ui = Object.assign({ showCritical:false, showDeps:true, viewMode:"both", zoom:"week" }, st.ganttV2.ui || {});
    const ganttNormalization = normalizeGanttState(st);
    Object.entries(st.ganttV2.byProject || {}).forEach(([projectId, model]) => {
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
    const repairs = ganttNormalization.repairs;
    const diagnostics = ganttNormalization.diagnostics;
    st.meta.v72CompleteHardening = true;
    st.meta.ganttRowIdRepairCount = Math.max(0, Number(st.meta.ganttRowIdRepairCount || 0)) + repairs.rows;
    st.meta.ganttScheduleKeyRepairCount = Math.max(0, Number(st.meta.ganttScheduleKeyRepairCount || 0)) + repairs.scheduleKeys;
    st.meta.ganttPredecessorRepairCount = Math.max(0, Number(st.meta.ganttPredecessorRepairCount || 0)) + repairs.references;
    if(repairs.rows || repairs.scheduleKeys || repairs.references){
      st.auditLog.push({
        id:`AUD-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ts:new Date().toISOString(),
        user:st.user?.name || "Systeem",
        role:st.user?.role || "unknown",
        action:"duplicate_id_repair_executed",
        meta:{ rowIds:repairs.rows, scheduleKeys:repairs.scheduleKeys, references:repairs.references }
      });
      if(st.auditLog.length > 2000) st.auditLog = st.auditLog.slice(-2000);
      st.globalState.auditLog = st.auditLog;
    }
    st.meta.orphanScheduleCount = diagnostics.orphanScheduleCount;
    st.meta.orphanPredecessorCount = diagnostics.orphanPredecessorCount;
    st.meta.invalidDateCount = diagnostics.invalidDateCount;
    st.meta.missingDepartmentCount = diagnostics.missingDepartmentCount;
    st.meta.weekendHourViolationCount = diagnostics.weekendHourViolationCount;
    st.meta.lastStateDoctorAt = st.meta.lastStateDoctorAt || null;
    st.meta.lastSuccessfulRemoteVersion = Number(st.meta.lastSuccessfulRemoteVersion || 0);
    st.meta.lastSuccessfulSaveAt = st.meta.lastSuccessfulSaveAt || null;
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
  let remoteSaveInFlight = false;
  let remoteSaveQueued = false;
  let remoteSaveQueuedReason = "";
  let remoteSaveRetryTimer = null;
  let remoteSaveRetryAttempt = 0;
  let deferredPersistenceTimer = null;
  let privilegedMutation = false;
  let currentUser = { email:"Identiteit laden...", role:state.user?.role || "admin" };
  let remoteVersion = 0;
  let initPromise = null;
  let initStarted = false;
  let lastUserActionAt = null;

  const storageStatus = {
    mode:"unknown",
    label:"Opslag detecteren...",
    unsynced:false,
    lastError:null,
    remoteVersion:0,
    lastSuccessfulRemoteVersion:0,
    lastSuccessfulSaveAt:null,
    liveReadiness:null,
    booting:false,
    bootReady:false,
    bootPhase:"booting",
    bootDurationMs:0,
    accessMissing:false,
    isPreviewDeployment:false,
    d1Reachable:null,
    identityPresent:false,
    identityEmail:null,
    stateSource:"pending",
    lastSuccessfulD1LoadAt:null,
    remoteSaveInFlight:false,
    remoteSaveQueued:false,
    remoteSaveRetryScheduled:false,
    remoteSaveRetryAttempt:0,
    remoteSaveRetryAt:null,
    remoteSaveLastTransientError:null,
    setStateCallsDuringBoot:0,
    rendersDuringBoot:0,
    savesBlockedDuringBoot:0,
    warnings:[],
    errors:[],
    runtime:null,
    deferredIntegrityScheduled:false,
    bootMarker:V78_PRODUCTION_BOOT_DATA_HYDRATION_FIX
  };


  const runtimeInfo = () => {
    const host = String(location?.hostname || "");
    const isPagesDev = host.endsWith(".pages.dev");
    const isPreviewDeployment = /^([0-9a-f]{8,}|[a-z0-9-]+\.[0-9a-f]{8,})\./i.test(host) && isPagesDev && host !== "planning-cop.pages.dev";
    const isProductionPages = host === "planning-cop.pages.dev";
    const isLocal = ["localhost", "127.0.0.1", "0.0.0.0"].includes(host);
    return {
      host,
      isPagesDev,
      isPreviewDeployment,
      isProductionPages,
      isLocal,
      environment:isLocal ? "local" : (isProductionPages ? "production" : (isPreviewDeployment ? "preview" : "other")),
      marker:V78_PRODUCTION_BOOT_DATA_HYDRATION_FIX
    };
  };

  const fetchWithTimeout = async (url, options={}, timeoutMs=10000, label="request") => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(`${label} timeout after ${timeoutMs}ms`), timeoutMs);
    try{
      return await fetch(url, { ...options, signal:controller.signal });
    }catch(error){
      if(error?.name === "AbortError" || String(error?.message || "").includes("timeout")){
        const timeout = new Error(`${label} duurt te lang (${timeoutMs} ms).`);
        timeout.name = "CWSFetchTimeout";
        timeout.cwsTimeout = true;
        throw timeout;
      }
      throw error;
    }finally{
      clearTimeout(timer);
    }
  };

  const scheduleIdle = (fn, timeout=1800) => {
    if(typeof requestIdleCallback === "function") return requestIdleCallback(fn, { timeout });
    return setTimeout(fn, timeout);
  };

  const markBootPhase = (phase, extra={}) => {
    if(!BOOT_PHASES.includes(phase)) storageStatus.warnings.push(`Onbekende bootfase: ${phase}`);
    storageStatus.bootPhase = phase;
    storageStatus.bootMarker = V78_PRODUCTION_BOOT_DATA_HYDRATION_FIX;
    storageStatus.runtime = runtimeInfo();
    Object.assign(storageStatus, extra || {});
    try{
      window.dispatchEvent(new CustomEvent("cws:bootphase", { detail:{ phase, status:{...storageStatus} } }));
    }catch(_){}
  };

  const recordWarning = (message) => {
    const text = String(message || "").trim();
    if(text && !storageStatus.warnings.includes(text)) storageStatus.warnings.push(text);
  };

  const recordError = (message) => {
    const text = String(message || "").trim();
    if(text && !storageStatus.errors.includes(text)) storageStatus.errors.push(text);
  };

  const isTransientRemoteSaveError = (error) => {
    if(error?.cwsTimeout) return true;
    const status = Number(error?.status || 0);
    if([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
    return /timeout|duurt te lang|temporar|tijdelijk|network|failed to fetch|service unavailable|503/i.test(String(error?.message || ""));
  };

  const clearRemoteSaveRetry = () => {
    if(remoteSaveRetryTimer) clearTimeout(remoteSaveRetryTimer);
    remoteSaveRetryTimer = null;
    remoteSaveRetryAttempt = 0;
    storageStatus.remoteSaveRetryScheduled = false;
    storageStatus.remoteSaveRetryAttempt = 0;
    storageStatus.remoteSaveRetryAt = null;
    storageStatus.remoteSaveLastTransientError = null;
  };

  const storageAdapter = {
    async detect(){
      try{
        const response = await fetchWithTimeout(API_HEALTH, { headers:{ "Accept":"application/json" } }, HEALTH_FETCH_TIMEOUT_MS, "D1 health-check");
        const data = await response.json();
        if(response.ok && data?.ok){
          storageStatus.d1Reachable = true;
          storageStatus.isPreviewDeployment = runtimeInfo().isPreviewDeployment;
          return { ok:true, data };
        }
        throw new Error(data?.error || `D1 health-check mislukt (${response.status}).`);
      }catch(error){
        if(storageStatus.stateSource !== "remote-d1") storageStatus.d1Reachable = false;
        storageStatus.lastError = error?.message || String(error || "D1 health-check mislukt.");
        recordWarning(storageStatus.lastError);
        return { ok:false, error };
      }
    },
    async identity(){
      try{
        const response = await fetchWithTimeout(API_IDENTITY, { headers:{ "Accept":"application/json" } }, IDENTITY_FETCH_TIMEOUT_MS, "Access identity");
        const data = await response.json().catch(()=>({}));
        if(!response.ok || !data?.ok){
          const error = new Error(data?.error || `Identiteit laden mislukt (${response.status}).`);
          error.status = response.status;
          throw error;
        }
        storageStatus.identityPresent = true;
        storageStatus.identityEmail = data.email || null;
        storageStatus.accessMissing = false;
        if(data.email) currentUser = { email:data.email, role:data.role || currentUser.role || "viewer" };
        if(!storageStatus.bootReady) markBootPhase("identity-ready");
        notify();
        return data;
      }catch(error){
        storageStatus.identityPresent = false;
        storageStatus.accessMissing = error?.status === 401 || /identiteit|access/i.test(String(error?.message || ""));
        if(!storageStatus.bootReady) markBootPhase("identity-failed-nonblocking");
        recordWarning(error?.message || "Access-identiteit niet beschikbaar.");
        notify();
        return null;
      }
    },
    async load(){
      // V57 compatibility marker: if(data.stateJson && typeof data.stateJson === "string"){ data.state = JSON.parse(data.stateJson); }
      // V60: request the large planning state as raw JSON body instead of a JSON
      // wrapper with stateJson. This prevents the Worker from stringifying a huge
      // wrapper object and solves the remaining 1102/503 state-load failures.
      markBootPhase("remote-state-loading");
      const bootTest = runtimeInfo().isLocal ? String(new URLSearchParams(location?.search || "").get("bootTest") || "") : "";
      const stateUrl = `${API_STATE}?payload=raw-state&chunks=auto${bootTest ? `&bootTest=${encodeURIComponent(bootTest)}` : ""}`;
      const response = await fetchWithTimeout(stateUrl, {
        headers:{
          "Accept":"application/json",
          "X-CWS-State-Response":"raw-state"
        }
      }, STATE_FETCH_TIMEOUT_MS, "D1 state-load");

      if(!response.ok){
        if(response.status === 401 || response.status === 403){
          storageStatus.accessMissing = response.status === 401;
          storageStatus.unsynced = true;
        }
        let message = `State laden mislukt (${response.status}).`;
        try{
          const err = await response.clone().json();
          if(err?.error) message = err.error;
        }catch(_){}
        const error = new Error(message);
        error.status = response.status;
        throw error;
      }

      const exists = response.headers.get("X-CWS-State-Exists") === "1";
      const version = Number(response.headers.get("X-CWS-Version") || 0);
      remoteVersion = Number.isFinite(version) ? version : 0;
      storageStatus.remoteVersion = remoteVersion;

      let raw = exists ? await response.text() : "";
      const chunkedManifest = response.headers.get("X-CWS-Chunked-Manifest") === "1";
      if(exists && chunkedManifest && raw){
        let manifest = null;
        try{
          manifest = JSON.parse(raw);
        }catch(error){
          throw new Error(`D1 chunk-manifest is ongeldige JSON (${error.message}).`);
        }
        raw = await loadChunkedRemoteStateBody(manifest, version);
      }

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
          email:response.headers.get("X-CWS-User-Email") || null,
          displayName:response.headers.get("X-CWS-User-Display-Name") || "",
          role:response.headers.get("X-CWS-User-Role") || "viewer",
          active:true
        },
        v60:{ rawStateResponse:true },
        v85:{ chunkedStateStreamingLoad: storageStatus.v85ChunkedStateStreamingLoad || false, marker: V85_D1_CHUNKED_STATE_STREAMING_LOAD_FIX }
      };
    },
    async save(snapshot){
      if(storageStatus.mode !== "api") return { ok:true, local:true };
      if(storageStatus.stateSource !== "remote-d1") {
        const error = new Error("Opslaan geblokkeerd: lokale fallback mag productie-D1 niet automatisch overschrijven.");
        error.cwsGuard = "v78-fallback-to-d1-guard";
        throw error;
      }
      const remoteSnapshot = createRemoteSaveSnapshot(snapshot);
      protectAgainstCatastrophicOverwrite(remoteSnapshot, "remote save");
      // V82: send a pruned remote projection. The Worker stores large states in
      // D1 chunks, while transient UI/diagnostic data stays local only.
      const stateJson = JSON.stringify(remoteSnapshot);
      const projectedBytes = new TextEncoder().encode(stateJson).byteLength;
      if(projectedBytes > V82_REMOTE_WARN_BYTES){
        storageStatus.lastWarning = `Grote D1-state (${projectedBytes} bytes); server gebruikt chunked save indien nodig.`;
      }
      const response = await fetchWithTimeout(`${API_STATE}?baseVersion=${encodeURIComponent(String(remoteVersion))}&payload=raw-state`, {
        method:"PUT",
        headers:{
          "Content-Type":"application/json; charset=utf-8",
          "Accept":"application/json",
          "X-CWS-Base-Version":String(remoteVersion),
          "X-CWS-State-Payload":"raw-state"
        },
        body:stateJson
      }, SAVE_FETCH_TIMEOUT_MS, "D1 state-save");
      const data = await response.json().catch(()=>({}));
      if(response.status === 409){
        const err = new Error(data.error || "State is gewijzigd door een andere gebruiker.");
        err.status = 409;
        err.currentVersion = data.currentVersion;
        throw err;
      }
      if(!response.ok || !data.ok){
        const err = new Error(data.error || `State opslaan mislukt (${response.status}).`);
        err.status = response.status;
        err.responseData = data;
        throw err;
      }
      remoteVersion = Number(data.version || remoteVersion);
      storageStatus.remoteVersion = remoteVersion;
      storageStatus.label = data?.v82?.chunked ? "Cloudflare D1 - chunked gedeelde testdata" : "Cloudflare D1 - gedeelde interne testdata";
      storageStatus.lastRemoteBytes = data?.bytes || remoteSnapshotBytes(snapshot);
      storageStatus.lastRemoteChunked = Boolean(data?.v82?.chunked);
      storageStatus.lastRemoteChunkCount = Number(data?.v82?.chunkCount || 0);
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

  const handleRemoteSaveError = (error) => {
    storageStatus.unsynced = true;
    storageStatus.lastError = error.message;
    if(error.cwsGuard === "v63-catastrophic-overwrite" || error.cwsGuard === "v72-validation-guard"){
      storageStatus.label = "D1 beveiligd - demo/lege overwrite geblokkeerd";
      storageAdapter.audit("save_guard_blocked", {
        message:error.message,
        remoteMetrics:error.remoteMetrics || remoteSafetySnapshot,
        localMetrics:error.localMetrics || stateMetrics(state)
      });
      try{ window.UI?.toast?.(error.message); }catch(_){}
    }else if(error.status === 409){
      clearRemoteSaveRetry();
      storageStatus.label = "D1 conflict - herladen nodig";
      storageAdapter.audit("d1_conflict", { message:error.message, currentVersion:error.currentVersion || null });
      try{ window.UI?.toast?.("Data is gewijzigd door een andere gebruiker. Herlaad om overschrijven te voorkomen."); }catch(_){}
    }else if(isTransientRemoteSaveError(error) && storageStatus.mode === "api" && storageStatus.stateSource === "remote-d1"){
      scheduleRemoteSaveRetry(error);
    }else{
      clearRemoteSaveRetry();
      try{ window.UI?.toast?.("Serveropslag niet bereikbaar - wijzigingen lokaal bewaard."); }catch(_){}
    }
  };

  function scheduleRemoteSaveRetry(error){
    if(remoteSaveRetryTimer) clearTimeout(remoteSaveRetryTimer);
    remoteSaveRetryAttempt += 1;
    const delay = Math.min(60000, 1500 * Math.pow(2, Math.min(remoteSaveRetryAttempt - 1, 5)));
    const retryAt = new Date(Date.now() + delay).toISOString();
    storageStatus.remoteSaveRetryScheduled = true;
    storageStatus.remoteSaveRetryAttempt = remoteSaveRetryAttempt;
    storageStatus.remoteSaveRetryAt = retryAt;
    storageStatus.remoteSaveLastTransientError = error.message;
    storageStatus.label = `D1 tijdelijk niet bereikbaar - retry ${remoteSaveRetryAttempt} gepland`;
    recordWarning(`D1 save tijdelijk mislukt; retry gepland (${error.message}).`);
    if(remoteSaveRetryAttempt === 1){
      try{ window.UI?.toast?.("D1 tijdelijk niet bereikbaar - automatisch opnieuw proberen."); }catch(_){}
    }
    remoteSaveRetryTimer = setTimeout(() => {
      remoteSaveRetryTimer = null;
      storageStatus.remoteSaveRetryScheduled = false;
      storageStatus.remoteSaveRetryAt = null;
      if(storageStatus.mode !== "api" || storageStatus.stateSource !== "remote-d1" || !storageStatus.unsynced) return;
      flushRemoteSaveQueue("remote-save-retry");
    }, delay);
  }

  const runRemoteSaveOnce = async (reason="user-mutation") => {
    const snapshot = createRemoteSaveSnapshot(state);
    const validation = validateState(snapshot);
    if(!validation.valid){
      const error = new Error(`Opslaan geblokkeerd: ${validation.errors[0] || "state-validatie mislukt."}`);
      error.cwsGuard = "v72-validation-guard";
      throw error;
    }
    protectAgainstCatastrophicOverwrite(snapshot, "remote save");
    await storageAdapter.save(snapshot);
    clearRemoteSaveRetry();
    markRemoteSaveOk(`remote-save-ok:${reason}`);
  };

  const flushRemoteSaveQueue = async (reason="user-mutation") => {
    if(remoteSaveInFlight){
      remoteSaveQueued = true;
      remoteSaveQueuedReason = reason;
      storageStatus.remoteSaveQueued = true;
      storageStatus.label = "Opslaan ingepland";
      notify();
      return true;
    }
    remoteSaveInFlight = true;
    storageStatus.remoteSaveInFlight = true;
    storageStatus.remoteSaveQueued = false;
    let currentReason = reason;
    try{
      do{
        remoteSaveQueued = false;
        remoteSaveQueuedReason = "";
        storageStatus.remoteSaveQueued = false;
        storageStatus.label = "Opslaan...";
        await runRemoteSaveOnce(currentReason);
        currentReason = remoteSaveQueuedReason || "queued-user-mutation";
      }while(remoteSaveQueued);
    }catch(error){
      remoteSaveQueued = false;
      remoteSaveQueuedReason = "";
      storageStatus.remoteSaveQueued = false;
      handleRemoteSaveError(error);
    }finally{
      remoteSaveInFlight = false;
      storageStatus.remoteSaveInFlight = false;
      notify();
    }
    return true;
  };

  const scheduleRemoteSave = (reason="user-mutation") => {
    if(initStarted && (!storageStatus.bootReady || storageStatus.bootPhase !== "app-ready")){
      storageStatus.savesBlockedDuringBoot += 1;
      recordWarning(`Remote save tijdens boot geblokkeerd (${reason}).`);
      return false;
    }
    if(storageStatus.stateSource !== "remote-d1"){
      recordWarning("Remote save geblokkeerd omdat de actieve state lokale fallback is.");
      return false;
    }
    if(saveTimer) clearTimeout(saveTimer);
    if(remoteSaveRetryTimer){
      clearTimeout(remoteSaveRetryTimer);
      remoteSaveRetryTimer = null;
      storageStatus.remoteSaveRetryScheduled = false;
      storageStatus.remoteSaveRetryAt = null;
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      flushRemoteSaveQueue(reason);
    }, 350);
    return true;
  };

  const validateState = (candidate=state) => {
    const errors = [];
    const warnings = [];
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
    // V68 COMPLETE FOUNDATION: hard tenant-state invariants before save.
    Object.entries(st.ganttV2?.byProject || {}).forEach(([projectId, model]) => {
      if(!byId[projectId]) errors.push(`Gantt-project ${projectId} heeft geen project in Projecten.`);
      const ids = new Set();
      (Array.isArray(model?.rows) ? model.rows : []).forEach((row, i) => {
        if(!row?.id) errors.push(`Gantt ${projectId}/${i}: taak zonder id.`);
        if(row?.id && ids.has(String(row.id))) errors.push(`Gantt ${projectId}: dubbele taak-id ${row.id}.`);
        if(row?.id) ids.add(String(row.id));
        const sc = model?.sched?.[row?.id] || {};
        if(row?.type !== "summary"){
          if(!row?.department) errors.push(`Gantt ${projectId}/${row?.id}: afdeling ontbreekt.`);
          if(sc?.start && sc?.end){
            const a = new Date(String(sc.start).slice(0,10) + "T00:00:00Z");
            const b = new Date(String(sc.end).slice(0,10) + "T00:00:00Z");
            if(Number.isFinite(a.getTime()) && Number.isFinite(b.getTime()) && b < a) errors.push(`Gantt ${projectId}/${row.id}: einddatum ligt vóór startdatum.`);
          }
        }
      });
    });
    Object.entries(st.ganttV2?.byProject || {}).forEach(([projectId, model]) => {
      const rows = Array.isArray(model?.rows) ? model.rows : [];
      const ids = new Set(rows.map(row => String(row?.id || "")).filter(Boolean));
      rows.forEach(row => {
        if(!row?.id) return;
        const schedule = model?.sched?.[row.id] || {};
        const start = schedule.start ? parseDiagnosticDate(schedule.start) : null;
        const end = schedule.end ? parseDiagnosticDate(schedule.end) : null;
        if(schedule.start && (!start || !Number.isFinite(start.getTime()))) errors.push(`Gantt ${projectId}/${row.id}: ongeldige startdatum.`);
        if(schedule.end && (!end || !Number.isFinite(end.getTime()))) errors.push(`Gantt ${projectId}/${row.id}: ongeldige einddatum.`);
        [row.predecessor, row.predecessors].filter(Boolean).forEach(value => {
          String(value).split(/[;,]/).map(token => token.trim()).filter(Boolean).forEach(token => {
            const predecessorId = token.replace(/(FS|SS|FF|SF)([+-]\d+)?$/i, "").trim();
            if(predecessorId && !ids.has(predecessorId)) errors.push(`Gantt ${projectId}/${row.id}: voorganger ${predecessorId} bestaat niet.`);
          });
        });
      });
      Object.keys(model?.sched || {}).forEach(rowId => {
        if(!ids.has(String(rowId))) warnings.push(`Gantt ${projectId}: verweesde schedule-key ${rowId}.`);
      });
    });
    const m = stateMetrics(st);
    const recoveryLock = (()=>{ try{ return JSON.parse(localStorage.getItem(V68_LOCK_KEY)||"null"); }catch(_){ return null; } })();
    if(recoveryLock?.locked && m.projectCount < Number(recoveryLock.minProjects || 20)){
      errors.push(`V68 recovery-lock: opslaan geweigerd omdat state ${m.projectCount} projecten bevat en lock minimaal ${recoveryLock.minProjects} verwacht.`);
    }
    const diagnostics = collectGanttDiagnostics(st);
    lastValidation = { valid:errors.length === 0, errors, warnings, diagnostics, blockingErrors:errors };
    return lastValidation;
  };

  const buildLiveReadinessReport = (candidate=state) => {
    const st = normalizeState(deepClone(candidate || state));
    rebuildGanttHoursByDay(st);
    const metrics = stateMetrics(st);
    const validation = validateState(st);
    const ganttProjects = Object.entries(st.ganttV2?.byProject || {});
    const projectIds = new Set(st.projects?.order || Object.keys(st.projects?.byId || {}));
    const orphanGanttProjects = ganttProjects.map(([pid]) => pid).filter(pid => !projectIds.has(pid));
    const emptyGanttProjectSelection = metrics.projectCount > 0 && metrics.ganttProjectCount === 0;
    const workingDayHourViolations = [];
    Object.entries(st.gantt?.hoursByDay || {}).forEach(([iso, byDept]) => {
      if(!getGlobalNonWorkISO(st, iso)) return;
      const total = Object.values(byDept || {}).reduce((sum, value) => sum + Math.max(0, baseNum(value)), 0);
      if(total > 0) workingDayHourViolations.push({ iso, total });
    });
    const longTasks = [];
    ganttProjects.forEach(([projectId, model]) => {
      (model?.rows || []).forEach(row => {
        if(!row || row.type === 'summary') return;
        const sc = model?.sched?.[row.id] || {};
        const wd = Math.max(baseNum(sc.workdays), baseNum(row.workdays), baseNum(row.duration), baseNum(row.days));
        if(wd >= 20) longTasks.push({ projectId, taskId:row.id, name:row.name || row.id, workdays:wd });
      });
    });
    const errors = [];
    const warnings = [];
    if(metrics.projectCount <= 5 && Number(remoteSafetySnapshot?.projectCount || 0) >= 20) errors.push('Browserstate bevat 0/1/5 projecten terwijl remote veel projecten bevat.');
    if(metrics.projectCount === 0) warnings.push('Geen projecten in actuele runtime-state.');
    if(emptyGanttProjectSelection) warnings.push('Projecten aanwezig maar geen Gantt-projectmodellen gevonden.');
    if(orphanGanttProjects.length) errors.push(`Gantt bevat ${orphanGanttProjects.length} project(en) zonder projectrecord.`);
    if(workingDayHourViolations.length) errors.push(`Er staan uren op ${workingDayHourViolations.length} niet-werkbare dag(en).`);
    if(!validation.valid) warnings.push(...validation.errors.slice(0,10));
    const diagnostics = collectGanttDiagnostics(st);
    if(diagnostics.orphanScheduleCount) warnings.push(`${diagnostics.orphanScheduleCount} verweesde schedule-key(s).`);
    if(diagnostics.orphanPredecessorCount) errors.push(`${diagnostics.orphanPredecessorCount} verweesde voorganger(s).`);
    if(diagnostics.invalidDateCount) errors.push(`${diagnostics.invalidDateCount} ongeldige Gantt-datum/datumreeks(en).`);
    if(diagnostics.missingDepartmentCount) errors.push(`${diagnostics.missingDepartmentCount} taak/taken zonder afdeling.`);
    const report = {
      ok: errors.length === 0,
      marker: V72_COMPLETE_HARDENING_MARKER,
      compatibilityMarker: V70_LIVE_STABILITY_MARKER,
      createdAt: new Date().toISOString(),
      storage: { ...storageStatus },
      remoteSafety: { ...remoteSafetySnapshot },
      metrics,
      validation,
      gantt: {
        projectModels: metrics.ganttProjectCount,
        rows: metrics.ganttRowCount,
        longTasks: longTasks.slice(0,25),
        longTaskCount: longTasks.length,
        orphanGanttProjects
      },
      capacity: {
        hourDays: metrics.hourDays,
        sourceCount: metrics.sourceCount,
        workingDayHourViolations: workingDayHourViolations.slice(0,25)
      },
      diagnostics,
      errors,
      warnings
    };
    storageStatus.liveReadiness = report;
    return report;
  };

  const markRemoteSaveOk = (label='remote-save-ok') => {
    storageStatus.unsynced = false;
    storageStatus.lastError = null;
    storageStatus.lastSuccessfulRemoteVersion = remoteVersion;
    storageStatus.lastSuccessfulSaveAt = new Date().toISOString();
    state.meta.dirty = false;
    state.meta.lastSuccessfulRemoteVersion = remoteVersion;
    state.meta.lastSuccessfulSaveAt = storageStatus.lastSuccessfulSaveAt;
    rememberLastGoodSnapshot(state, label);
    appendAudit(state, "last_good_snapshot_created", {
      label,
      remoteVersion,
      metrics:stateMetrics(state)
    });
    writeLocalSnapshot(state);
  };

  const save = ({ userAction=false, reason="state-save" }={}) => {
    if(initStarted && (!storageStatus.bootReady || storageStatus.bootPhase !== "app-ready")){
      storageStatus.savesBlockedDuringBoot += 1;
      recordWarning(`Save tijdens boot geblokkeerd (${reason}).`);
      return false;
    }
    if(!userAction){
      recordWarning(`Automatische save zonder gebruikersactie geblokkeerd (${reason}).`);
      return false;
    }
    const result = validateState(state);
    if(!result.valid){
      try{ window.UI?.toast?.("Opslaan geweigerd: " + result.errors[0]); }catch(_){}
      console.error("CWS state validation failed", result.errors);
      return false;
    }
    try{
      rememberLastGoodSnapshot(state, "before-save");
      writeLocalSnapshot(state);
      lastUserActionAt = new Date().toISOString();
      if(storageStatus.mode === "api") scheduleRemoteSave(reason);
      return true;
    }catch(error){
      console.error("CWS state save failed", error);
      return false;
    }
  };

  const scheduleDeferredPersistence = (reason="deferred-gantt-interaction") => {
    // V74: drag/resize must not block the pointerup thread with full JSON
    // localStorage writes, last-good snapshot serialization and optional D1 save.
    // Coalesce rapid Gantt interactions and persist immediately after the UI has
    // repainted. This preserves the tenant state while preventing the perceived
    // browser freeze during moving/resizing bars.
    if(deferredPersistenceTimer) clearTimeout(deferredPersistenceTimer);
    deferredPersistenceTimer = setTimeout(() => {
      deferredPersistenceTimer = null;
      try{
        state.meta = state.meta || {};
        state.meta.lastDeferredPersistenceReason = reason;
        save({ userAction:true, reason });
      }catch(error){
        console.error("CWS deferred persistence failed", error);
        storageStatus.unsynced = true;
        storageStatus.lastError = error.message;
      }
    }, 180);
  };

  const notify = () => {
    if(storageStatus.booting) storageStatus.rendersDuringBoot += 1;
    subs.forEach(fn => { try{ fn(state); }catch(_){ } });
  };

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

  const setState = (mutator, options={}) => {
    if(storageStatus.booting){
      storageStatus.setStateCallsDuringBoot += 1;
      storageStatus.savesBlockedDuringBoot += 1;
      recordWarning(`setState tijdens boot geblokkeerd (${options.reason || "onbekend"}).`);
      return state;
    }
    const before = deepClone(state);
    const draft = deepClone(state);
    const resultValue = mutator(draft);
    const next = resultValue && typeof resultValue === "object" && !Array.isArray(resultValue) ? resultValue : draft;

    // V77: detect UI/session-only changes before expensive normalization/rebuild.
    // Router boot/app switching must never recalculate the complete Gantt/capacity
    // model or trigger a remote save. This was a major whole-site boot slowdown.
    const beforeTenantRaw = JSON.stringify(tenantProjection(before));
    const nextTenantRaw = JSON.stringify(tenantProjection(next));
    const tenantChangedRaw = beforeTenantRaw !== nextTenantRaw;
    if(!tenantChangedRaw){
      state = next;
      state.meta = state.meta || {};
      state.meta.updatedAt = new Date().toISOString();
      state.meta.v77UiOnlyFastPath = true;
      if(storageStatus.bootReady) {
        try{ writeLocalSnapshot(state); }catch(_){}
      }
      notify();
      return state;
    }

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

    undoStack.push(before);
    if(undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    state = next;
    state.meta = state.meta || {};
    state.meta.updatedAt = new Date().toISOString();
    const userAction = options.userAction !== false;
    if(!save({ userAction, reason:options.reason || "setState" })){ state = before; return state; }
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
    if(initStarted && (storageStatus.booting || !storageStatus.bootReady)){
      storageStatus.savesBlockedDuringBoot += 1;
      recordWarning(`Mutatie tijdens boot geblokkeerd (${action || "onbekend"}).`);
      return { ok:false, errors:["App-state wordt nog geladen."], state };
    }
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
    const mutationPayload = typeof payload === "function" ? {} : (payload || {});
    if(
      (action === "gantt_task_moved" || action === "gantt_task_resized") &&
      mutationPayload.projectId && mutationPayload.rowId &&
      mutationPayload.start && mutationPayload.end
    ){
      const model = next.ganttV2?.byProject?.[mutationPayload.projectId];
      const row = model?.rows?.find(item => String(item?.id) === String(mutationPayload.rowId));
      if(model && row){
        const current = model.sched?.[mutationPayload.rowId] || {};
        const workdays = Math.max(
          1,
          baseNum(mutationPayload.workdays) ||
          baseNum(current.workdays) ||
          getTaskWorkdays(next, mutationPayload.start, mutationPayload.end).length ||
          baseNum(row.duration) ||
          1
        );
        model.sched[mutationPayload.rowId] = {
          ...current,
          start:mutationPayload.start,
          end:mutationPayload.end,
          workdays,
          explicitRange:true
        };
        row.duration = workdays;
      }
    }
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
    const payloadMeta = typeof payload === "function" ? {} : (payload || {});
    const deferPersistence = payloadMeta.deferPersistence === true || payloadMeta.deferHeavySave === true;
    if(deferPersistence){
      scheduleDeferredPersistence(action);
    }else{
      save({ userAction:true, reason:action || "mutate" });
    }
    notify();
    storageAdapter.audit(action, payloadMeta);
    return { ok:true, state };
  };

  const restoreSnapshot = (source, target) => {
    if(!source.length) return false;
    target.push(deepClone(state));
    state = normalizeState(source.pop());
    rebuildGanttHoursByDay(state);
    state.meta.updatedAt = new Date().toISOString();
    save({ userAction:true, reason:"history-restore" });
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
      save({ userAction:true, reason:`audit:${action}` });
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
      let scanned = 0;
      while(d <= d1 && scanned < MAX_GANTT_DATE_SCAN_DAYS){
        if(isWorkdayUTC(st, d)) out.add(isoDateUTC(d));
        d = addDaysUTC(d, 1);
        scanned += 1;
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
    if(!hasPermission("admin_settings")){
      audit("clear_data_attempt_blocked", { reason:"permission", role:state.user?.role || "unknown" });
      toast("Alleen een beheerder kan alle data wissen.", "error");
      return false;
    }
    createRecoverySnapshot("before_clear_all");
    audit("clear_data");
    localStorage.removeItem(KEY_TENANT);
    localStorage.removeItem(KEY_GLOBAL);
    state = defaultState();
    undoStack.length = 0;
    redoStack.length = 0;
    save({ userAction:true, reason:"clear-all" });
    notify();
    return true;
  };

  const resetDemo = () => {
    if(!hasPermission("admin_settings")){
      audit("demo_data_attempt_blocked", { reason:"permission", role:state.user?.role || "unknown" });
      toast("Alleen een beheerder kan demo data laden.", "error");
      return false;
    }
    createRecoverySnapshot("before_demo_reset");
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
    save({ userAction:true, reason:"reset-demo" });
    notify();
    audit("reset_demo");
    return true;
  };

  const getTaskWorkdays = (st, startIso, endIso) => {
    const out = [];
    if(!startIso || !endIso) return out;
    let d0 = new Date(String(startIso).slice(0,10) + "T00:00:00Z");
    let d1 = new Date(String(endIso).slice(0,10) + "T00:00:00Z");
    if(!Number.isFinite(d0.getTime()) || !Number.isFinite(d1.getTime())) return out;
    if(d1 < d0){ const t=d0; d0=d1; d1=t; }
    let d = d0;
    let scanned = 0;
    while(d <= d1 && scanned < MAX_GANTT_DATE_SCAN_DAYS){
      if(isWorkdayUTC(st, d)){
        const iso = isoDateUTC(d);
        if(!getGlobalNonWorkISO(st, iso)) out.push(iso);
      }
      d = addDaysUTC(d, 1);
      scanned += 1;
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
    const total = Math.min(MAX_GANTT_WORKDAYS, Math.max(1, Number(workdays)||1));
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

  const normalizeGanttModelSchedules = (st, model, options={}) => {
    if(!model || !Array.isArray(model.rows)) return model || { rows:[], sched:{} };
    model.sched = model.sched && typeof model.sched === "object" ? model.sched : {};
    model.rows.forEach(row => {
      if(!row || row.type === "summary" || row.type === "phase") return;
      const sc = model.sched[row.id] || {};
      if(options.preserveExplicitRange && sc.start && sc.end && sc.start <= sc.end){
        const explicitWorkdays = Math.max(
          1,
          baseNum(sc.workdays) ||
          getTaskWorkdays(st, sc.start, sc.end).length ||
          baseNum(row.duration || row.days || row.duur) ||
          1
        );
        model.sched[row.id] = { ...sc, start:sc.start, end:sc.end, workdays:explicitWorkdays };
        row.duration = explicitWorkdays;
        return;
      }
      const scheduleWorkdays = sc.start && sc.end ? getTaskWorkdays(st, sc.start, sc.end).length : 0;
      const preferred = Math.max(1, scheduleWorkdays || baseNum(row.duration || row.days || row.duur) || 1);
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

  // V86: explicit capacity-from-Gantt contract names. These wrap the existing V58/V59
  // SSOT implementation so Capaciteit stays derived from Gantt hoursByDay/sourcesByDay.
  const buildHoursByDayFromGantt = (target=state) => rebuildGanttHoursByDay(target).hoursByDay;
  const buildSourcesByDayFromGantt = (target=state) => rebuildGanttHoursByDay(target).sourcesByDay;
  const recalculateCapacityFromGantt = (target=state) => rebuildGanttHoursByDay(target);

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
    saveProjectGantt(projectId, model, mutationMeta={}){
      const action = mutationMeta.action || "gantt_save";
      return mutate(action, { projectId, ...mutationMeta }, draft => {
        draft.ganttV2 = draft.ganttV2 || { byProject:{}, ui:{} };
        draft.ganttV2.byProject = draft.ganttV2.byProject || {};
        const preserveExplicitRange = action === "gantt_task_moved" || action === "gantt_task_resized";
        draft.ganttV2.byProject[projectId] = normalizeGanttModelSchedules(
          draft,
          deepClone(model),
          { preserveExplicitRange }
        );
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


  const importRawState = (raw, label="manual-import") => {
    const preview = previewImport(raw);
    if(!preview.ok) return { ok:false, errors:preview.errors || ["Import mislukt."], metrics:preview.metrics, validation:preview.validation };
    const next = preview.state;
    const validation = preview.validation;
    const metrics = preview.metrics;
    if(!stateHasBusinessData(next)) return { ok:false, errors:["Import bevat geen bruikbare projecten/taken."], metrics };
    if(!validation.valid) return { ok:false, errors:validation.errors, metrics, validation };
    const previousMetrics = stateMetrics(state);
    createRecoverySnapshot("before-import");
    rememberLastGoodSnapshot(state, "before-import");
    state = next;
    state.meta = state.meta || {};
    state.meta.importedAt = new Date().toISOString();
    state.meta.importLabel = label;
    state.meta.v68CompleteFoundation = true;
    appendAudit(state, "import_executed", { label, metrics, previousMetrics });
    rememberLastGoodSnapshot(state, label);
    if(metrics.projectCount >= 20) setRecoveryLock(metrics.projectCount, `import-${label}`);
    save({ userAction:true, reason:`import:${label}` });
    notify();
    return { ok:true, validation, metrics, state };
  };

  const loadRestoredD1Fixture = () => importRawState(createRestoredD1Fixture(), "v67-restored-d1-fixture");

  const exportStateJson = () => JSON.stringify(state, null, 2);

  // V68 COMPLETE FOUNDATION: import preview, SQL extraction, state doctor and recovery-lock.
  const extractStateJsonFromAnyText = (input) => {
    if(input && typeof input === "object") return input;
    const raw = String(input || "").trim();
    if(!raw) throw new Error("Geen state JSON aangeleverd.");
    try{ return JSON.parse(raw); }catch(_e){}

    // D1 export usually contains an INSERT row with the JSON state in a SQL string.
    // We try multiple safe patterns before falling back to balanced JSON extraction.
    const unescapeSql = (txt) => txt.replace(/''/g, "'").replace(/\\"/g, '\"');
    const directStart = raw.indexOf('{"schemaVersion"');
    if(directStart >= 0){
      const directEnd = raw.lastIndexOf('}');
      if(directEnd > directStart){
        const candidate = raw.slice(directStart, directEnd + 1);
        try{ return JSON.parse(candidate); }catch(_e){}
      }
    }
    const insertCandidates = [];
    const re = /'([^']*(?:schemaVersion|projects|ganttV2)[^']*)'/g;
    let match;
    while((match = re.exec(raw))){ insertCandidates.push(unescapeSql(match[1])); if(insertCandidates.length > 25) break; }
    for(const candidate of insertCandidates){
      const a = candidate.indexOf('{');
      const b = candidate.lastIndexOf('}');
      if(a >= 0 && b > a){
        try{ return JSON.parse(candidate.slice(a,b+1)); }catch(_e){}
      }
    }
    const jsonish = raw.replace(/\r?\n/g, " ");
    const a = jsonish.indexOf('{');
    const b = jsonish.lastIndexOf('}');
    if(a >= 0 && b > a){
      try{ return JSON.parse(unescapeSql(jsonish.slice(a,b+1))); }catch(_e){}
    }
    throw new Error("Geen bruikbare state_json gevonden. Upload/plak JSON of D1 SQL-export met app_state.state_json.");
  };

  const previewImport = (raw) => {
    try{
      const parsed = extractStateJsonFromAnyText(raw);
      const next = normalizeState(deepClone(parsed));
      rebuildGanttHoursByDay(next);
      const validation = validateState(next);
      const metrics = stateMetrics(next);
      const currentMetrics = stateMetrics(state);
      const delta = {
        projects:metrics.projectCount - currentMetrics.projectCount,
        ganttRows:metrics.ganttRowCount - currentMetrics.ganttRowCount,
        hourDays:metrics.hourDays - currentMetrics.hourDays
      };
      return {
        ok:stateHasBusinessData(next),
        canImport:stateHasBusinessData(next) && validation.valid,
        metrics,
        currentMetrics,
        delta,
        validation,
        errors:stateHasBusinessData(next) ? validation.errors : ["Import bevat geen businessdata."],
        state:next
      };
    }catch(error){
      return { ok:false, errors:[error.message], metrics:null, validation:{ valid:false, errors:[error.message] } };
    }
  };

  const buildStateDoctorReport = (candidate=state) => {
    const st = normalizeState(deepClone(candidate || state));
    rebuildGanttHoursByDay(st);
    const metrics = stateMetrics(st);
    const validation = validateState(st);
    const checks = [];
    const add = (id, ok, detail="") => checks.push({ id, ok:!!ok, status:ok?"OK":"FOUT", detail });
    add("projects-present", metrics.projectCount >= 1, `${metrics.projectCount} projecten`);
    add("legacy-project-schema", metrics.hasLegacyObjectSchema, "projects.order/byId aanwezig");
    add("gantt-present", metrics.ganttRowCount >= 1, `${metrics.ganttRowCount} Gantt-rijen`);
    add("capacity-hours-present", metrics.hourDays >= 1 || metrics.ganttRowCount === 0, `${metrics.hourDays} dagen met uren`);
    add("validation", validation.valid, validation.errors.slice(0,5).join(" | "));
    const orphanGantt = Object.keys(st.ganttV2?.byProject || {}).filter(pid => !st.projects?.byId?.[pid]);
    add("no-orphan-gantt-projects", orphanGantt.length === 0, orphanGantt.slice(0,5).join(", "));
    const weekendHours = Object.entries(st.gantt?.hoursByDay || {}).filter(([iso, depts]) => getGlobalNonWorkISO(st, iso) && Object.values(depts || {}).some(v => Number(v)>0));
    add("no-weekend-hours", weekendHours.length === 0, `${weekendHours.length} dagen met uren op niet-werkbare dag`);
    const longBars = Object.values(st.ganttV2?.byProject || {}).flatMap(model => (model?.rows||[]).filter(r => r.type!=="summary").map(r => ({ row:r, sc:model.sched?.[r.id]||{} }))).filter(x => Number(x.sc?.workdays || x.row?.duration || 0) >= 20);
    add("long-gantt-bars-detectable", longBars.length >= 1 || metrics.ganttRowCount === 0, `${longBars.length} lange taken gevonden`);
    const diagnostics = collectGanttDiagnostics(st);
    add("no-orphan-schedules", diagnostics.orphanScheduleCount === 0, `${diagnostics.orphanScheduleCount} verweesde schedule-key(s)`);
    add("no-orphan-predecessors", diagnostics.orphanPredecessorCount === 0, `${diagnostics.orphanPredecessorCount} verweesde voorganger(s)`);
    add("valid-gantt-dates", diagnostics.invalidDateCount === 0, `${diagnostics.invalidDateCount} ongeldige datumreeks(en)`);
    add("tasks-have-departments", diagnostics.missingDepartmentCount === 0, `${diagnostics.missingDepartmentCount} taak/taken zonder afdeling`);
    const hourValidation = Array.isArray(st.gantt?.projectDeptHoursValidation) ? st.gantt.projectDeptHoursValidation : [];
    const distributedHours = new Map();
    Object.values(st.gantt?.sourcesByDay || {}).forEach(departments => {
      Object.entries(departments || {}).forEach(([dept, sources]) => {
        (Array.isArray(sources) ? sources : []).forEach(source => {
          const key = `${source.projectId || ""}::${dept}`;
          distributedHours.set(key, (distributedHours.get(key) || 0) + Number(source.hours || 0));
        });
      });
    });
    const hourMismatches = hourValidation.map(row => {
      const distributed = distributedHours.get(`${row.projectId || ""}::${row.dept || ""}`) || 0;
      return { ...row, distributedHours:distributed, delta:distributed - Number(row.projectDeptHours || 0) };
    }).filter(row => Math.abs(row.delta) > 0.01);
    add("project-hours-match-gantt", hourMismatches.length === 0, `${hourMismatches.length} afwijking(en)`);
    const createdAt = new Date().toISOString();
    if(candidate === state){
      state.meta.lastStateDoctorAt = createdAt;
      writeLocalSnapshot(state);
    }
    return { ok:checks.every(c=>c.ok), createdAt, marker:V72_COMPLETE_HARDENING_MARKER, compatibilityMarker:V68_COMPLETE_MARKER, metrics, validation, diagnostics, hourMismatches:hourMismatches.slice(0,50), checks };
  };

  const setRecoveryLock = (minProjects=null, reason="manual") => {
    const metrics = stateMetrics(state);
    const lock = { locked:true, minProjects:Number(minProjects || Math.max(20, metrics.projectCount || 20)), reason, metrics, createdAt:new Date().toISOString() };
    localStorage.setItem(V68_LOCK_KEY, JSON.stringify(lock));
    return { ok:true, lock };
  };

  const clearRecoveryLock = () => { localStorage.removeItem(V68_LOCK_KEY); return { ok:true }; };

  const getRecoveryLock = () => { try{ return JSON.parse(localStorage.getItem(V68_LOCK_KEY)||"null"); }catch(_){ return null; } };

  const createRecoverySnapshot = (label="manual") => {
    const metrics = stateMetrics(state);
    try{
      localStorage.setItem(V67_RECOVERY_SNAPSHOT_KEY, JSON.stringify({ label, createdAt:new Date().toISOString(), metrics, state }));
      rememberLastGoodSnapshot(state, `snapshot-${label}`);
      appendAudit(state, "recovery_snapshot_created", { label, metrics });
      writeLocalSnapshot(state);
      return { ok:true, metrics };
    }catch(error){ return { ok:false, errors:[error.message], metrics }; }
  };

  const restoreLastGoodSnapshot = () => {
    const packed = readLastGoodSnapshot();
    if(!packed?.state) return { ok:false, errors:["Geen laatste goede snapshot gevonden."] };
    const result = importRawState(packed.state, `restore-${packed.label || "last-good"}`);
    if(result.ok){
      appendAudit(state, "restore_executed", { label:packed.label || "last-good", metrics:result.metrics });
      save({ userAction:true, reason:"restore-last-good" });
    }
    return result;
  };


  const needsBootCapacityRebuild = (candidate) => {
    const m = stateMetrics(candidate || state);
    return m.ganttRowCount > 0 && (!m.hourDays || !candidate?.gantt?.sourcesByDay || !Object.keys(candidate.gantt.sourcesByDay || {}).length);
  };

  const schedulePostBootIntegrityCheck = (reason="boot") => {
    if(storageStatus.deferredIntegrityScheduled) return;
    storageStatus.deferredIntegrityScheduled = true;
    scheduleIdle(() => {
      try{
        state.meta = state.meta || {};
        state.meta.v78PostBootIntegrityStartedAt = new Date().toISOString();
        const diagnostics = collectGanttDiagnostics(state);
        const metrics = stateMetrics(state);
        const report = {
          ok:diagnostics.invalidDateCount === 0 && diagnostics.orphanPredecessorCount === 0,
          lightweight:true,
          fullStateDoctorDeferred:true,
          createdAt:new Date().toISOString(),
          metrics,
          diagnostics
        };
        state.meta.v78PostBootIntegrityFinishedAt = new Date().toISOString();
        state.meta.v78PostBootIntegrityReason = reason;
        state.meta.v79AutomaticCapacityRebuildDeferred = needsBootCapacityRebuild(state);
        storageStatus.liveReadiness = report;
      }catch(error){
        storageStatus.lastError = `Post-boot controle kon niet volledig draaien: ${error.message}`;
        recordWarning(storageStatus.lastError);
      }
    }, 8000);
  };

  let bootSnapshotTimer = null;
  const scheduleBootSnapshotPersistence = (snapshot, label="remote-d1-load") => {
    if(bootSnapshotTimer) clearTimeout(bootSnapshotTimer);
    bootSnapshotTimer = setTimeout(() => {
      scheduleIdle(() => {
        try{
          const raw = JSON.stringify(snapshot);
          const createdAt = new Date().toISOString();
          const metrics = stateMetrics(snapshot);
          localStorage.setItem(KEY_TENANT, raw);
          setTimeout(() => {
            try{ localStorage.setItem(KEY_GLOBAL, raw); }catch(_){}
          }, 250);
          setTimeout(() => {
            try{ localStorage.setItem(KEY_BACKUP, raw); }catch(_){}
          }, 500);
          if(Number(metrics.projectCount || 0) >= 20){
            setTimeout(() => {
              try{
                const prefix = JSON.stringify({ label, createdAt, metrics }).slice(0, -1);
                localStorage.setItem(V67_LAST_GOOD_KEY, `${prefix},"state":${raw}}`);
              }catch(_){}
            }, 750);
          }
        }catch(error){
          recordWarning(`Lokale herstelcache kon niet worden bijgewerkt: ${error.message}`);
        }
      }, 8000);
    }, 3000);
  };

  // V77 compatibility notes for V63 static preflight:
  // V63: recovery hydration is authoritative. stateHasBusinessData(incoming) remains the hydration gate.
  // The old V63 boot path did: rebuildGanttHoursByDay(incoming); const validation = validateState(incoming);
  // V77 intentionally defers the heavy rebuild/validation until after first paint.
  // UI-only route/tab updates must never trigger a remote D1 PUT. Compatibility sample: if(!tenantChanged){ writeLocalSnapshot(state); }
  // empty D1 response must not be repaired by auto-uploading browser default state.
  const initV77Legacy = async () => {
    const bootStarted = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    markBootPhase("start", { booting:true, bootReady:false, accessMissing:false, isPreviewDeployment:runtimeInfo().isPreviewDeployment });
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
          markBootPhase("normalizing-remote-state");
          const incoming = normalizeState(remote.state);
          const incomingMetrics = stateMetrics(incoming);
          remoteSafetySnapshot = { ...incomingMetrics, bytes:Number(remote.bytes || 0), version:remoteVersion, loadedAt:new Date().toISOString() };
          if(stateHasBusinessData(incoming)){
            state = incoming;
            state.meta = state.meta || {};
            state.meta.v77BootLoadedFromD1 = true;
            state.meta.v77BootLoadedAt = new Date().toISOString();
            rememberLastGoodSnapshot(state, "remote-d1-load");
            writeLocalSnapshot(state);
            storageStatus.mode = "api";
            storageStatus.label = `Cloudflare D1 - gedeelde interne testdata (${remoteSafetySnapshot.projectCount} projecten)`;
            storageStatus.lastError = null;
            storageStatus.unsynced = false;
            // V70 compatibility marker: storageStatus.unsynced = false; D1 legacy warnings are stored as liveValidationWarnings after hydration.
          }else{
            storageStatus.unsynced = true;
            storageStatus.lastError = `D1-state bevat geen bruikbare projecten/taken.`;
          }
        }else{
          storageStatus.unsynced = stateHasBusinessData(state);
          if(storageStatus.unsynced){
            storageStatus.lastError = "D1 gaf geen state terug; lokale data niet automatisch geüpload.";
          }
        }
      }catch(error){
        storageStatus.mode = "local";
        storageStatus.accessMissing = Boolean(error?.status === 401 || /Access-identiteit|401/.test(String(error?.message || "")));
        storageStatus.label = runtimeInfo().isPreviewDeployment ? "Preview/fallback - D1 niet bereikbaar" : "D1 niet bereikbaar - lokale fallback";
        storageStatus.unsynced = true;
        storageStatus.lastError = error.message;
        if(stateHasBusinessData(state)){
          writeLocalSnapshot(state);
        }
      }
    }

    markBootPhase("finalizing-runtime-state");
    state = state;
    state.user = state.user || {};
    state.user.email = currentUser.email;
    state.ui = state.ui || deepClone(defaultState().ui);
    state.roles = state.roles && typeof state.roles === "object" && !Array.isArray(state.roles) ? state.roles : deepClone(DEFAULT_ROLES);
    if(storageStatus.mode === "api"){
      state.user.role = currentUser.role;
      state.ui.role = state.roles?.[currentUser.role]?.name || currentUser.role;
    }
    state.meta = state.meta || {};
    state.meta.v77AppBootFix = true;
    state.meta.v77BootMarker = V77_APP_BOOT_D1_ACCESS_PRODUCTION_FIX;
    const bootEnded = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    storageStatus.bootDurationMs = Math.round(bootEnded - bootStarted);
    markBootPhase("ready", { booting:false, bootReady:true, bootDurationMs:storageStatus.bootDurationMs });
    notify();
    schedulePostBootIntegrityCheck("after-init");
    return { storage:{...storageStatus}, user:{...currentUser}, liveReadiness:storageStatus.liveReadiness, marker:V77_APP_BOOT_D1_ACCESS_PRODUCTION_FIX };
  };

  const init = () => {
    if(initPromise) return initPromise;
    initStarted = true;
    initPromise = (async() => {
      const bootStarted = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      const runtime = runtimeInfo();
      const localCandidate = state;
      markBootPhase("booting", {
        booting:true,
        bootReady:false,
        accessMissing:false,
        isPreviewDeployment:runtime.isPreviewDeployment,
        stateSource:"pending"
      });

      if(runtime.isLocal) currentUser = { email:"local-dev@cws.test", role:state.user?.role || "admin" };

      markBootPhase("identity-loading");
      const identityPromise = storageAdapter.identity();
      const healthPromise = storageAdapter.detect();

      try{
        markBootPhase("remote-state-loading");
        const remote = await storageAdapter.load();
        storageStatus.d1Reachable = true;
        remoteVersion = Number(remote?.version || 0);
        storageStatus.remoteVersion = remoteVersion;

        if(remote?.user?.email){
          currentUser = { email:remote.user.email, role:remote.user.role || "viewer" };
          storageStatus.identityPresent = true;
          storageStatus.identityEmail = remote.user.email;
          storageStatus.accessMissing = false;
        }

        if(remote?.exists && remote.state && typeof remote.state === "object"){
          const incoming = normalizeState(remote.state);
          const incomingMetrics = stateMetrics(incoming);
          remoteSafetySnapshot = {
            ...incomingMetrics,
            bytes:Number(remote.bytes || 0),
            version:remoteVersion,
            loadedAt:new Date().toISOString()
          };

          if(stateHasAuthoritativeBusinessData(incoming, remoteSafetySnapshot)){
            state = incoming;
            state.meta = state.meta || {};
            state.meta.v78BootLoadedFromD1 = true;
            state.meta.v78BootLoadedAt = new Date().toISOString();
            storageStatus.mode = "api";
            storageStatus.stateSource = "remote-d1";
            storageStatus.label = `Cloudflare D1 - gedeelde interne testdata (${remoteSafetySnapshot.projectCount} projecten)`;
            storageStatus.lastError = null;
            storageStatus.unsynced = false;
            storageStatus.lastSuccessfulD1LoadAt = new Date().toISOString();
            scheduleBootSnapshotPersistence(state, "remote-d1-load");
            markBootPhase("remote-state-ready");
          }else{
            markBootPhase("local-fallback-considered");
            storageStatus.mode = "local";
            storageStatus.stateSource = runtime.isLocal && /restored-d1|fixture/i.test(String(location?.search || "")) ? "fixture" : "local-fallback";
            storageStatus.label = "D1 leeg/onvolledig - lokale fallback";
            storageStatus.unsynced = true;
            storageStatus.lastError = "D1-state bevat geen volledige businessdata; lokale data is niet naar D1 geschreven.";
            recordWarning(storageStatus.lastError);
            state = localCandidate;
          }
        }else{
          markBootPhase("local-fallback-considered");
          storageStatus.mode = "local";
          storageStatus.stateSource = runtime.isLocal && /restored-d1|fixture/i.test(String(location?.search || "")) ? "fixture" : "local-fallback";
          storageStatus.label = "D1 leeg - lokale fallback";
          storageStatus.unsynced = stateHasBusinessData(localCandidate);
          storageStatus.lastError = "D1 gaf geen state terug; lokale data is niet automatisch geupload.";
          recordWarning(storageStatus.lastError);
          state = localCandidate;
        }
      }catch(error){
        markBootPhase("remote-state-failed");
        storageStatus.mode = "local";
        storageStatus.d1Reachable = false;
        storageStatus.accessMissing = Boolean(error?.status === 401 || /Access-identiteit|401/.test(String(error?.message || "")));
        storageStatus.stateSource = runtime.isLocal && /restored-d1|fixture/i.test(String(location?.search || "")) ? "fixture" : "local-fallback";
        storageStatus.label = runtime.isPreviewDeployment ? "Preview/fallback - D1 niet bereikbaar" : "D1 niet bereikbaar - lokale fallback";
        storageStatus.unsynced = true;
        storageStatus.lastError = error.message;
        recordWarning(error.message);
        state = localCandidate;
        markBootPhase("local-fallback-considered");
      }

      // Local state was normalized by load(); remote state was normalized above.
      // The selected boot source is not normalized a second time.
      state.user = state.user || {};
      state.ui = state.ui || deepClone(defaultState().ui);
      state.roles = state.roles && typeof state.roles === "object" && !Array.isArray(state.roles) ? state.roles : deepClone(DEFAULT_ROLES);
      if(currentUser.email && currentUser.email !== "Identiteit laden...") state.user.email = currentUser.email;
      if(storageStatus.mode === "api"){
        state.user.role = currentUser.role;
        state.ui.role = state.roles?.[currentUser.role]?.name || currentUser.role;
      }
      state.meta = state.meta || {};
      state.meta.v77AppBootFix = true;
      state.meta.v78ProductionBootDataHydrationFix = true;
      state.meta.v78BootMarker = V78_PRODUCTION_BOOT_DATA_HYDRATION_FIX;
      markBootPhase("state-normalized");

      const bootEnded = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      storageStatus.bootDurationMs = Math.round(bootEnded - bootStarted);
      markBootPhase("app-ready", { booting:false, bootReady:true, bootDurationMs:storageStatus.bootDurationMs });
      notify();
      schedulePostBootIntegrityCheck("after-app-ready");

      void identityPromise;
      void healthPromise;
      return {
        storage:{...storageStatus},
        user:{...currentUser},
        liveReadiness:storageStatus.liveReadiness,
        marker:V78_PRODUCTION_BOOT_DATA_HYDRATION_FIX
      };
    })().catch(error => {
      storageStatus.booting = false;
      storageStatus.bootReady = false;
      storageStatus.lastError = error.message;
      recordError(error.message);
      markBootPhase("boot-error");
      notify();
      throw error;
    });
    return initPromise;
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
    normalizeState,
    validateState,
    getLastValidation: () => lastValidation,
    rebuildGanttHoursByDay: () => recalculateGanttHoursIfChanged().gantt,
    buildHoursByDayFromGantt,
    buildSourcesByDayFromGantt,
    recalculateCapacityFromGantt,
    gantt: ganttApi,
    storage: storageAdapter,
    storageStatus,
    getRemoteVersion: () => remoteVersion,
    getRuntimeInfo: runtimeInfo,
    appBootMarker: V78_PRODUCTION_BOOT_DATA_HYDRATION_FIX,
    isStateReady: () => storageStatus.bootReady && storageStatus.bootPhase === "app-ready",
    whenReady: () => init(),
    recordRender: () => {
      if(storageStatus.booting) storageStatus.rendersDuringBoot += 1;
      return storageStatus.rendersDuringBoot;
    },
    boot: {
      phases:[...BOOT_PHASES],
      status:storageStatus,
      getStatus:() => ({...storageStatus, warnings:[...storageStatus.warnings], errors:[...storageStatus.errors]}),
      getDiagnostics:() => {
        const metrics = stateMetrics(state);
        const runtime = runtimeInfo();
        return {
          environment:runtime.environment,
          currentUrl:String(location?.href || ""),
          deploymentType:runtime.isProductionPages ? "production-pages" : (runtime.isPreviewDeployment ? "preview-pages" : (runtime.isLocal ? "local" : "other")),
          storageMode:storageStatus.mode,
          d1Reachable:storageStatus.d1Reachable,
          accessIdentityPresent:storageStatus.identityPresent,
          userEmail:currentUser.email,
          stateSource:storageStatus.stateSource,
          projectCount:metrics.projectCount,
          projectsOrderCount:metrics.projectOrder,
          projectsByIdCount:metrics.projectById,
          ganttProjectCount:metrics.ganttProjectCount,
          ganttRowCount:metrics.ganttRowCount,
          capacityHoursByDayCount:metrics.hourDays,
          lastRemoteVersion:remoteVersion,
          lastSuccessfulD1LoadAt:storageStatus.lastSuccessfulD1LoadAt,
          bootPhase:storageStatus.bootPhase,
          bootDurationMs:storageStatus.bootDurationMs,
          setStateCallsDuringBoot:storageStatus.setStateCallsDuringBoot,
          rendersDuringBoot:storageStatus.rendersDuringBoot,
          savesBlockedDuringBoot:storageStatus.savesBlockedDuringBoot,
          warnings:[...storageStatus.warnings],
          errors:[...storageStatus.errors],
          marker:V78_PRODUCTION_BOOT_DATA_HYDRATION_FIX
        };
      },
      markShellReady:() => markBootPhase("shell-ready", { booting:true, bootReady:false }),
      isReady:() => storageStatus.bootReady && storageStatus.bootPhase === "app-ready",
      lastUserActionAt:() => lastUserActionAt,
      marker:V78_PRODUCTION_BOOT_DATA_HYDRATION_FIX
    },
    getStateMetrics: () => stateMetrics(state),
    getRemoteSafetyMetrics: () => ({ ...remoteSafetySnapshot }),
    recovery: {
      createRestoredD1Fixture,
      loadRestoredD1Fixture,
      importRawState,
      exportStateJson,
      createRecoverySnapshot,
      restoreLastGoodSnapshot,
      readLastGoodSnapshot,
      previewImport,
      extractStateJsonFromAnyText,
      buildStateDoctorReport,
      setRecoveryLock,
      clearRecoveryLock,
      getRecoveryLock,
      completeMarker: V68_COMPLETE_MARKER,
      testRunnerHardeningMarker: V69_TEST_RUNNER_HARDENING,
      liveStabilityMarker: V70_LIVE_STABILITY_MARKER,
      appBootD1AccessProductionFixMarker: V77_APP_BOOT_D1_ACCESS_PRODUCTION_FIX,
      productionBootDataHydrationFixMarker: V78_PRODUCTION_BOOT_DATA_HYDRATION_FIX,
      duplicateTaskIdRepairMarker: "v71-duplicate-task-id-repair",
      buildLiveReadinessReport,
      markRemoteSaveOk,
      fixtureMarker: V67_FIXTURE_MARKER
    },
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
