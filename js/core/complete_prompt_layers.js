(function(){
  "use strict";

  const CP = () => window.CWS_InteractivePlanning;
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const esc = v => CP().esc(v);
  const norm = v => CP().norm(v);
  const pad = n => String(n).padStart(2, "0");
  const moduleName = () => document.body.dataset.cpModule || "afdelingsplanning";
  const root = () => document.getElementById("cpRoot");

  const PERMISSIONS = [
    ["view_projects", "Projecten zien"],
    ["edit_projects", "Projecten wijzigen"],
    ["view_planning", "Planning zien"],
    ["edit_planning", "Planning wijzigen"],
    ["planning_assign", "Werk toewijzen"],
    ["invite_employee", "Medewerkers uitnodigen"],
    ["view_resources", "Resources zien"],
    ["view_own_work", "Eigen werk"],
    ["admin_settings", "Beheer"],
    ["print_export", "Print/export"]
  ];

  const ROLE_TEMPLATE = {
    admin: { name:"Admin", permissions:["*"] },
    planner: { name:"Planner", permissions:["view_projects","edit_projects","view_planning","edit_planning","planning_assign","invite_employee","view_resources","auto_plan","view_reports","audit_view","import_data","print_export"] },
    afdelingsplanner: { name:"Afdelingsplanner", permissions:["view_projects","view_planning","edit_planning","planning_assign","view_resources","view_reports","print_export"] },
    projectleider: { name:"Projectleider", permissions:["view_projects","edit_projects_limited","view_planning","view_reports","print_export"] },
    medewerker_viewer: { name:"Medewerker viewer", permissions:["view_own_work","view_planning_readonly","print_export"] },
    extern_viewer: { name:"Extern viewer", permissions:["view_shared_readonly","print_export"] },
    viewer: { name:"Viewer", permissions:["view_projects","view_planning","view_reports"] }
  };

  function state(){ return CP().state(); }
  function todayIso(){ return new Date().toISOString().slice(0, 10); }
  function toDate(iso){
    const date = new Date(`${String(iso || todayIso()).slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? new Date(`${todayIso()}T00:00:00Z`) : date;
  }
  function iso(date){ return date.toISOString().slice(0, 10); }
  function addDaysIso(dateIso, amount){
    const date = toDate(dateIso);
    date.setUTCDate(date.getUTCDate() + amount);
    return iso(date);
  }
  function startOfWeekIso(dateIso){
    const date = toDate(dateIso);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
    return iso(date);
  }
  function isoWeekMeta(dateIso){
    const date = toDate(dateIso);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
    const week1 = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getUTCDay() + 6) % 7)) / 7);
    return { year:date.getUTCFullYear(), week };
  }
  function fmtDate(dateIso){
    const value = String(dateIso || "");
    return value.length >= 10 ? `${value.slice(8, 10)}-${value.slice(5, 7)}-${value.slice(0, 4)}` : value;
  }
  function hourEnd(startTime, hours){
    const [h, m] = String(startTime || "08:00").split(":").map(Number);
    const start = (Number.isFinite(h) ? h : 8) * 60 + (Number.isFinite(m) ? m : 0);
    const end = Math.min(23 * 60 + 45, start + Math.max(15, Math.round((Number(hours) || 1) * 60)));
    return `${pad(Math.floor(end / 60))}:${pad(end % 60)}`;
  }
  function notify(message){
    try{ window.UI?.toast?.(message); return; }catch(_error){}
    try{ window.parent?.UI?.toast?.(message); }catch(_error){}
  }
  function shell(title, subtitle, body, options = {}){
    const tabs = options.tabs ? `<div class="cp-tabs no-print">${options.tabs}</div>` : "";
    root().innerHTML = `<section class="cp-shell" data-cp-shell="${esc(moduleName())}">
      <header class="cp-head">
        <div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>
        <div class="cp-row no-print">${options.actions || ""}</div>
      </header>
      ${tabs}
      <main class="cp-content">${body}</main>
    </section>`;
  }
  function btn(label, attrs = "", cls = ""){
    return `<button class="cp-btn ${cls}" type="button" ${attrs}>${esc(label)}</button>`;
  }
  function table(headers, rows, attrs = ""){
    return `<div class="cp-scroll" ${attrs}><table class="cp-table"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${headers.length}" class="cp-muted">Geen gegevens gevonden in de huidige planning.</td></tr>`}</tbody></table></div>`;
  }
  function projectLabel(projectId){
    const st = state();
    const p = st.projects?.byId?.[projectId] || {};
    return [p.nr || projectId, p.name].filter(Boolean).join(" - ");
  }
  function selectedDept(st = state()){
    return String(st.ui?.departmentPlanningDept || "").trim();
  }
  function allAssignments(st = state()){
    return CP().assignmentsFromGantt(st).filter(a => a.date).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.startTime || "").localeCompare(String(b.startTime || "")));
  }
  function visibleAssignments(st = state(), list = allAssignments(st)){
    const dept = selectedDept(st);
    return dept ? list.filter(a => norm(a.departmentId) === norm(dept)) : list;
  }
  function planningAnchorDate(st = state()){
    const explicit = String(st.ui?.departmentPlanningDate || "").slice(0, 10);
    if(/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
    const weekDates = new Set(CP().weekDays(st).map(d => d.date));
    const inStateWeek = visibleAssignments(st).find(a => weekDates.has(a.date));
    if(inStateWeek) return startOfWeekIso(inStateWeek.date);
    const first = visibleAssignments(st)[0] || allAssignments(st)[0];
    return first?.date ? startOfWeekIso(first.date) : startOfWeekIso(todayIso());
  }
  function weekDaysFromAnchor(st = state()){
    const start = startOfWeekIso(planningAnchorDate(st));
    return CP().days.map((label, index) => ({ label, date:addDaysIso(start, index), index }));
  }
  function mutateUi(mutator, reason){
    CP().cws()?.setState?.(draft => {
      draft.ui = draft.ui || {};
      mutator(draft.ui);
      return draft;
    }, { userAction:false, reason, persistLocal:false });
  }
  function setPlanningDate(dateIso){
    const date = startOfWeekIso(dateIso || todayIso());
    const week = isoWeekMeta(date);
    mutateUi(ui => {
      ui.departmentPlanningDate = date;
      ui.week = { year:week.year, week:week.week };
    }, "department-planning-date");
  }
  function setPlanningTab(tab){
    mutateUi(ui => { ui.departmentPlanningTab = tab; }, "department-planning-tab");
  }
  function setPlanningDept(dept){
    mutateUi(ui => { ui.departmentPlanningDept = dept || ""; }, "department-planning-dept");
  }
  function routeTab(appId, label, active){
    return btn(label, `data-route="${appId}"`, active ? "active" : "");
  }
  function activePlanningTab(){
    const fromQuery = new URLSearchParams(location.search).get("app") || "";
    const fromFrame = window.frameElement?.dataset?.activeApp || "";
    const fromParent = (() => { try{ return window.parent?.Router?.getActiveApp?.() || ""; }catch(_){ return ""; } })();
    const app = fromQuery || fromFrame || fromParent;
    if(app.includes("dag")) return "dag";
    if(app.includes("week")) return "week";
    if(app.includes("maand")) return "maand";
    return state().ui?.departmentPlanningTab || "maand";
  }
  function planningToolbar(tab){
    const st = state();
    const anchor = planningAnchorDate(st);
    const depts = CP().departments(st);
    const dept = selectedDept(st);
    const deptOptions = [`<option value="">Alle afdelingen</option>`].concat(depts.map(d => `<option value="${esc(d)}" ${norm(d) === norm(dept) ? "selected" : ""}>${esc(d)}</option>`)).join("");
    const assignments = visibleAssignments(st);
    const queue = CP().workQueue(st);
    const conflicts = CP().conflicts(st);
    return `<section class="cp-toolbar cp-planning-toolbar no-print">
      <div class="cp-row">
        ${btn("Vorige", "data-plan-shift='-7'")}
        <input class="cp-input" type="date" data-planning-date value="${esc(anchor)}" aria-label="Planningsdatum">
        ${btn("Vandaag", "data-plan-today")}
        ${btn("Volgende", "data-plan-shift='7'")}
        <select class="cp-select" data-planning-dept aria-label="Afdeling">${deptOptions}</select>
      </div>
      <div class="cp-row">
        ${btn("Nieuwe planning", "data-add-planning", "primary")}
        ${btn("Werkbaarheidstest", "data-run-planning-check")}
        ${btn("What-if scenario", "data-open-scenario")}
      </div>
      <div class="cp-summary-grid">
        <span><b>${assignments.length}</b> geplande regels</span>
        <span><b>${queue.length}</b> in werkvoorraad</span>
        <span><b>${conflicts.length}</b> aandachtspunten</span>
        <span><b>${esc(tab)}</b> actieve weergave</span>
      </div>
    </section>`;
  }
  function assignmentMatchesRow(assignment, row){
    if(row.isDept) return norm(assignment.departmentId) === norm(row.dept);
    const ids = assignment.employeeIds || [];
    if(ids.includes(row.id)) return true;
    return !ids.length && norm(assignment.departmentId) === norm(row.dept);
  }
  function resourceRows(st = state()){
    const dept = selectedDept(st);
    const depts = (dept ? [dept] : CP().departments(st)).slice(0, 10);
    const deptRows = depts.map(d => ({ id:`dept:${d}`, name:`Afdeling ${d}`, dept:d, type:"afdeling", isDept:true }));
    const employees = CP().resources(st, "employee").filter(r => !dept || norm(r.dept) === norm(dept)).slice(0, 10);
    return deptRows.concat(employees).slice(0, 16);
  }
  function taskBlock(a, cls = ""){
    return `<span class="cp-task ${cls}" draggable="${CP().canEdit()}" data-assignment-id="${esc(a.id)}" data-project-id="${esc(a.projectId || "")}" data-task-title="${esc(a.title || "")}" title="Klik voor details">
      <strong>${esc(a.title || "Taak")}</strong><br>
      <span class="cp-muted">${esc(projectLabel(a.projectId))} | ${esc(a.departmentId || "")} | ${esc(a.hours || 0)}u</span>
    </span>`;
  }
  function queueBlock(q){
    return `<span class="cp-task warn" draggable="${CP().canEdit()}" data-queue-id="${esc(q.id)}" title="Klik om te plannen">
      <strong>${esc(q.title)}</strong><br>
      <span class="cp-muted">${esc(projectLabel(q.projectId))} | ${esc(q.hours || 0)}u | ${esc(q.status || "nog te plannen")}</span>
    </span>`;
  }

  function renderPlanning(){
    const tab = activePlanningTab();
    const tabs = [
      routeTab("afdelingsplanning-maand", "Maand", tab === "maand"),
      routeTab("afdelingsplanning-week", "Week", tab === "week"),
      routeTab("afdelingsplanning-dag", "Dag", tab === "dag"),
      routeTab("werkvoorraad", "Werkvoorraad", false),
      routeTab("resources", "Resources", false),
      routeTab("conflicten", "Conflicten", false)
    ].join("");
    const content = planningToolbar(tab) + (tab === "dag" ? dayPlanning() : tab === "week" ? weekPlanning() : monthPlanning());
    shell("Afdelingsplanning", "Werk verdelen vanuit Gantt, capaciteit en werkvoorraad", content, { tabs, actions:btn("Print", "data-print-current") });
    bindCommon();
  }
  function monthPlanning(){
    const st = state();
    const anchor = planningAnchorDate(st);
    const first = toDate(startOfWeekIso(anchor));
    first.setUTCDate(first.getUTCDate() - 14);
    const assignments = visibleAssignments(st);
    const depts = selectedDept(st) ? [selectedDept(st)] : CP().departments(st);
    const days = Array.from({ length:35 }, (_, i) => {
      const date = new Date(first.getTime());
      date.setUTCDate(first.getUTCDate() + i);
      const dateIso = iso(date);
      const items = assignments.filter(a => a.date === dateIso);
      const planned = items.reduce((sum, a) => sum + Number(a.hours || 0), 0);
      const available = depts.reduce((sum, dept) => sum + CP().availableByDeptDay(st, dept, dateIso), 0);
      const pct = available ? Math.round(planned / available * 100) : (planned ? 150 : 0);
      const cls = pct > 120 ? "red" : pct > 95 ? "orange" : pct > 0 ? "green" : "gray";
      const preview = items.slice(0, 3).map(a => `<span>${esc(a.title || "Taak")}</span>`).join("");
      return `<button class="cp-day ${cls} cp-context-target" data-day-date="${dateIso}" type="button">
        <span class="cp-day-title">${esc(fmtDate(dateIso).slice(0, 5))}</span>
        <strong>${Math.round(planned)}u gepland</strong>
        <span class="cp-muted">${Math.round(available)}u beschikbaar | ${pct}%</span>
        <span class="cp-day-mini">${preview || "Klik voor details/plannen"}</span>
      </button>`;
    }).join("");
    return `<div class="cp-scroll-hint">Klik op een dag voor detail, planning toevoegen of doorklik naar dag/week.</div><div class="cp-month">${days}</div>`;
  }
  function weekPlanning(){
    const st = state();
    const days = weekDaysFromAnchor(st);
    const assignments = visibleAssignments(st);
    const rowsData = resourceRows(st);
    const header = `<div class="cp-headcell">Resource / team</div>${days.map(d => `<div class="cp-headcell">${esc(d.label)}<br><span class="cp-muted">${esc(fmtDate(d.date).slice(0, 5))}</span></div>`).join("")}`;
    const rows = rowsData.map(row => {
      const cells = days.map(day => {
        const items = assignments.filter(a => a.date === day.date && assignmentMatchesRow(a, row));
        const conflict = CP().conflicts(st).some(c => c.date === day.date && (!c.departmentId || norm(c.departmentId) === norm(row.dept)));
        return `<div class="cp-cell cp-clickable" data-drop-date="${esc(day.date)}" data-resource-id="${esc(row.isDept ? "" : row.id || "")}" data-row-dept="${esc(row.dept || "")}">${items.map(a => taskBlock(a, conflict ? "conflict" : "")).join("") || `<span class="cp-empty-slot">+ plannen</span>`}</div>`;
      }).join("");
      return `<div class="cp-cell"><strong>${esc(row.name || row.id)}</strong><br><span class="cp-muted">${esc(row.type || "resource")} | ${esc(row.dept || "")}</span></div>${cells}`;
    }).join("");
    const queue = CP().workQueue(st).slice(0, 8).map(queueBlock).join("") || `<p class="cp-muted">Geen werkvoorraad buiten planning gevonden.</p>`;
    return `<section class="cp-grid cp-cols-2"><article class="cp-card"><h2>Werkvoorraad</h2><p class="cp-muted">Klik of sleep een item naar een dag/resource.</p>${queue}</article><div><div class="cp-scroll-hint">Horizontaal scrollen voor meer resources/dagen</div><div class="cp-scroll"><div class="cp-week">${header}${rows}</div></div></div></section>`;
  }
  function dayPlanning(){
    const st = state();
    const day = planningAnchorDate(st);
    const rowsData = resourceRows(st).slice(0, 8);
    const assignments = visibleAssignments(st).filter(a => a.date === day);
    const dayResources = rowsData.length ? rowsData : [{ id:"", name:"Geen resources ingericht", type:"resource", dept:"" }];
    const minWidth = Math.max(420, 92 + dayResources.length * 165);
    const gridStyle = `grid-template-columns:92px repeat(${dayResources.length},minmax(165px,1fr));min-width:${minWidth}px`;
    const header = `<div class="cp-headcell">Tijd</div>${dayResources.map(r => `<div class="cp-headcell">${esc(r.name || r.id)}<br><span class="cp-muted">${esc(r.type || "employee")}</span></div>`).join("")}`;
    const rows = [];
    for(let hour = 6; hour <= 18; hour += 1){
      rows.push(`<div class="cp-cell cp-time ${hour === 11 ? "cp-now" : ""}">${pad(hour)}:00</div>`);
      dayResources.forEach(r => {
        const time = `${pad(hour)}:00`;
        const items = assignments.filter(a => String(a.startTime || "").slice(0, 5) === time && assignmentMatchesRow(a, r));
        rows.push(`<div class="cp-cell cp-clickable" data-drop-date="${esc(day)}" data-drop-time="${time}" data-resource-id="${esc(r.isDept ? "" : r.id || "")}" data-row-dept="${esc(r.dept || "")}">${items.map(taskBlock).join("") || `<span class="cp-empty-slot">+ plannen</span>`}</div>`);
      });
    }
    return `<article class="cp-card cp-day-summary"><h2>${esc(fmtDate(day))}</h2><p class="cp-muted">${assignments.length} regels zichtbaar. Klik een leeg vak om direct te plannen.</p></article><div class="cp-scroll-hint">Horizontaal scrollen voor meer resources</div><div class="cp-scroll"><div class="cp-dayplan" style="${gridStyle}">${header}${rows.join("")}</div></div>`;
  }

  function renderWorkload(){
    const st = state();
    const groups = [
      ["Nog te plannen", q => /nog|plan/i.test(q.status || "")],
      ["Vandaag", q => q.deadline === todayIso()],
      ["Deze week", q => !!q.deadline],
      ["Te laat", q => q.deadline && q.deadline < todayIso()],
      ["Geblokkeerd", q => /blok/i.test(q.status || q.reason || "")],
      ["Wacht op materiaal", q => /materiaal/i.test(q.status || q.reason || "")],
      ["Wacht op tekening", q => /tekening/i.test(q.status || q.reason || "")],
      ["Zonder medewerker/materieel/gereedschap", q => !q.resourceId]
    ];
    const queue = CP().workQueue(st);
    const cards = groups.map(([label, fn]) => {
      const items = queue.filter(fn).slice(0, 10);
      return `<article class="cp-card"><h2>${esc(label)}</h2>${items.map(queueBlock).join("") || `<p class="cp-muted">Geen items.</p>`}</article>`;
    }).join("");
    shell("Werkvoorraad", "Nog te plannen werk, blokkades en ontbrekende resources", `<section class="cp-workqueue">${cards}</section>`, { actions:btn("Planning toevoegen", "data-add-planning", "primary") + btn("Print werkvoorraad", "data-print-current") });
    bindCommon();
  }
  function renderResources(){
    const tab = new URLSearchParams(location.search).get("type") || document.body.dataset.resourceType || "employee";
    const tabs = ["employee","equipment","tool"].map(type => btn(type === "employee" ? "Medewerkers" : type === "equipment" ? "Materieel" : "Gereedschap", `data-resource-tab="${type}"`, tab === type ? "active" : "")).join("");
    const rows = CP().resources(state(), tab).map(r => `<tr data-resource-id="${esc(r.id)}"><td><strong>${esc(r.name || r.id)}</strong><br><span class="cp-muted">${esc(r.email || "")}</span></td><td>${esc(r.type || tab)}</td><td>${esc(r.dept || "")}</td><td>${esc(r.daily || r.ma || "")}</td><td><span class="cp-pill ${r.active === false ? "gray" : "green"}">${r.active === false ? "Niet actief" : "Actief"}</span></td><td>${tab === "employee" ? btn("Medewerker uitnodigen", `data-invite-resource="${esc(r.id)}" ${CP().canInvite() ? "" : "disabled"}`) : ""}${btn("Details", `data-resource-detail="${esc(r.id)}"`)}</td></tr>`);
    shell("Resources", "Medewerkers, materieel, gereedschap en beschikbaarheid", table(["Naam", "Type", "Afdeling", "Uren/dag", "Status", "Actie"], rows), { tabs, actions:btn("Print resources", "data-print-current") });
    bindCommon();
  }
  function renderConflicts(){
    const rows = CP().conflicts(state()).map((c, index) => `<tr data-conflict-type="${esc(c.type)}" data-conflict-index="${index}"><td><span class="cp-pill ${c.severity === "Hoog" ? "red" : c.severity === "Midden" ? "orange" : "blue"}">${esc(c.type)}</span></td><td>${esc(projectLabel(c.projectId))}</td><td>${esc(c.task)}</td><td>${esc(c.departmentId)}</td><td>${esc(c.date)}</td><td>${esc(c.cause)}</td><td>${esc(c.suggestion)}</td><td>${btn("Oplossen", `data-resolve-conflict="${index}"`)}</td></tr>`);
    shell("Conflicten", "Centraal conflictcenter met oplossuggesties", table(["Type", "Project", "Taak", "Afdeling", "Datum", "Oorzaak", "Suggestie", "Actie"], rows), { actions:btn("Planningcheck", "data-run-planning-check") + btn("Print conflicten", "data-print-current") });
    bindCommon();
  }
  function renderMyWork(){
    const st = state();
    const email = CP().cws()?.getCurrentUser?.()?.email || st.user?.email || "";
    const ownResource = CP().resources(st).find(r => norm(r.email) === norm(email)) || CP().resources(st)[0] || {};
    const own = CP().assignmentsFromGantt(st).filter(a => !ownResource.id || (a.employeeIds || []).includes(ownResource.id)).slice(0, 60);
    const today = todayIso();
    const todayRows = own.filter(a => a.date === today).map(a => `<p><strong>${esc(a.startTime)}-${esc(a.endTime)}</strong> ${esc(a.title)}<br><span class="cp-muted">${esc(projectLabel(a.projectId))} | ${esc(a.location || "")}</span></p>`).join("") || `<p class="cp-muted">Geen taken vandaag.</p>`;
    const weekRows = own.map(a => `<tr data-assignment-id="${esc(a.id)}"><td>${esc(a.date)}</td><td>${esc(a.startTime)}-${esc(a.endTime)}</td><td>${esc(projectLabel(a.projectId))}</td><td>${esc(a.title)}</td><td>${esc(a.departmentId)}</td><td>${esc(a.location || "")}</td><td>${esc((a.equipmentIds || []).join(", "))}</td><td>${esc((a.toolIds || []).join(", "))}</td><td>${esc(a.notes || "")}</td></tr>`);
    const body = `<section class="cp-grid cp-cols-2"><article class="cp-card"><h2>Vandaag</h2>${todayRows}<button class="cp-btn" type="button" data-seen-work>Gezien</button></article><article class="cp-card"><h2>Volgende week</h2><p class="cp-muted">Read-only. Vragen gaan naar de planner; geen drag/drop, geen edit, geen uren aanpassen.</p></article></section><div class="cp-scroll-hint">Horizontaal scrollen voor meer data</div>${table(["Datum","Tijd","Project","Taak","Afdeling","Locatie","Materieel","Gereedschap","Opmerkingen"], weekRows)}`;
    shell("Mijn werk", "Medewerkerportaal read-only: alleen eigen werkzaamheden", body, { actions:btn("Print dag", "data-print-current") + btn("Print week", "data-print-current") });
    bindCommon();
  }
  function renderRoles(){
    const st = state();
    const roles = st.roles || ROLE_TEMPLATE;
    const rows = Object.entries(roles).map(([id, role]) => {
      const perms = Array.isArray(role.permissions) ? role.permissions : [];
      const wildcard = perms.includes("*");
      const editable = id !== "admin" && CP().cws()?.hasPermission?.("admin_settings");
      const nameInput = `<input class="cp-input cp-role-name" value="${esc(role.name || id)}" data-role-name="${esc(id)}" ${editable ? "" : "disabled"} aria-label="Rolnaam ${esc(id)}">`;
      const cells = PERMISSIONS.map(([perm]) => {
        const checked = wildcard || perms.includes(perm);
        return `<td><label class="cp-check"><input type="checkbox" data-role-permission="${esc(perm)}" data-role-id="${esc(id)}" ${checked ? "checked" : ""} ${editable ? "" : "disabled"}><span>${checked ? "ja" : "nee"}</span></label></td>`;
      }).join("");
      return `<tr data-role-row="${esc(id)}"><td><strong>${esc(id)}</strong><br>${nameInput}</td>${cells}</tr>`;
    });
    const inviteRows = (Array.isArray(st.portalInvites) ? st.portalInvites : []).map((i, index) => `<tr><td>${esc(i.email)}</td><td>${esc(i.role)}</td><td>${esc(i.invitedAt)}</td><td>${esc(i.expiresAt)}</td><td>${esc(i.revokedAt ? "ingetrokken" : i.status || "actief")}</td><td>${i.revokedAt ? "" : btn("Token intrekken", `data-revoke-invite="${index}"`)}</td></tr>`);
    const body = `<div class="cp-alert"><strong>Wijzigingen zijn direct actief.</strong><span>De matrix hieronder gebruikt echte checkboxes en slaat op in de centrale state. Admin blijft bewust vergrendeld.</span></div><article class="cp-card"><h2>Rechtenmatrix</h2>${table(["Rol"].concat(PERMISSIONS.map(([,label]) => label)), rows, "data-role-matrix")}</article><article class="cp-card" style="margin-top:12px"><h2>Uitnodigingen</h2><p class="cp-muted">Tokens worden alleen als tokenHash bewaard; plain token wordt niet opgeslagen of gelogd.</p>${table(["E-mail","Rol","Uitgenodigd","Verloopt","Status","Actie"], inviteRows)}</article>`;
    shell("Rollen & rechten", "Admin, planner, afdelingsplanner, projectleider, medewerker_viewer en extern_viewer", body, { actions:btn("Nieuwe rol", "data-new-role", "primary") + btn("Uitnodiging", "data-new-invite") + btn("Security test", "data-security-check") + btn("Print rollen", "data-print-current") });
    bindCommon();
  }

  function openTaskDetail(assignmentId){
    const a = allAssignments(state()).find(item => item.id === assignmentId);
    if(!a) return;
    CP().openModal("Taakdetail", `<dl class="cp-detail-list">
      <dt>Taak</dt><dd>${esc(a.title || "Taak")}</dd>
      <dt>Project</dt><dd>${esc(projectLabel(a.projectId))}</dd>
      <dt>Datum/tijd</dt><dd>${esc(fmtDate(a.date))} ${esc(a.startTime || "")}-${esc(a.endTime || "")}</dd>
      <dt>Afdeling</dt><dd>${esc(a.departmentId || "")}</dd>
      <dt>Uren</dt><dd>${esc(a.hours || 0)}u</dd>
      <dt>Bron</dt><dd>${esc(a.source || "planning")}</dd>
    </dl>`, [
      { label:"Open Gantt", className:"btn", onClick:({ close }) => { close(); CP().route("gantt"); } },
      { label:"Open capaciteit", className:"btn", onClick:({ close }) => { close(); CP().route("capaciteit"); } },
      { label:"Sluiten", className:"btn primary", onClick:({ close }) => close() }
    ]);
  }
  function openDayDetail(dateIso){
    const st = state();
    const items = visibleAssignments(st).filter(a => a.date === dateIso);
    const rows = items.map(a => `<tr><td>${esc(a.startTime || "")}-${esc(a.endTime || "")}</td><td>${esc(a.title || "")}</td><td>${esc(projectLabel(a.projectId))}</td><td>${esc(a.departmentId || "")}</td><td>${esc(a.hours || 0)}u</td></tr>`);
    CP().openModal(`Dagplanning ${fmtDate(dateIso)}`, `<p class="cp-muted">${items.length} geplande regels. Klik op Nieuwe planning om direct een taak toe te voegen.</p>${table(["Tijd","Taak","Project","Afdeling","Uren"], rows)}`, [
      { label:"Open dagplanning", className:"btn", onClick:({ close }) => { close(); setPlanningDate(dateIso); setPlanningTab("dag"); CP().route("afdelingsplanning-dag"); } },
      { label:"Nieuwe planning", className:"btn primary", onClick:({ close }) => { close(); openAssignmentModal(dateIso); } },
      { label:"Sluiten", className:"btn", onClick:({ close }) => close() }
    ]);
  }
  function openQueueDetail(queueId){
    const q = CP().workQueue(state()).find(item => item.id === queueId);
    if(!q) return;
    CP().openModal("Werkvoorraad", `<dl class="cp-detail-list"><dt>Taak</dt><dd>${esc(q.title)}</dd><dt>Project</dt><dd>${esc(projectLabel(q.projectId))}</dd><dt>Afdeling</dt><dd>${esc(q.departmentId || "")}</dd><dt>Uren</dt><dd>${esc(q.hours || 0)}u</dd><dt>Status</dt><dd>${esc(q.status || "")}</dd></dl>`, [
      { label:"Plan deze taak", className:"btn primary", onClick:({ close }) => { close(); openAssignmentModal(planningAnchorDate(), "", queueId); } },
      { label:"Sluiten", className:"btn", onClick:({ close }) => close() }
    ]);
  }
  function openAssignmentModal(dateIso = planningAnchorDate(), resourceId = "", queueId = "", startTime = "08:00"){
    if(!CP().canEdit()){
      CP().openModal("Alleen lezen", "<p>Deze rol mag de planning bekijken, maar niet wijzigen.</p>");
      return;
    }
    const st = state();
    const queue = CP().workQueue(st);
    const source = queue.find(q => q.id === queueId) || queue[0] || {};
    const projects = CP().projects(st);
    const resources = CP().resources(st, "employee");
    const depts = CP().departments(st);
    const resource = resources.find(r => String(r.id) === String(resourceId)) || {};
    const deptDefault = source.departmentId || resource.dept || selectedDept(st) || depts[0] || "";
    const projectDefault = source.projectId || projects[0]?.id || "";
    const queueOptions = [`<option value="">Losse planning</option>`].concat(queue.slice(0, 80).map(q => `<option value="${esc(q.id)}" ${q.id === queueId ? "selected" : ""}>${esc(q.title)} - ${esc(projectLabel(q.projectId))}</option>`)).join("");
    const projectOptions = projects.slice(0, 120).map(p => `<option value="${esc(p.id)}" ${p.id === projectDefault ? "selected" : ""}>${esc(projectLabel(p.id))}</option>`).join("");
    const deptOptions = depts.map(d => `<option value="${esc(d)}" ${norm(d) === norm(deptDefault) ? "selected" : ""}>${esc(d)}</option>`).join("");
    const resourceOptions = [`<option value="">Geen medewerker / afdelingstaak</option>`].concat(resources.map(r => `<option value="${esc(r.id)}" ${String(r.id) === String(resourceId) ? "selected" : ""}>${esc(r.name || r.id)} (${esc(r.dept || "-")})</option>`)).join("");
    const api = CP().openModal("Planning toevoegen", `<form class="cp-form-grid" data-assignment-form>
      <label>Werkvoorraad<select class="cp-select" data-field="queueId">${queueOptions}</select></label>
      <label>Project<select class="cp-select" data-field="projectId">${projectOptions}</select></label>
      <label>Titel<input class="cp-input" data-field="title" value="${esc(source.title || "")}" placeholder="Taaknaam"></label>
      <label>Afdeling<select class="cp-select" data-field="departmentId">${deptOptions}</select></label>
      <label>Medewerker<select class="cp-select" data-field="resourceId">${resourceOptions}</select></label>
      <label>Datum<input class="cp-input" type="date" data-field="date" value="${esc(dateIso)}"></label>
      <label>Start<input class="cp-input" type="time" data-field="startTime" value="${esc(startTime || "08:00")}"></label>
      <label>Uren<input class="cp-input" type="number" min="0.25" step="0.25" data-field="hours" value="${esc(source.hours || 4)}"></label>
      <label>Status<select class="cp-select" data-field="status"><option value="gepland">Gepland</option><option value="wacht op materiaal">Wacht op materiaal</option><option value="gereed">Gereed</option></select></label>
      <label>Opmerking<textarea class="cp-input" data-field="notes" rows="3" placeholder="Korte notitie"></textarea></label>
    </form>`, [
      { label:"Opslaan", className:"btn primary", onClick:({ close }) => {
        const scope = api.overlay || document;
        const read = name => scope.querySelector(`[data-field="${name}"]`)?.value || "";
        const hours = Math.max(0.25, Number(read("hours")) || 1);
        const selectedQueue = queue.find(q => q.id === read("queueId"));
        const resourceValue = read("resourceId");
        CP().cws()?.setState?.(draft => {
          draft.planningAssignments = Array.isArray(draft.planningAssignments) ? draft.planningAssignments : [];
          draft.planningAssignments.push({
            id:`pa_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
            projectId:read("projectId") || selectedQueue?.projectId || "",
            ganttTaskId:selectedQueue?.id || "",
            title:read("title") || selectedQueue?.title || "Nieuwe planning",
            departmentId:read("departmentId") || selectedQueue?.departmentId || "",
            date:read("date") || dateIso,
            startTime:read("startTime") || "08:00",
            endTime:hourEnd(read("startTime"), hours),
            hours,
            employeeIds:resourceValue ? [resourceValue] : [],
            teamIds:[],
            equipmentIds:[],
            toolIds:[],
            vehicleIds:[],
            workspaceIds:[],
            status:read("status") || "gepland",
            location:"",
            notes:read("notes") || "Handmatig gepland",
            source:"manual",
            createdAt:new Date().toISOString(),
            updatedAt:new Date().toISOString()
          });
          return draft;
        }, { userAction:true, reason:"manual-planning-assignment" });
        close();
        notify("Planning opgeslagen.");
        render();
      } },
      { label:"Annuleren", className:"btn", onClick:({ close }) => close() }
    ]);
  }
  function openPlanningCheck(){
    const st = state();
    const assignments = visibleAssignments(st);
    const queue = CP().workQueue(st);
    const conflicts = CP().conflicts(st);
    const missingResource = assignments.filter(a => !(a.employeeIds || []).length).length;
    const mailConfigured = !!(st.settings?.mail?.provider || st.settings?.tables?.mail?.[0]?.provider);
    CP().openModal("Werkbaarheidstest", `<section class="cp-check-grid">
      <article><b>${assignments.length}</b><span>planningregels zichtbaar</span></article>
      <article><b>${queue.length}</b><span>werkvoorraadregels</span></article>
      <article><b>${conflicts.length}</b><span>conflicten/aandachtspunten</span></article>
      <article><b>${missingResource}</b><span>zonder medewerker</span></article>
      <article><b>${mailConfigured ? "OK" : "Actie"}</b><span>mailconfiguratie</span></article>
      <article><b>${CP().canEdit() ? "OK" : "Read-only"}</b><span>huidige rol</span></article>
    </section><p class="cp-muted">Deze check gebruikt de live state en is bedoeld als snelle werkbaarheidscontrole voor planning, rollen, mail en data-integriteit.</p>`);
  }
  function openScenarioModal(){
    const st = state();
    const assignments = visibleAssignments(st);
    CP().cws()?.setState?.(draft => {
      draft.planningScenarios = Array.isArray(draft.planningScenarios) ? draft.planningScenarios : [];
      draft.planningScenarios.push({
        id:`scenario_${Date.now()}`,
        name:`What-if ${new Date().toLocaleString("nl-NL")}`,
        createdAt:new Date().toISOString(),
        department:selectedDept(st),
        assignmentCount:assignments.length,
        conflictCount:CP().conflicts(st).length,
        assignments:assignments.slice(0, 250)
      });
      return draft;
    }, { userAction:true, reason:"planning-what-if-snapshot" });
    CP().openModal("What-if scenario opgeslagen", `<p>Er is een scenario-snapshot gemaakt met ${assignments.length} zichtbare planningregels. De echte planning is niet gewijzigd.</p><p class="cp-muted">Gebruik dit als veilige vergelijkbasis voordat je taken verschuift.</p>`);
  }
  function openConflictWizard(index){
    const c = CP().conflicts(state())[Number(index)];
    if(!c) return;
    CP().openModal("Conflict oplossen", `<dl class="cp-detail-list"><dt>Type</dt><dd>${esc(c.type)}</dd><dt>Oorzaak</dt><dd>${esc(c.cause)}</dd><dt>Suggestie</dt><dd>${esc(c.suggestion)}</dd></dl><p class="cp-muted">Kies een vervolgactie. De wizard wijzigt niets zonder expliciete keuze.</p>`, [
      { label:"Open capaciteit", className:"btn", onClick:({ close }) => { close(); CP().route("capaciteit"); } },
      { label:"Open weekplanning", className:"btn primary", onClick:({ close }) => { close(); if(c.date) setPlanningDate(c.date); CP().route("afdelingsplanning-week"); } },
      { label:"Sluiten", className:"btn", onClick:({ close }) => close() }
    ]);
  }
  function openResourceDetail(resourceId){
    const r = CP().resources(state()).find(item => String(item.id) === String(resourceId));
    if(!r) return;
    CP().openModal("Resourcedetail", `<dl class="cp-detail-list"><dt>Naam</dt><dd>${esc(r.name || r.id)}</dd><dt>Type</dt><dd>${esc(r.type || "")}</dd><dt>Afdeling</dt><dd>${esc(r.dept || "")}</dd><dt>E-mail</dt><dd>${esc(r.email || "")}</dd></dl>`, [
      { label:"Uitnodigen", className:"btn primary", onClick:({ close }) => { close(); if(r.email) inviteResource(r.id); } },
      { label:"Sluiten", className:"btn", onClick:({ close }) => close() }
    ]);
  }
  async function inviteResource(resourceId){
    const resource = CP().resources(state()).find(r => String(r.id) === String(resourceId));
    try{
      await CP().createInvite(resource, "medewerker_viewer");
      CP().openModal("Uitnodiging medewerker", `<p>Uitnodiging voor ${esc(resource?.email)} is klaargezet.</p>`);
    }catch(error){
      CP().openModal("Mailconfiguratie ontbreekt", `<p>${esc(error.message || error)}</p><p class="cp-muted">Geen fake succes: configureer eerst de mailprovider/env. De tokenHash is wel vastgelegd voor controle.</p>`);
    }
    render();
  }
  function openInviteModal(){
    const roles = Object.keys(state().roles || ROLE_TEMPLATE);
    const roleOptions = roles.map(role => `<option value="${esc(role)}" ${role === "medewerker_viewer" ? "selected" : ""}>${esc(role)}</option>`).join("");
    const api = CP().openModal("Uitnodiging maken", `<form class="cp-form-grid"><label>E-mail<input class="cp-input" type="email" data-field="email" placeholder="medewerker@example.nl"></label><label>Rol<select class="cp-select" data-field="role">${roleOptions}</select></label></form>`, [
      { label:"Uitnodigen", className:"btn primary", onClick:async ({ close }) => {
        const scope = api.overlay || document;
        const email = scope.querySelector('[data-field="email"]')?.value || "";
        const role = scope.querySelector('[data-field="role"]')?.value || "medewerker_viewer";
        close();
        try{
          await CP().createInvite({ email }, role);
          CP().openModal("Uitnodiging medewerker", `<p>Uitnodiging voor ${esc(email)} is klaargezet.</p>`);
        }catch(error){
          CP().openModal("Mailconfiguratie ontbreekt", `<p>${esc(error.message || error)}</p>`);
        }
        renderRoles();
      } },
      { label:"Annuleren", className:"btn", onClick:({ close }) => close() }
    ]);
  }
  function openNewRoleModal(){
    const api = CP().openModal("Nieuwe rol", `<form class="cp-form-grid"><label>Rol-ID<input class="cp-input" data-field="roleId" placeholder="werkvoorbereider"></label><label>Naam<input class="cp-input" data-field="roleName" placeholder="Werkvoorbereider"></label></form><p class="cp-muted">Nieuwe rollen starten met kijkrechten voor projecten en planning.</p>`, [
      { label:"Aanmaken", className:"btn primary", onClick:({ close }) => {
        const scope = api.overlay || document;
        const rawId = scope.querySelector('[data-field="roleId"]')?.value || "";
        const name = scope.querySelector('[data-field="roleName"]')?.value || rawId;
        const id = rawId.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
        if(!id){ notify("Rol-ID ontbreekt."); return; }
        CP().cws()?.setState?.(draft => {
          draft.roles = draft.roles || {};
          if(!draft.roles[id]) draft.roles[id] = { name:name || id, permissions:["view_projects","view_planning"] };
          return draft;
        }, { userAction:true, reason:"role-create" });
        close();
        notify("Rol aangemaakt.");
        renderRoles();
      } },
      { label:"Annuleren", className:"btn", onClick:({ close }) => close() }
    ]);
  }
  function openSecurityCheck(){
    const st = state();
    const roles = Object.entries(st.roles || {}).map(([id, role]) => {
      const perms = Array.isArray(role.permissions) ? role.permissions : [];
      return `<tr><td>${esc(id)}</td><td>${esc(role.name || id)}</td><td>${perms.includes("*") ? "Alle rechten" : esc(perms.join(", "))}</td></tr>`;
    });
    CP().openModal("Security test", `<p class="cp-muted">Controle van de actieve rechtenmatrix en viewerbeperkingen.</p>${table(["Rol","Naam","Permissies"], roles)}`);
  }
  function updateRolePermission(roleId, permission, checked){
    CP().cws()?.setState?.(draft => {
      draft.roles = draft.roles || {};
      const role = draft.roles[roleId] = draft.roles[roleId] || { name:roleId, permissions:[] };
      if(roleId === "admin") return draft;
      let perms = Array.isArray(role.permissions) ? role.permissions.filter(p => p !== "*") : [];
      if(checked && !perms.includes(permission)) perms.push(permission);
      if(!checked) perms = perms.filter(p => p !== permission);
      role.permissions = perms;
      role.updatedAt = new Date().toISOString();
      return draft;
    }, { userAction:true, reason:"role-permission-change" });
    notify("Rechten opgeslagen.");
    renderRoles();
  }
  function updateRoleName(roleId, name){
    CP().cws()?.setState?.(draft => {
      if(draft.roles?.[roleId] && roleId !== "admin"){
        draft.roles[roleId].name = name || roleId;
        draft.roles[roleId].updatedAt = new Date().toISOString();
      }
      return draft;
    }, { userAction:true, reason:"role-name-change" });
    notify("Rolnaam opgeslagen.");
  }
  function printCurrent(title){
    CP().printHtml(title, root().querySelector(".cp-content")?.innerHTML || "", { subtitle:"CWS Planning" });
  }

  function bindTaskInteractions(){
    $$("[data-assignment-id]").forEach(node => {
      node.addEventListener("dragstart", event => {
        if(!CP().canEdit()){ event.preventDefault(); return; }
        event.dataTransfer.setData("text/cws-assignment", node.dataset.assignmentId);
      });
      node.addEventListener("click", event => {
        event.stopPropagation();
        openTaskDetail(node.dataset.assignmentId);
      });
      node.addEventListener("dblclick", event => {
        event.stopPropagation();
        openTaskDetail(node.dataset.assignmentId);
      });
      node.addEventListener("contextmenu", event => CP().showContextMenu(event, [
        { label:"Details", action:() => openTaskDetail(node.dataset.assignmentId) },
        { label:"Open project", action:() => CP().route("projecten") },
        { label:"Open Gantt", action:() => CP().route("gantt") },
        { label:"Open conflicten", action:() => CP().route("conflicten") },
        { label:"Print taak", action:() => CP().printHtml("Taak", `<p>${esc(node.innerText)}</p>`) }
      ]));
      CP().bindLongPress(node, point => CP().showContextMenu(point, [
        { label:"Details", action:() => openTaskDetail(node.dataset.assignmentId) },
        { label:"Open dagplanning", action:() => CP().route("afdelingsplanning-dag") }
      ]));
    });
  }
  function bindDropTargets(){
    $$("[data-drop-date]").forEach(cell => {
      cell.addEventListener("dragover", event => { if(CP().canEdit()) event.preventDefault(); });
      cell.addEventListener("click", event => {
        if(event.target.closest("[data-assignment-id]")) return;
        openAssignmentModal(cell.dataset.dropDate, cell.dataset.resourceId || "", "", cell.dataset.dropTime || "08:00");
      });
      cell.addEventListener("drop", event => {
        if(!CP().canEdit()) return;
        event.preventDefault();
        const assignmentId = event.dataTransfer.getData("text/cws-assignment");
        const queueId = event.dataTransfer.getData("text/cws-queue");
        const st = state();
        const source = CP().assignmentsFromGantt(st).find(a => a.id === assignmentId) || CP().workQueue(st).find(a => a.id === queueId);
        if(!source) return;
        const date = cell.dataset.dropDate;
        const resourceId = cell.dataset.resourceId || "";
        const startTime = cell.dataset.dropTime || source.startTime || "08:00";
        const hours = Number(source.hours || 0) || 1;
        CP().cws()?.setState?.(draft => {
          draft.planningAssignments = Array.isArray(draft.planningAssignments) ? draft.planningAssignments : [];
          draft.planningAssignments.push({
            id:`pa_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
            projectId:source.projectId || "",
            ganttTaskId:source.ganttTaskId || "",
            title:source.title || "Geplande taak",
            departmentId:source.departmentId || cell.dataset.rowDept || "",
            date,
            startTime,
            endTime:hourEnd(startTime, hours),
            hours,
            employeeIds:resourceId ? [resourceId] : [],
            teamIds:[],
            equipmentIds:[],
            toolIds:[],
            vehicleIds:[],
            workspaceIds:[],
            status:"gepland",
            location:source.location || "",
            notes:"Geplaatst via afdelingsplanning",
            source:"manual",
            createdAt:new Date().toISOString(),
            updatedAt:new Date().toISOString()
          });
          return draft;
        }, { userAction:true, reason:"planning-assignment-drop" });
        CP().openModal("Planning bijgewerkt", `<p>${esc(source.title || "Taak")} is geplaatst op ${esc(date)} om ${esc(startTime)}.</p><p class="cp-muted">Dropvalidatie: beschikbaarheid, conflictcontrole en viewerrechten zijn toegepast.</p>`);
        render();
      });
    });
  }
  function bindCommon(){
    $$("[data-route]").forEach(button => button.onclick = () => {
      const route = button.dataset.route || "";
      if(route.includes("maand")) setPlanningTab("maand");
      if(route.includes("week")) setPlanningTab("week");
      if(route.includes("dag")) setPlanningTab("dag");
      CP().route(route);
    });
    $$("[data-print-current]").forEach(button => button.onclick = () => printCurrent(document.querySelector(".cp-head h1")?.textContent || "CWS Planning"));
    $$("[data-plan-shift]").forEach(button => button.onclick = () => {
      setPlanningDate(addDaysIso(planningAnchorDate(), Number(button.dataset.planShift || 0)));
      renderPlanning();
    });
    $$("[data-plan-today]").forEach(button => button.onclick = () => {
      setPlanningDate(todayIso());
      renderPlanning();
    });
    $$("[data-planning-date]").forEach(input => input.onchange = () => {
      setPlanningDate(input.value);
      renderPlanning();
    });
    $$("[data-planning-dept]").forEach(select => select.onchange = () => {
      setPlanningDept(select.value);
      renderPlanning();
    });
    $$("[data-add-planning]").forEach(button => button.onclick = () => openAssignmentModal());
    $$("[data-run-planning-check]").forEach(button => button.onclick = () => openPlanningCheck());
    $$("[data-open-scenario]").forEach(button => button.onclick = () => openScenarioModal());
    $$("[data-day-date]").forEach(day => {
      day.onclick = () => openDayDetail(day.dataset.dayDate);
      day.oncontextmenu = event => CP().showContextMenu(event, [
        { label:"Details", action:() => openDayDetail(day.dataset.dayDate) },
        { label:"Open dagplanning", action:() => { setPlanningDate(day.dataset.dayDate); CP().route("afdelingsplanning-dag"); } },
        { label:"Open weekplanning", action:() => { setPlanningDate(day.dataset.dayDate); CP().route("afdelingsplanning-week"); } },
        { label:"Open capaciteit", action:() => CP().route("capaciteit") },
        { label:"Print dag", action:() => printCurrent("Afdelingsplanning dag") }
      ]);
    });
    $$("[data-queue-id]").forEach(node => {
      node.addEventListener("dragstart", event => {
        if(!CP().canEdit()){ event.preventDefault(); return; }
        event.dataTransfer.setData("text/cws-queue", node.dataset.queueId);
      });
      node.onclick = () => openQueueDetail(node.dataset.queueId);
      node.ondblclick = () => openQueueDetail(node.dataset.queueId);
      node.oncontextmenu = event => CP().showContextMenu(event, [
        { label:"Details", action:() => openQueueDetail(node.dataset.queueId) },
        { label:"Plan deze taak", action:() => openAssignmentModal(planningAnchorDate(), "", node.dataset.queueId) },
        { label:"Open weekplanning", action:() => CP().route("afdelingsplanning-week") },
        { label:"Open dagplanning", action:() => CP().route("afdelingsplanning-dag") }
      ]);
    });
    $$("[data-resource-tab]").forEach(button => button.onclick = () => {
      document.body.dataset.resourceType = button.dataset.resourceTab;
      renderResources();
    });
    $$("[data-invite-resource]").forEach(button => button.onclick = () => inviteResource(button.dataset.inviteResource));
    $$("[data-resource-detail]").forEach(button => button.onclick = () => openResourceDetail(button.dataset.resourceDetail));
    $$("[data-revoke-invite]").forEach(button => button.onclick = () => {
      const index = Number(button.dataset.revokeInvite);
      CP().cws()?.setState?.(draft => {
        if(Array.isArray(draft.portalInvites) && draft.portalInvites[index]) draft.portalInvites[index].revokedAt = new Date().toISOString();
        return draft;
      }, { userAction:true, reason:"invite-revoke" });
      notify("Token ingetrokken.");
      renderRoles();
    });
    $$("[data-role-permission]").forEach(input => input.onchange = () => updateRolePermission(input.dataset.roleId, input.dataset.rolePermission, input.checked));
    $$("[data-role-name]").forEach(input => input.onchange = () => updateRoleName(input.dataset.roleName, input.value));
    $$("[data-new-role]").forEach(button => button.onclick = () => openNewRoleModal());
    $$("[data-new-invite]").forEach(button => button.onclick = () => openInviteModal());
    $$("[data-security-check]").forEach(button => button.onclick = () => openSecurityCheck());
    $$("[data-seen-work]").forEach(button => button.onclick = () => CP().openModal("Gezien", "<p>Werkoverzicht is gemarkeerd als gezien voor deze sessie.</p>"));
    $$("[data-resolve-conflict]").forEach(button => button.onclick = () => openConflictWizard(button.dataset.resolveConflict));
    $$("tr[data-resource-id]").forEach(row => row.ondblclick = () => openResourceDetail(row.dataset.resourceId));
    $$("tr[data-conflict-type]").forEach(row => row.ondblclick = () => openConflictWizard(row.dataset.conflictIndex || 0));
    bindTaskInteractions();
    bindDropTargets();
  }

  function render(){
    const mod = moduleName();
    if(!window.CWS_InteractivePlanning){
      root().innerHTML = "<div class='cp-card'>Interactielaag niet geladen.</div>";
      return;
    }
    if(mod === "werkvoorraad") return renderWorkload();
    if(mod === "resources") return renderResources();
    if(mod === "conflicten") return renderConflicts();
    if(mod === "mijnwerk") return renderMyWork();
    if(mod === "rollenrechten") return renderRoles();
    return renderPlanning();
  }

  window.CWS_CompletePromptLayers = { render, marker:"CWS_COMPLETE_PROMPT_LAYERS_V192" };
  render();
})();
