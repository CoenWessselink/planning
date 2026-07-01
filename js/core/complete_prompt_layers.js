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

  function state(){ return CP().state(); }
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
  function taskBlock(a, cls = ""){
    return `<span class="cp-task ${cls}" draggable="${CP().canEdit()}" data-assignment-id="${esc(a.id)}" data-project-id="${esc(a.projectId || "")}" data-task-title="${esc(a.title || "")}">
      <strong>${esc(a.title || "Taak")}</strong><br>
      <span class="cp-muted">${esc(projectLabel(a.projectId))} | ${esc(a.departmentId || "")} | ${esc(a.hours || 0)}u</span>
    </span>`;
  }
  function bindTaskInteractions(){
    $$("[data-assignment-id]").forEach(node => {
      node.addEventListener("dragstart", event => {
        if(!CP().canEdit()){ event.preventDefault(); return; }
        event.dataTransfer.setData("text/cws-assignment", node.dataset.assignmentId);
      });
      const detail = () => CP().openModal("Taakdetail", `<p><strong>${esc(node.dataset.taskTitle || "Taak")}</strong></p><p>${esc(projectLabel(node.dataset.projectId))}</p><p class="cp-muted">Bron: bestaande Gantt/planningdata. Viewerrollen kunnen dit alleen lezen.</p>`);
      node.addEventListener("dblclick", detail);
      node.addEventListener("contextmenu", event => CP().showContextMenu(event, [
        { label:"Details", action:detail },
        { label:"Open project", action:() => CP().route("projecten") },
        { label:"Open Gantt", action:() => CP().route("gantt") },
        { label:"Open conflicten", action:() => CP().route("conflicten") },
        { label:"Print taak", action:() => CP().printHtml("Taak", `<p>${esc(node.innerText)}</p>`) }
      ]));
      CP().bindLongPress(node, point => CP().showContextMenu(point, [
        { label:"Details", action:detail },
        { label:"Open dagplanning", action:() => CP().route("afdelingsplanning-dag") }
      ]));
    });
  }
  function bindDropTargets(){
    $$("[data-drop-date]").forEach(cell => {
      cell.addEventListener("dragover", event => { if(CP().canEdit()) event.preventDefault(); });
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
        const endTime = source.endTime || "12:00";
        CP().cws()?.setState?.(draft => {
          draft.planningAssignments = Array.isArray(draft.planningAssignments) ? draft.planningAssignments : [];
          draft.planningAssignments.push({
            id:`pa_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
            projectId:source.projectId || "",
            ganttTaskId:source.ganttTaskId || "",
            departmentId:source.departmentId || "",
            date,
            startTime,
            endTime,
            hours:Number(source.hours || 0),
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
  function printCurrent(title){
    CP().printHtml(title, root().querySelector(".cp-content")?.innerHTML || "", { subtitle:"CWS Planning" });
  }

  function routeTab(appId, label, active){
    return btn(label, `data-route="${appId}"`, active ? "active" : "");
  }
  function activePlanningTab(){
    const fromQuery = new URLSearchParams(location.search).get("app") || "";
    const fromFrame = window.frameElement?.dataset?.activeApp || "";
    const fromParent = window.parent?.Router?.getActiveApp?.() || "";
    const app = fromQuery || fromFrame || fromParent;
    if(app.includes("dag")) return "dag";
    if(app.includes("week")) return "week";
    if(app.includes("maand")) return "maand";
    return state().ui?.departmentPlanningTab || "maand";
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
    const content = tab === "dag" ? dayPlanning() : tab === "week" ? weekPlanning() : monthPlanning();
    shell("Afdelingsplanning", "Werk verdelen vanuit Gantt, capaciteit en werkvoorraad", content, { tabs, actions:btn("Print", "data-print-current") });
    bindCommon();
  }
  function monthPlanning(){
    const st = state();
    const start = CP().weekDays(st)[0]?.date || new Date().toISOString().slice(0, 10);
    const first = new Date(`${start}T00:00:00Z`);
    first.setUTCDate(first.getUTCDate() - 14);
    const assignments = CP().assignmentsFromGantt(st);
    const depts = CP().departments(st);
    const days = Array.from({ length:35 }, (_, i) => {
      const date = new Date(first.getTime());
      date.setUTCDate(first.getUTCDate() + i);
      const iso = date.toISOString().slice(0, 10);
      const planned = assignments.filter(a => a.date === iso).reduce((sum, a) => sum + Number(a.hours || 0), 0);
      const available = depts.reduce((sum, dept) => sum + CP().availableByDeptDay(st, dept, iso), 0);
      const pct = available ? Math.round(planned / available * 100) : (planned ? 150 : 0);
      const cls = pct > 120 ? "red" : pct > 95 ? "orange" : pct > 0 ? "green" : "gray";
      return `<button class="cp-day ${cls} cp-context-target" data-day-date="${iso}"><b>${iso.slice(8,10)}-${iso.slice(5,7)}</b>${Math.round(planned)}u gepland<br><span class="cp-muted">${Math.round(available)}u beschikbaar | ${pct}%</span></button>`;
    }).join("");
    return `<div class="cp-month">${days}</div>`;
  }
  function weekPlanning(){
    const st = state();
    const days = CP().weekDays(st);
    const assignments = CP().weekAssignments(st);
    const resources = CP().resources(st).slice(0, 14);
    const header = `<div class="cp-headcell">Resource / team</div>${days.map(d => `<div class="cp-headcell">${esc(d.label)}<br><span class="cp-muted">${esc(d.date.slice(5))}</span></div>`).join("")}`;
    const rows = (resources.length ? resources : [{ id:"", name:"Geen resources ingericht", dept:"" }]).map(resource => {
      const cells = days.map(day => {
        const items = assignments.filter(a => a.date === day.date && (!resource.id || (a.employeeIds || []).includes(resource.id)));
        return `<div class="cp-cell" data-drop-date="${esc(day.date)}" data-resource-id="${esc(resource.id || "")}">${items.map(a => taskBlock(a, CP().conflicts(st).some(c => c.date === a.date && c.projectId === a.projectId) ? "conflict" : "")).join("")}</div>`;
      }).join("");
      return `<div class="cp-cell"><strong>${esc(resource.name || resource.id)}</strong><br><span class="cp-muted">${esc(resource.type || "resource")} | ${esc(resource.dept || "")}</span></div>${cells}`;
    }).join("");
    const queue = CP().workQueue(st).slice(0, 8).map(q => `<span class="cp-task warn" draggable="${CP().canEdit()}" data-queue-id="${esc(q.id)}"><strong>${esc(q.title)}</strong><br><span class="cp-muted">${esc(projectLabel(q.projectId))} | ${esc(q.status)}</span></span>`).join("") || `<p class="cp-muted">Geen werkvoorraad buiten planning gevonden.</p>`;
    return `<section class="cp-grid cp-cols-2"><article class="cp-card"><h2>Werkvoorraad</h2>${queue}</article><div><div class="cp-scroll-hint">Horizontaal scrollen voor meer data</div><div class="cp-scroll"><div class="cp-week">${header}${rows}</div></div></div></section>`;
  }
  function dayPlanning(){
    const st = state();
    const today = CP().weekDays(st)[0]?.date || new Date().toISOString().slice(0, 10);
    const resources = CP().resources(st).slice(0, 5);
    const dayResources = resources.length ? resources : [{ id:"", name:"Geen resources ingericht", type:"resource" }];
    const assignments = CP().assignmentsFromGantt(st).filter(a => a.date === today);
    const minWidth = Math.max(360, 92 + dayResources.length * 155);
    const gridStyle = `grid-template-columns:92px repeat(${dayResources.length},minmax(155px,1fr));min-width:${minWidth}px`;
    const header = `<div class="cp-headcell">Tijd</div>${dayResources.map(r => `<div class="cp-headcell">${esc(r.name || r.id)}<br><span class="cp-muted">${esc(r.type || "employee")}</span></div>`).join("")}`;
    const rows = [];
    for(let hour = 6; hour <= 18; hour += 1){
      rows.push(`<div class="cp-cell cp-time ${hour === 11 ? "cp-now" : ""}">${pad(hour)}:00</div>`);
      dayResources.forEach(r => {
        const time = `${pad(hour)}:00`;
        const items = r.id ? assignments.filter(a => a.startTime === time && (a.employeeIds || []).includes(r.id)) : [];
        rows.push(`<div class="cp-cell" data-drop-date="${esc(today)}" data-drop-time="${time}" data-resource-id="${esc(r.id)}">${items.map(taskBlock).join("")}</div>`);
      });
    }
    return `<div class="cp-scroll-hint">Horizontaal scrollen voor meer data</div><div class="cp-scroll"><div class="cp-dayplan" style="${gridStyle}">${header}${rows.join("")}</div></div>`;
  }

  function renderWorkload(){
    const st = state();
    const groups = [
      ["Nog te plannen", q => /nog|plan/i.test(q.status || "")],
      ["Vandaag", q => q.deadline === new Date().toISOString().slice(0, 10)],
      ["Deze week", q => !!q.deadline],
      ["Te laat", q => q.deadline && q.deadline < new Date().toISOString().slice(0, 10)],
      ["Geblokkeerd", q => /blok/i.test(q.status || q.reason || "")],
      ["Wacht op materiaal", q => /materiaal/i.test(q.status || q.reason || "")],
      ["Wacht op tekening", q => /tekening/i.test(q.status || q.reason || "")],
      ["Zonder medewerker/materieel/gereedschap", q => !q.resourceId]
    ];
    const queue = CP().workQueue(st);
    const cards = groups.map(([label, fn]) => {
      const items = queue.filter(fn).slice(0, 10);
      return `<article class="cp-card"><h2>${esc(label)}</h2>${items.map(q => `<span class="cp-task warn" draggable="${CP().canEdit()}" data-queue-id="${esc(q.id)}"><strong>${esc(q.title)}</strong><br><span class="cp-muted">${esc(projectLabel(q.projectId))} | ${esc(q.hours)}u | ${esc(q.priority)}</span></span>`).join("") || `<p class="cp-muted">Geen items.</p>`}</article>`;
    }).join("");
    shell("Werkvoorraad", "Nog te plannen werk, blokkades en ontbrekende resources", `<section class="cp-workqueue">${cards}</section>`, { actions:btn("Print werkvoorraad", "data-print-current") });
    bindCommon();
  }

  function renderResources(){
    const tab = new URLSearchParams(location.search).get("type") || document.body.dataset.resourceType || "employee";
    const tabs = ["employee","equipment","tool"].map(type => btn(type === "employee" ? "Medewerkers" : type === "equipment" ? "Materieel" : "Gereedschap", `data-resource-tab="${type}"`, tab === type ? "active" : "")).join("");
    const rows = CP().resources(state(), tab).map(r => `<tr data-resource-id="${esc(r.id)}"><td><strong>${esc(r.name || r.id)}</strong><br><span class="cp-muted">${esc(r.email || "")}</span></td><td>${esc(r.type || tab)}</td><td>${esc(r.dept || "")}</td><td>${esc(r.daily || r.ma || "")}</td><td><span class="cp-pill ${r.active === false ? "gray" : "green"}">${r.active === false ? "Niet actief" : "Actief"}</span></td><td>${tab === "employee" ? btn("Medewerker uitnodigen", `data-invite-resource="${esc(r.id)}" ${CP().canInvite() ? "" : "disabled"}`) : btn("Beschikbaarheid", `data-resource-detail="${esc(r.id)}"`)}</td></tr>`);
    shell("Resources", "Medewerkers, materieel, gereedschap en beschikbaarheid", table(["Naam", "Type", "Afdeling", "Uren/dag", "Status", "Actie"], rows), { tabs, actions:btn("Print resources", "data-print-current") });
    bindCommon();
  }

  function renderConflicts(){
    const rows = CP().conflicts(state()).map(c => `<tr data-conflict-type="${esc(c.type)}"><td><span class="cp-pill ${c.severity === "Hoog" ? "red" : c.severity === "Midden" ? "orange" : "blue"}">${esc(c.type)}</span></td><td>${esc(projectLabel(c.projectId))}</td><td>${esc(c.task)}</td><td>${esc(c.departmentId)}</td><td>${esc(c.date)}</td><td>${esc(c.cause)}</td><td>${esc(c.suggestion)}</td></tr>`);
    shell("Conflicten", "Centraal conflictcenter met oplossuggesties", table(["Type", "Project", "Taak", "Afdeling", "Datum", "Oorzaak", "Suggestie"], rows), { actions:btn("Print conflicten", "data-print-current") });
    bindCommon();
  }

  function renderMyWork(){
    const st = state();
    const email = CP().cws()?.getCurrentUser?.()?.email || st.user?.email || "";
    const ownResource = CP().resources(st).find(r => norm(r.email) === norm(email)) || CP().resources(st)[0] || {};
    const own = CP().assignmentsFromGantt(st).filter(a => !ownResource.id || (a.employeeIds || []).includes(ownResource.id)).slice(0, 60);
    const today = new Date().toISOString().slice(0, 10);
    const todayRows = own.filter(a => a.date === today).map(a => `<p><strong>${esc(a.startTime)}-${esc(a.endTime)}</strong> ${esc(a.title)}<br><span class="cp-muted">${esc(projectLabel(a.projectId))} | ${esc(a.location || "")}</span></p>`).join("") || `<p class="cp-muted">Geen taken vandaag.</p>`;
    const weekRows = own.map(a => `<tr><td>${esc(a.date)}</td><td>${esc(a.startTime)}-${esc(a.endTime)}</td><td>${esc(projectLabel(a.projectId))}</td><td>${esc(a.title)}</td><td>${esc(a.departmentId)}</td><td>${esc(a.location || "")}</td><td>${esc((a.equipmentIds || []).join(", "))}</td><td>${esc((a.toolIds || []).join(", "))}</td><td>${esc(a.notes || "")}</td></tr>`);
    const body = `<section class="cp-grid cp-cols-2"><article class="cp-card"><h2>Vandaag</h2>${todayRows}<button class="cp-btn" type="button" data-seen-work>Gezien</button></article><article class="cp-card"><h2>Volgende week</h2><p class="cp-muted">Read-only. Vragen gaan naar de planner; geen drag/drop, geen edit, geen uren aanpassen.</p></article></section><div class="cp-scroll-hint">Horizontaal scrollen voor meer data</div>${table(["Datum","Tijd","Project","Taak","Afdeling","Locatie","Materieel","Gereedschap","Opmerkingen"], weekRows)}`;
    shell("Mijn werk", "Medewerkerportaal read-only: alleen eigen werkzaamheden", body, { actions:btn("Print dag", "data-print-current") + btn("Print week", "data-print-current") });
    bindCommon();
  }

  function renderRoles(){
    const st = state();
    const perms = ["view_projects","edit_projects","view_planning","edit_planning","planning_assign","invite_employee","view_resources","view_own_work","admin_settings","print_export"];
    const rows = Object.entries(st.roles || {}).map(([id, role]) => `<tr><td><strong>${esc(role.name || id)}</strong><br><span class="cp-muted">${esc(id)}</span></td>${perms.map(p => `<td>${(role.permissions || []).includes("*") || (role.permissions || []).includes(p) ? "<span class='cp-pill green'>ja</span>" : "<span class='cp-pill gray'>nee</span>"}</td>`).join("")}</tr>`);
    const inviteRows = (Array.isArray(st.portalInvites) ? st.portalInvites : []).map((i, index) => `<tr><td>${esc(i.email)}</td><td>${esc(i.role)}</td><td>${esc(i.invitedAt)}</td><td>${esc(i.expiresAt)}</td><td>${esc(i.revokedAt ? "ingetrokken" : i.status || "actief")}</td><td>${i.revokedAt ? "" : btn("Token intrekken", `data-revoke-invite="${index}"`)}</td></tr>`);
    const body = `<article class="cp-card"><h2>Rechtenmatrix</h2>${table(["Rol"].concat(perms), rows)}</article><article class="cp-card" style="margin-top:12px"><h2>Uitnodigingen</h2><p class="cp-muted">Tokens worden alleen als tokenHash bewaard; plain token wordt niet opgeslagen of gelogd.</p>${table(["E-mail","Rol","Uitgenodigd","Verloopt","Status","Actie"], inviteRows)}</article>`;
    shell("Rollen & rechten", "Admin, planner, afdelingsplanner, projectleider, medewerker_viewer en extern_viewer", body, { actions:btn("Print rollen", "data-print-current") });
    bindCommon();
  }

  function bindCommon(){
    $$("[data-route]").forEach(button => button.onclick = () => CP().route(button.dataset.route));
    $$("[data-print-current]").forEach(button => button.onclick = () => printCurrent(document.querySelector(".cp-head h1")?.textContent || "CWS Planning"));
    $$("[data-day-date]").forEach(day => {
      day.onclick = () => CP().route("afdelingsplanning-dag");
      day.oncontextmenu = event => CP().showContextMenu(event, [
        { label:"Open dagplanning", action:() => CP().route("afdelingsplanning-dag") },
        { label:"Open weekplanning", action:() => CP().route("afdelingsplanning-week") },
        { label:"Open capaciteit", action:() => CP().route("capaciteit") },
        { label:"Print dag", action:() => printCurrent("Afdelingsplanning dag") }
      ]);
    });
    $$("[data-queue-id]").forEach(node => {
      node.addEventListener("dragstart", event => {
        if(!CP().canEdit()){ event.preventDefault(); return; }
        event.dataTransfer.setData("text/cws-queue", node.dataset.queueId);
      });
      node.ondblclick = () => CP().openModal("Werkvoorraad", `<p>${esc(node.innerText)}</p>`);
      node.oncontextmenu = event => CP().showContextMenu(event, [
        { label:"Details", action:() => CP().openModal("Werkvoorraad", `<p>${esc(node.innerText)}</p>`) },
        { label:"Open weekplanning", action:() => CP().route("afdelingsplanning-week") },
        { label:"Open dagplanning", action:() => CP().route("afdelingsplanning-dag") }
      ]);
    });
    $$("[data-resource-tab]").forEach(button => button.onclick = () => {
      document.body.dataset.resourceType = button.dataset.resourceTab;
      renderResources();
    });
    $$("[data-invite-resource]").forEach(button => button.onclick = async () => {
      const resource = CP().resources(state()).find(r => String(r.id) === button.dataset.inviteResource);
      try{
        await CP().createInvite(resource, "medewerker_viewer");
        CP().openModal("Uitnodiging medewerker", `<p>Uitnodiging voor ${esc(resource?.email)} is klaargezet.</p>`);
      }catch(error){
        CP().openModal("Mailconfiguratie ontbreekt", `<p>${esc(error.message || error)}</p><p class="cp-muted">Geen fake succes: configureer eerst de mailprovider/env.</p>`);
      }
      render();
    });
    $$("[data-revoke-invite]").forEach(button => button.onclick = () => {
      const index = Number(button.dataset.revokeInvite);
      CP().cws()?.setState?.(draft => {
        if(Array.isArray(draft.portalInvites) && draft.portalInvites[index]) draft.portalInvites[index].revokedAt = new Date().toISOString();
        return draft;
      }, { userAction:true, reason:"invite-revoke" });
      renderRoles();
    });
    $$("[data-seen-work]").forEach(button => button.onclick = () => CP().openModal("Gezien", "<p>Werkoverzicht is gemarkeerd als gezien voor deze sessie.</p>"));
    $$("tr[data-resource-id]").forEach(row => row.ondblclick = () => CP().openModal("Resourcedetail", `<p>${esc(row.innerText)}</p><p class="cp-muted">Planning, beschikbaarheid, vervangen en conflicten zijn bereikbaar via contextmenu.</p>`));
    $$("tr[data-conflict-type]").forEach(row => row.ondblclick = () => CP().openModal("Conflictdetail", `<p>${esc(row.innerText)}</p>`));
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

  window.CWS_CompletePromptLayers = { render, marker:"CWS_COMPLETE_PROMPT_LAYERS_V190" };
  render();
})();
