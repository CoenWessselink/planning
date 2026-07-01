(function(){
  "use strict";

  const CONFLICT_TYPES = [
    "OVER_CAPACITY",
    "DOUBLE_BOOKED_EMPLOYEE",
    "DOUBLE_BOOKED_EQUIPMENT",
    "DOUBLE_BOOKED_TOOL",
    "OUTSIDE_WORKING_HOURS",
    "NON_WORKING_DAY",
    "OUTSIDE_GANTT_RANGE",
    "DEPENDENCY_NOT_DONE",
    "MATERIAL_NOT_AVAILABLE",
    "DRAWING_NOT_RELEASED",
    "MISSING_RESOURCE",
    "MISSING_EQUIPMENT",
    "MISSING_TOOL",
    "TASK_OVERDUE",
    "UNSCHEDULED_HOURS",
    "D1_SYNC_RISK"
  ];

  const RESOURCE_TYPES = ["employee", "team", "equipment", "tool", "vehicle", "workspace", "machine", "external"];
  const DAYS = ["Ma", "Di", "Wo", "Do", "Vr"];
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[c]));
  const pad = n => String(n).padStart(2, "0");
  const norm = value => String(value || "").trim().toLowerCase();
  const round = value => Math.round((Number(value) || 0) * 10) / 10;

  function cws(){
    try{ return window.CWS || window.parent?.CWS || null; }catch(_error){ return window.CWS || null; }
  }
  function state(){
    return cws()?.getState?.() || {};
  }
  function canEdit(){
    const api = cws();
    const role = state().user?.role || "viewer";
    if(role === "medewerker_viewer" || role === "extern_viewer") return false;
    return !!(api?.hasPermission?.("edit_planning") || api?.hasPermission?.("planning_assign"));
  }
  function canInvite(){
    const api = cws();
    const role = state().user?.role || "viewer";
    return role === "admin" || role === "planner" || !!api?.hasPermission?.("invite_employee");
  }
  function projects(st = state()){
    return (st.projects?.order || Object.keys(st.projects?.byId || {})).map(id => ({ id, ...(st.projects?.byId?.[id] || {}) })).filter(p => p.id);
  }
  function resources(st = state(), type = ""){
    const fromResources = (st.resources?.order || Object.keys(st.resources?.byId || {})).map(id => ({ id, type:"employee", ...(st.resources?.byId?.[id] || {}) })).filter(r => r.id);
    const employees = Array.isArray(st.settings?.tables?.employees) ? st.settings.tables.employees.map((e, i) => ({
      id:e.id || e.email || e.name || `emp_${i + 1}`,
      name:e.name || e.email || `Medewerker ${i + 1}`,
      dept:e.dept || e.department || "",
      email:e.email || "",
      daily:Number(e.daily || e.ma || 8) || 8,
      type:"employee",
      active:e.active !== false
    })) : [];
    const equipmentRows = Array.isArray(st.settings?.tables?.equipment) ? st.settings.tables.equipment : [];
    const toolsRows = Array.isArray(st.settings?.tables?.tools) ? st.settings.tables.tools : [];
    const extra = []
      .concat(equipmentRows.map((r, i) => ({ id:r.id || r.name || `equipment_${i + 1}`, name:r.name || `Materieel ${i + 1}`, dept:r.dept || "", type:"equipment", active:r.active !== false })))
      .concat(toolsRows.map((r, i) => ({ id:r.id || r.name || `tool_${i + 1}`, name:r.name || `Gereedschap ${i + 1}`, dept:r.dept || "", type:"tool", active:r.active !== false })));
    const seen = new Set();
    return fromResources.concat(employees, extra).filter(r => {
      const key = String(r.id || r.name);
      if(seen.has(key)) return false;
      seen.add(key);
      return !type || r.type === type;
    });
  }
  function departments(st = state()){
    const seen = new Map();
    const add = value => {
      const name = String(value || "").trim();
      if(name && !seen.has(norm(name))) seen.set(norm(name), name);
    };
    (st.departments?.order || []).forEach(id => add(st.departments?.byId?.[id]?.name || id));
    (Array.isArray(st.settings?.tables?.departments) ? st.settings.tables.departments : []).forEach(row => add(row.name || row.id || row.dept));
    resources(st).forEach(row => add(row.dept));
    (Array.isArray(st.projects?.deptHours) ? st.projects.deptHours : []).forEach(row => add(row.deptId || row.dept || row.department));
    Object.values(st.gantt?.hoursByDay || {}).forEach(byDept => Object.keys(byDept || {}).forEach(add));
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "nl"));
  }
  function projectName(projectId, st = state()){
    const p = st.projects?.byId?.[projectId] || {};
    return p.name || p.nr || projectId || "Project";
  }
  function isoWeekStart(year, week){
    const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
    const dow = simple.getUTCDay();
    simple.setUTCDate(simple.getUTCDate() + (dow <= 4 ? 1 - dow : 8 - dow));
    return simple;
  }
  function iso(date){
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }
  function currentWeekStart(st = state()){
    const wk = st.ui?.week || {};
    if(wk.year && wk.week) return isoWeekStart(Number(wk.year), Number(wk.week));
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - day + 1);
    return d;
  }
  function addDays(date, amount){
    const next = new Date(date.getTime());
    next.setUTCDate(next.getUTCDate() + amount);
    return next;
  }
  function weekDays(st = state()){
    const start = currentWeekStart(st);
    return DAYS.map((label, index) => ({ label, date:iso(addDays(start, index)), index }));
  }
  function availableByDeptDay(st, dept, dateIso){
    const override = st.resourceAvailability?.find?.(row => norm(row.departmentId || row.dept) === norm(dept) && row.date === dateIso);
    if(override && override.hours != null) return round(override.hours);
    const day = new Date(`${dateIso}T00:00:00Z`).getUTCDay() || 7;
    if(day >= 6) return 0;
    const key = ["ma", "di", "wo", "do", "vr", "za", "zo"][day - 1];
    const employees = resources(st, "employee").filter(r => norm(r.dept) === norm(dept) && r.active !== false);
    return round(employees.reduce((sum, r) => sum + Number(r[key] || r.daily || 8 || 0), 0));
  }
  function assignmentsFromGantt(st = state()){
    const out = [];
    Object.entries(st.gantt?.sourcesByDay || {}).forEach(([date, byDept]) => {
      Object.entries(byDept || {}).forEach(([dept, list]) => {
        (Array.isArray(list) ? list : []).forEach((src, index) => {
          const res = src.resourceId || resources(st, "employee").find(r => norm(r.dept) === norm(dept))?.id || "";
          const startHour = 7 + (index % 5);
          const duration = Math.max(1, Math.min(8, Number(src.hours || 1)));
          out.push({
            id:`gantt_${date}_${dept}_${src.projectId || "project"}_${src.taskId || index}`,
            projectId:src.projectId || "",
            ganttTaskId:src.taskId || src.rowId || "",
            title:src.taskName || "Gantt taak",
            departmentId:dept,
            date,
            startTime:`${pad(startHour)}:00`,
            endTime:`${pad(Math.min(18, startHour + Math.ceil(duration)))}:00`,
            hours:round(src.hours || 0),
            employeeIds:res ? [res] : [],
            equipmentIds:[],
            toolIds:[],
            vehicleIds:[],
            workspaceIds:[],
            status:"gepland",
            location:src.location || "",
            notes:src.why || "",
            source:"gantt"
          });
        });
      });
    });
    const manual = Array.isArray(st.planningAssignments) ? st.planningAssignments : [];
    return manual.concat(out).filter(a => a.projectId || a.title);
  }
  function weekAssignments(st = state()){
    const days = new Set(weekDays(st).map(d => d.date));
    return assignmentsFromGantt(st).filter(a => days.has(a.date));
  }
  function workQueue(st = state()){
    const assignedTaskKeys = new Set(assignmentsFromGantt(st).map(a => `${a.projectId}|${a.ganttTaskId || a.title}`));
    const rows = [];
    Object.entries(st.ganttV2?.byProject || {}).forEach(([projectId, model]) => {
      (model.rows || []).forEach(row => {
        if(row.type === "summary") return;
        const key = `${projectId}|${row.id || row.name}`;
        if(assignedTaskKeys.has(key)) return;
        rows.push({
          id:`queue_${projectId}_${row.id || row.name}`,
          projectId,
          title:row.name || row.id || "Taak",
          departmentId:row.department || "",
          hours:round(row.hours || 0),
          status:row.locked ? "geblokkeerd" : "nog te plannen",
          priority:String(row.priority || "").trim() || "Normaal",
          deadline:model.sched?.[row.id]?.end || "",
          reason:row.why || ""
        });
      });
    });
    if(!rows.length){
      projects(st).forEach(project => {
        const total = Number(project.needHours || 0);
        if(total > 0) rows.push({ id:`queue_${project.id}`, projectId:project.id, title:project.name || project.id, departmentId:"", hours:total, status:"nog te plannen", priority:"Normaal", deadline:project.end || project.start || "" });
      });
    }
    return rows;
  }
  function conflicts(st = state()){
    const out = [];
    Object.entries(st.gantt?.hoursByDay || {}).forEach(([date, byDept]) => {
      Object.entries(byDept || {}).forEach(([dept, planned]) => {
        const available = availableByDeptDay(st, dept, date);
        if(Number(planned || 0) > available){
          out.push({ type:"OVER_CAPACITY", projectId:"", task:"Capaciteit", departmentId:dept, date, severity:"Hoog", cause:`${round(planned)}u gepland / ${round(available)}u beschikbaar`, suggestion:"Open weekplanning en verschuif taken." });
        }
      });
    });
    const byResourceDate = new Map();
    assignmentsFromGantt(st).forEach(a => {
      if(!a.employeeIds?.length) out.push({ type:"MISSING_RESOURCE", projectId:a.projectId, task:a.title, departmentId:a.departmentId, date:a.date, severity:"Midden", cause:"Geen medewerker gekoppeld", suggestion:"Kies medewerker of team." });
      (a.employeeIds || []).forEach(id => {
        const key = `${id}|${a.date}|${a.startTime}`;
        const arr = byResourceDate.get(key) || [];
        arr.push(a);
        byResourceDate.set(key, arr);
      });
      if(a.status === "wacht op materiaal") out.push({ type:"MATERIAL_NOT_AVAILABLE", projectId:a.projectId, task:a.title, departmentId:a.departmentId, date:a.date, severity:"Midden", cause:"Materiaalstatus blokkeert uitvoering", suggestion:"Controleer inkoop of kies andere taak." });
      if(a.date < iso(new Date()) && !/gereed/i.test(a.status || "")) out.push({ type:"TASK_OVERDUE", projectId:a.projectId, task:a.title, departmentId:a.departmentId, date:a.date, severity:"Midden", cause:"Taakdatum ligt in het verleden", suggestion:"Markeer gereed of herplan." });
    });
    byResourceDate.forEach((arr, key) => {
      if(arr.length > 1) out.push({ type:"DOUBLE_BOOKED_EMPLOYEE", projectId:arr[0].projectId, task:arr.map(a => a.title).join(", "), departmentId:arr[0].departmentId, date:arr[0].date, severity:"Hoog", cause:`Resource dubbel geboekt (${key.split("|")[0]})`, suggestion:"Vervang resource of verplaats taak." });
    });
    if(cws()?.storageStatus?.unsynced || cws()?.storageStatus?.mode !== "api"){
      out.push({ type:"D1_SYNC_RISK", projectId:"", task:"Synchronisatie", departmentId:"", date:iso(new Date()), severity:"Laag", cause:"Niet bevestigd als gedeelde D1-state", suggestion:"Controleer opslagstatus voor live gebruik." });
    }
    CONFLICT_TYPES.forEach(type => {
      if(!out.some(c => c.type === type) && ["DOUBLE_BOOKED_EQUIPMENT","DOUBLE_BOOKED_TOOL","OUTSIDE_WORKING_HOURS","NON_WORKING_DAY","OUTSIDE_GANTT_RANGE","DEPENDENCY_NOT_DONE","DRAWING_NOT_RELEASED","MISSING_EQUIPMENT","MISSING_TOOL","UNSCHEDULED_HOURS"].includes(type)){
        // Keep the type registered for preflight and filters without showing fake rows.
      }
    });
    return out;
  }
  function openModal(title, html, actions = []){
    const content = document.createElement("div");
    content.innerHTML = html;
    if(window.UI?.openModal) return window.UI.openModal({ title, contentEl:content, actions:actions.length ? actions : [{ label:"Sluiten", className:"btn", onClick:({ close }) => close() }] });
    const overlay = document.createElement("div");
    overlay.className = "cws-modal-overlay";
    overlay.innerHTML = `<div class="cws-modal" role="dialog" aria-modal="true"><div class="cws-modal-hdr"><div class="cws-modal-title">${esc(title)}</div><button class="btn" data-close>Sluiten</button></div><div class="cws-modal-body">${html}</div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("[data-close]").onclick = () => overlay.remove();
    overlay.addEventListener("click", event => { if(event.target === overlay) overlay.remove(); });
    return { close:() => overlay.remove(), overlay };
  }
  let contextNode = null;
  function showContextMenu(event, items = []){
    event.preventDefault();
    event.stopPropagation();
    contextNode?.remove();
    contextNode = document.createElement("div");
    contextNode.className = "cws-context-menu";
    contextNode.setAttribute("role", "menu");
    contextNode.innerHTML = items.map((item, index) => item.sep ? `<div class="sep"></div>` : `<button type="button" data-index="${index}" ${item.disabled ? "disabled" : ""}>${esc(item.label)}</button>`).join("");
    document.body.appendChild(contextNode);
    const x = Math.min(event.clientX || 12, window.innerWidth - 260);
    const y = Math.min(event.clientY || 12, window.innerHeight - 360);
    contextNode.style.left = `${Math.max(8, x)}px`;
    contextNode.style.top = `${Math.max(8, y)}px`;
    contextNode.querySelectorAll("button[data-index]").forEach(btn => {
      btn.onclick = () => {
        const item = items[Number(btn.dataset.index)];
        contextNode?.remove();
        contextNode = null;
        if(item && !item.disabled) item.action?.();
      };
    });
  }
  document.addEventListener("click", event => {
    if(contextNode && !event.target.closest(".cws-context-menu")){
      contextNode.remove();
      contextNode = null;
    }
  });
  function bindLongPress(node, callback){
    let timer = null;
    const clear = () => { if(timer) clearTimeout(timer); timer = null; };
    node.addEventListener("touchstart", event => {
      timer = setTimeout(() => callback(event.touches?.[0] || event), 520);
    }, { passive:true });
    ["touchend", "touchmove", "touchcancel"].forEach(type => node.addEventListener(type, clear, { passive:true }));
  }
  function printHtml(title, body, options = {}){
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
    const paper = options.paper || "A4 portrait";
    const logo = options.logo || "";
    const docHtml = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      @page{size:${paper};margin:10mm}
      *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
      body{font:11px Arial,Helvetica,sans-serif;color:#0f172a;background:#fff;margin:0}
      .print-page{border:1px solid #111;padding:10mm;min-height:100%}
      .print-head{display:grid;grid-template-columns:38mm 1fr 58mm;gap:8mm;align-items:start;margin-bottom:8mm}
      .print-logo{max-width:38mm;max-height:18mm;object-fit:contain}.print-title{text-align:center}.print-title h1{margin:0 0 3mm;font-size:20px}.print-meta{border-collapse:collapse;width:100%}.print-meta td{border:1px solid #888;padding:3px 5px}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:5px;text-align:left;vertical-align:top}th{background:#f1f5f9}
      .no-print-ui,button{display:none!important}
    </style>${options.extraCss || ""}</head><body><div class="print-page"><header class="print-head"><div>${logo ? `<img class="print-logo" src="${esc(logo)}" alt="">` : ""}</div><div class="print-title"><h1>${esc(title)}</h1><div>${esc(options.subtitle || "CWS Planning")}</div></div><table class="print-meta"><tr><td>Datum</td><td>${new Date().toLocaleString("nl-NL")}</td></tr><tr><td>Auteur</td><td>${esc(cws()?.getCurrentUser?.()?.email || "CWS Planning")}</td></tr></table></header>${body}</div></body></html>`;
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(docHtml);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => iframe.remove(), 30000);
    }, 120);
    return iframe;
  }
  async function sha256(value){
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  async function createInvite(employee, role = "medewerker_viewer"){
    if(!canInvite()) throw new Error("Geen rechten om medewerkers uit te nodigen.");
    const api = cws();
    const email = String(employee?.email || "").trim();
    if(!email) throw new Error("Medewerker heeft geen e-mailadres.");
    const random = new Uint8Array(32);
    crypto.getRandomValues(random);
    const token = Array.from(random).map(b => b.toString(16).padStart(2, "0")).join("");
    const tokenHash = await sha256(token);
    const now = new Date();
    const expires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
    const mailConfigured = !!(state().settings?.mail?.provider || state().settings?.tables?.mail?.[0]?.provider);
    api?.setState?.(draft => {
      draft.portalInvites = Array.isArray(draft.portalInvites) ? draft.portalInvites : [];
      draft.portalInvites.push({
        invitedAt:now.toISOString(),
        invitedBy:api?.getCurrentUser?.()?.email || "planner",
        email,
        tokenHash,
        expiresAt:expires.toISOString(),
        acceptedAt:null,
        revokedAt:null,
        role,
        status:mailConfigured ? "queued" : "mail_config_missing"
      });
      return draft;
    }, { userAction:true, reason:"employee-invite" });
    if(!mailConfigured) throw new Error("Mailprovider/env ontbreekt. Uitnodiging is niet verzonden; tokenHash is wel vastgelegd voor configuratiecontrole.");
    return { email, role, expiresAt:expires.toISOString() };
  }
  function route(app){
    try{ window.parent?.Router?.loadApp?.(app); }
    catch(_error){}
  }

  window.CWS_InteractivePlanning = {
    marker:"CWS_INTERACTIVE_PLANNING_V190",
    conflictTypes:CONFLICT_TYPES,
    resourceTypes:RESOURCE_TYPES,
    days:DAYS,
    esc,
    norm,
    round,
    cws,
    state,
    canEdit,
    canInvite,
    projects,
    resources,
    departments,
    projectName,
    weekDays,
    availableByDeptDay,
    assignmentsFromGantt,
    weekAssignments,
    workQueue,
    conflicts,
    openModal,
    showContextMenu,
    bindLongPress,
    printHtml,
    createInvite,
    route
  };
})();
