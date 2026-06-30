(function(){
  "use strict";

  const MARKER = "CWS_CAPACITY_TASCHE_A3_PRINT_V157";
  const PRINT_WINDOW_NAME = "cws_capacity_overview_print";
  const PRINT_STORAGE_PREFIX = "cws.capacity.print.html.";
  const ROOT_ID = "cwsCapacityPrintRoot";
  const STYLE_ID = "cwsCapacityPrintRootStyle";
  const STALE_BWS_FRAME_ID = "cwsBwsA3PrintFrame";
  const WEEK_COUNT = 29;
  const PERIOD_CONTRACT = "3 weken terug t/m 26 weken vooruit";
  const LOGO_SRC = `${window.location.origin}/assets/tasche-logo.png`;
  const NL_MONTHS = ["JANUARI","FEBRUARI","MAART","APRIL","MEI","JUNI","JULI","AUGUSTUS","SEPTEMBER","OKTOBER","NOVEMBER","DECEMBER"];
  const DEPARTMENT_COLORS = {
    productie:"#dff0d8",
    engineering:"#f8efc8",
    montage:"#dbeafe",
    werkvoorbereiding:"#d6f4f0",
    conservering:"#f2dfc8",
    beheer:"#e5e7eb",
    logistiek:"#e9d5ff",
    transport:"#fde2e2"
  };

  const pad = n => String(n).padStart(2, "0");
  const round = v => Math.round((Number(v) || 0) * 10) / 10;
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[c]));
  const norm = v => String(v || "").trim().toLowerCase();
  const num = v => {
    const n = Number(v || 0);
    if(!n) return "";
    return new Intl.NumberFormat("nl-NL", { maximumFractionDigits:Number.isInteger(n) ? 0 : 1 }).format(round(n));
  };

  function state(){
    return window.CWS?.getState?.() || { projects:{ order:[], byId:{}, deptHours:[] }, resources:{ order:[], byId:{} }, departments:{ order:[], byId:{} }, gantt:{ hoursByDay:{}, sourcesByDay:{} }, settings:{ tables:{} } };
  }
  function weekStartUTC(year, week){
    const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
    const dow = simple.getUTCDay();
    simple.setUTCDate(simple.getUTCDate() + (dow <= 4 ? 1 - dow : 8 - dow));
    return simple;
  }
  function isoWeekFromDate(date){
    const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return { isoYear:tmp.getUTCFullYear(), isoWeek:Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7) };
  }
  function addDays(date, days){
    const d = new Date(date.getTime());
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }
  function addWeeks(year, week, amount){
    const start = weekStartUTC(year, week);
    start.setUTCDate(start.getUTCDate() + amount * 7);
    return isoWeekFromDate(start);
  }
  function iso(date){
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }
  function todayDate(){
    const override = window.CWS_CapacityPrintTascheA3?.mockToday || window.CWS?.capacityPrintMockToday;
    const d = override ? new Date(`${String(override).slice(0, 10)}T00:00:00Z`) : new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }
  function buildWeeks(today = todayDate()){
    const current = isoWeekFromDate(today);
    const start = addWeeks(current.isoYear, current.isoWeek, -3);
    return Array.from({ length:WEEK_COUNT }, (_, i) => {
      const w = addWeeks(start.isoYear, start.isoWeek, i);
      const monday = weekStartUTC(w.isoYear, w.isoWeek);
      const end = addDays(monday, 6);
      return {
        isoYear:w.isoYear,
        isoWeek:w.isoWeek,
        key:`${w.isoYear}-W${pad(w.isoWeek)}`,
        monthLabel:NL_MONTHS[monday.getUTCMonth()],
        mondayDate:iso(monday),
        startDate:iso(monday),
        endDate:iso(end)
      };
    });
  }
  function monthGroups(weeks){
    const groups = [];
    weeks.forEach(w => {
      const label = `${w.monthLabel} ${w.isoYear}`;
      const last = groups[groups.length - 1];
      if(last && last.label === label) last.span += 1;
      else groups.push({ label, span:1 });
    });
    return groups;
  }

  function departmentRows(st){
    const byToken = new Map();
    const add = (id, name) => {
      const display = String(name || id || "").trim();
      if(!display) return;
      const key = norm(display);
      if(!byToken.has(key)) byToken.set(key, { id:String(id || display), name:display });
    };
    (Array.isArray(st.settings?.tables?.departments) ? st.settings.tables.departments : []).forEach(d => add(d.id || d.code || d.name, d.name || d.dept || d.afdeling || d.id));
    (st.departments?.order || []).forEach(id => add(id, st.departments?.byId?.[id]?.name || id));
    (st.resources?.order || []).forEach(id => add(st.resources?.byId?.[id]?.dept, st.resources?.byId?.[id]?.dept));
    (Array.isArray(st.settings?.tables?.employees) ? st.settings.tables.employees : []).forEach(e => add(e.dept, e.dept));
    (Array.isArray(st.projects?.deptHours) ? st.projects.deptHours : []).forEach(r => add(r.deptId || r.dept || r.department, r.deptId || r.dept || r.department));
    Object.values(st.gantt?.hoursByDay || {}).forEach(byDept => Object.keys(byDept || {}).forEach(d => add(d, d)));
    Object.values(st.gantt?.sourcesByDay || {}).forEach(byDept => Object.keys(byDept || {}).forEach(d => add(d, d)));
    return [...byToken.values()].sort((a, b) => a.name.localeCompare(b.name, "nl"));
  }
  function selectedDepartments(st, options = {}){
    const selected = String(options.selectedDept ?? document.querySelector("#deptSel")?.value ?? document.querySelector("#mobileCapDept")?.value ?? "").trim();
    const depts = departmentRows(st);
    if(!selected) return depts;
    const wanted = norm(selected);
    return depts.filter(d => norm(d.id) === wanted || norm(d.name) === wanted);
  }
  function departmentColor(name){
    const key = norm(name);
    return DEPARTMENT_COLORS[key] || "#e8edf3";
  }
  function projectRows(st){
    return (st.projects?.order || []).map(id => ({ id, ...(st.projects?.byId?.[id] || {}) })).filter(p => p.id);
  }
  function projectDeptBudget(st, projectId, dept){
    const wantDept = norm(dept);
    const project = st.projects?.byId?.[projectId] || {};
    let total = 0;
    Object.entries(project.deptHours || {}).forEach(([d, h]) => { if(norm(d) === wantDept) total += Number(h || 0); });
    (Array.isArray(st.projects?.deptHours) ? st.projects.deptHours : []).forEach(row => {
      const rowProject = String(row.projectId || row.project || "").trim();
      const rowDept = String(row.deptId || row.dept || row.department || "").trim();
      if(String(projectId) === rowProject && norm(rowDept) === wantDept) total += Number(row.hours || 0);
    });
    return round(total);
  }
  function sourceKey(date, dept, item){
    return [date, dept, item?.projectId || "", item?.taskId || item?.rowId || "", item?.taskName || "", item?.resourceId || "", item?.allocationMode || "", item?.hoursSource || "", Number(item?.hours || 0)].join("|");
  }
  function dedupeSources(date, dept, arr){
    if(!Array.isArray(arr)) return [];
    const seen = new Set();
    return arr.filter(item => {
      const key = sourceKey(date, dept, item);
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function projectWeekHours(st, projectId, dept, week){
    let total = 0;
    Object.entries(st.gantt?.sourcesByDay || {}).forEach(([date, byDept]) => {
      if(date < week.startDate || date > week.endDate) return;
      dedupeSources(date, dept, byDept?.[dept] || []).forEach(item => {
        if(String(item?.projectId || "") === String(projectId)) total += Number(item?.hours || 0);
      });
    });
    return round(total);
  }
  function isNonWorkingIso(st, dateIso){
    const cal = st.settings?.calendar || {};
    if(Object.prototype.hasOwnProperty.call(cal.overrides || {}, dateIso)) return !!cal.overrides[dateIso];
    const d = new Date(`${dateIso}T00:00:00Z`);
    const day = d.getUTCDay() || 7;
    const workweek = cal.workweek || { 1:true, 2:true, 3:true, 4:true, 5:true, 6:false, 7:false };
    return workweek[day] === false;
  }
  function availableByDeptDay(st, dept, dateIso){
    const override = st.capacity?.availabilityOverrides?.[dept]?.[dateIso];
    if(override && override.hours !== undefined) return round(override.hours);
    if(isNonWorkingIso(st, dateIso)) return 0;
    const key = ["ma","di","wo","do","vr","za","zo"][(new Date(`${dateIso}T00:00:00Z`).getUTCDay() || 7) - 1];
    const employees = Array.isArray(st.settings?.tables?.employees) ? st.settings.tables.employees : [];
    if(employees.length){
      return round(employees.filter(e => norm(e.dept) === norm(dept) && (e.active ?? true) !== false).reduce((sum, e) => sum + Number(e[key] || 0), 0));
    }
    const resources = (st.resources?.order || []).map(id => st.resources?.byId?.[id]).filter(r => norm(r?.dept) === norm(dept));
    return round(resources.reduce((sum, r) => sum + Number(r.daily || 0), 0));
  }
  function availableByDeptWeek(st, dept, week){
    const start = new Date(`${week.startDate}T00:00:00Z`);
    let total = 0;
    for(let i = 0; i < 7; i += 1) total += availableByDeptDay(st, dept, iso(addDays(start, i)));
    return round(total);
  }

  function buildPrintModel(options = {}){
    const st = state();
    const weeks = buildWeeks(options.today ? new Date(`${String(options.today).slice(0, 10)}T00:00:00Z`) : todayDate());
    const departments = selectedDepartments(st, options);
    const grandTotals = { availableTotal:0, plannedTotal:0, overTekortTotal:0, weeks:{} };
    const selected = departments.map(dept => {
      const projects = projectRows(st).map(project => {
        const weekValues = {};
        weeks.forEach(w => {
          const value = projectWeekHours(st, project.id, dept.name, w);
          if(value > 0) weekValues[w.key] = value;
        });
        const plannedTotal = round(Object.values(weekValues).reduce((a, b) => a + Number(b || 0), 0));
        if(plannedTotal <= 0) return null;
        const availableTotal = projectDeptBudget(st, project.id, dept.name);
        return {
          id:project.id,
          name:project.name || project.nr || project.code || project.id,
          opdrachtgever:project.client || project.opdrachtgever || "",
          projectnummer:project.nr || project.code || "",
          availableTotal,
          plannedTotal,
          overTekortTotal:round(availableTotal - plannedTotal),
          weeks:weekValues
        };
      }).filter(Boolean);
      const totals = { availableTotal:0, plannedTotal:0, overTekortTotal:0, weeks:{} };
      weeks.forEach(w => {
        const available = availableByDeptWeek(st, dept.name, w);
        const planned = round(projects.reduce((sum, p) => sum + Number(p.weeks[w.key] || 0), 0));
        totals.weeks[w.key] = planned;
        totals.availableTotal += available;
        totals.plannedTotal += planned;
        grandTotals.weeks[w.key] = round(Number(grandTotals.weeks[w.key] || 0) + planned);
        grandTotals.availableTotal += available;
        grandTotals.plannedTotal += planned;
      });
      totals.availableTotal = round(totals.availableTotal);
      totals.plannedTotal = round(totals.plannedTotal);
      totals.overTekortTotal = round(totals.availableTotal - totals.plannedTotal);
      return { id:dept.id, name:dept.name, color:departmentColor(dept.name), icon:"", projects, totals };
    }).filter(d => d.projects.length || options.includeEmptyDepartments);
    grandTotals.availableTotal = round(grandTotals.availableTotal);
    grandTotals.plannedTotal = round(grandTotals.plannedTotal);
    grandTotals.overTekortTotal = round(grandTotals.availableTotal - grandTotals.plannedTotal);
    return {
      generatedAt:new Date().toISOString(),
      period:{ startDate:weeks[0]?.startDate || "", endDate:weeks[weeks.length - 1]?.endDate || "", weeks },
      selectedDepartments:selected,
      grandTotals
    };
  }

  function metricClass(value){
    const n = Number(value || 0);
    if(n > 0) return "pos";
    if(n < 0) return "neg";
    return "";
  }
  function departmentLabel(model){
    const names = model.selectedDepartments.map(d => d.name);
    if(!names.length) return "Geen geselecteerde afdelingen";
    return names.length === 1 ? names[0] : "Alle geselecteerde afdelingen";
  }
  function cell(value, cls = ""){
    return `<td class="${cls}">${esc(num(value))}</td>`;
  }
  function weekCells(weeks, values, color){
    return weeks.map(w => {
      const v = Number(values?.[w.key] || 0);
      const style = v > 0 ? ` style="background:${color};"` : "";
      return `<td class="week-cell"${style}>${esc(num(v))}</td>`;
    }).join("");
  }
  function calendarHead(weeks){
    return `<thead>
      <tr class="month-row"><th rowspan="3">AFDELING</th><th rowspan="3">PROJECTEN</th><th rowspan="3">Beschikbaar<br>(u)</th><th rowspan="3">Gepland<br>(u)</th><th rowspan="3">Over / Tekort<br>(u)</th>${monthGroups(weeks).map(g => `<th colspan="${g.span}">${esc(g.label)}</th>`).join("")}</tr>
      <tr class="week-row">${weeks.map(w => `<th>${pad(w.isoWeek)}</th>`).join("")}</tr>
      <tr class="date-row">${weeks.map(w => `<th>${esc(w.mondayDate.slice(8, 10) + "/" + w.mondayDate.slice(5, 7))}</th>`).join("")}</tr>
    </thead>`;
  }
  function mainColgroup(weeks){
    return `<colgroup><col class="dept-col"><col class="project-col"><col class="metric-col"><col class="metric-col"><col class="metric-col">${weeks.map(() => `<col class="week-col">`).join("")}</colgroup>`;
  }
  function summaryColgroup(weeks){
    return `<colgroup><col class="summary-label-col"><col class="metric-col"><col class="metric-col"><col class="metric-col">${weeks.map(() => `<col class="week-col">`).join("")}</colgroup>`;
  }
  function renderMainTable(model){
    const weeks = model.period.weeks;
    const body = [];
    model.selectedDepartments.forEach(dept => {
      const span = Math.max(1, dept.projects.length) + 1;
      dept.projects.forEach((project, index) => {
        body.push(`<tr>
          ${index === 0 ? `<td class="dept-cell" rowspan="${span}"><div class="dept-name">${esc(dept.name)}</div></td>` : ""}
          <td class="project-cell"><strong>${esc(project.name)}</strong>${project.projectnummer || project.opdrachtgever ? `<small>${esc([project.projectnummer, project.opdrachtgever].filter(Boolean).join(" | "))}</small>` : ""}</td>
          ${cell(project.availableTotal, "metric")}
          ${cell(project.plannedTotal, "metric")}
          ${cell(project.overTekortTotal, `metric ${metricClass(project.overTekortTotal)}`)}
          ${weekCells(weeks, project.weeks, dept.color)}
        </tr>`);
      });
      body.push(`<tr class="total-row">
        ${dept.projects.length ? "" : `<td class="dept-cell"><div class="dept-name">${esc(dept.name)}</div></td>`}
        <td>TOTAAL ${esc(dept.name.toUpperCase())} (u)</td>
        ${cell(dept.totals.availableTotal, "metric")}
        ${cell(dept.totals.plannedTotal, "metric")}
        ${cell(dept.totals.overTekortTotal, `metric ${metricClass(dept.totals.overTekortTotal)}`)}
        ${weekCells(weeks, dept.totals.weeks, dept.color)}
      </tr>`);
    });
    if(!body.length){
      body.push(`<tr><td colspan="${5 + weeks.length}" class="empty">Geen projecturen gevonden voor de geselecteerde afdelingen in deze periode.</td></tr>`);
    }
    return `<table class="capacity-table main-table">${mainColgroup(weeks)}${calendarHead(weeks)}<tbody>${body.join("")}</tbody></table>`;
  }
  function renderSummaryTable(model){
    const weeks = model.period.weeks;
    const rows = model.selectedDepartments.map(dept => `<tr>
      <td class="summary-label">${esc(dept.name.toUpperCase())} TOTAAL (u)</td>
      ${cell(dept.totals.availableTotal, "metric")}
      ${cell(dept.totals.plannedTotal, "metric")}
      ${cell(dept.totals.overTekortTotal, `metric ${metricClass(dept.totals.overTekortTotal)}`)}
      ${weekCells(weeks, dept.totals.weeks, dept.color)}
    </tr>`);
    rows.push(`<tr class="grand-row">
      <td class="summary-label">TOTAAL (u)</td>
      ${cell(model.grandTotals.availableTotal, "metric")}
      ${cell(model.grandTotals.plannedTotal, "metric")}
      ${cell(model.grandTotals.overTekortTotal, `metric ${metricClass(model.grandTotals.overTekortTotal)}`)}
      ${weekCells(weeks, model.grandTotals.weeks, "#eef2f7")}
    </tr>`);
    return `<section class="summary"><h2>OVERZICHT PER AFDELING</h2><table class="capacity-table summary-table">
      ${summaryColgroup(weeks)}
      <thead>
        <tr class="month-row"><th rowspan="3">AFDELING</th><th rowspan="3">Beschikbaar<br>(u)</th><th rowspan="3">Gepland<br>(u)</th><th rowspan="3">Over / Tekort<br>(u)</th>${monthGroups(weeks).map(g => `<th colspan="${g.span}">${esc(g.label)}</th>`).join("")}</tr>
        <tr class="week-row">${weeks.map(w => `<th>${pad(w.isoWeek)}</th>`).join("")}</tr>
        <tr class="date-row">${weeks.map(w => `<th>${esc(w.mondayDate.slice(8, 10) + "/" + w.mondayDate.slice(5, 7))}</th>`).join("")}</tr>
      </thead>
      <tbody>${rows.join("")}</tbody>
    </table></section>`;
  }
  function formatDate(date = new Date()){
    return new Intl.DateTimeFormat("nl-NL", { day:"2-digit", month:"2-digit", year:"numeric" }).format(date);
  }
  function renderHtml(model){
    const first = model.period.weeks[0];
    const last = model.period.weeks[model.period.weeks.length - 1];
    const period = `Week ${pad(first?.isoWeek)}-${first?.isoYear} t/m Week ${pad(last?.isoWeek)}-${last?.isoYear}`;
    return `<!doctype html><html lang="nl" data-cws-print-kind="capacity-overview" data-cws-print-marker="${MARKER}"><head><meta charset="utf-8"><title>CAPACITEITSOVERZICHT</title>
    <style>
      @page{size:A3 landscape;margin:7mm}
      *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
      body{margin:0;background:#fff;color:#050505;font-family:Arial,Helvetica,sans-serif;font-size:9px}
      .page{width:1650px;border:1.2pt solid #050505;min-height:1167px;padding:9px;margin:0 auto;overflow:hidden}
      .top{display:grid;grid-template-columns:390px 1fr 505px;gap:14px;align-items:start;margin-bottom:12px}
      .logo-box{height:125px;display:flex;align-items:flex-start}.logo-box img{width:380px;max-height:125px;object-fit:contain}
      .title{text-align:center;padding-top:22px}.title h1{font-size:42px;line-height:1;margin:0 0 14px;font-weight:900;letter-spacing:0}.title div{font-size:22px;font-weight:800}
      .meta{width:100%;border-collapse:collapse;font-size:10px}.meta td{border:0.6pt solid #777;padding:3px 8px;height:18px}.meta td:first-child{font-weight:800;width:48%}.meta .page-no{text-align:center;font-weight:800}
      .capacity-table{width:100%;border-collapse:collapse;table-layout:fixed}.capacity-table th,.capacity-table td{border:0.45pt solid #9ca3af;text-align:center;vertical-align:middle;padding:4px 4px;height:49px;overflow:hidden}
      .capacity-table th{background:#00566a;color:#fff;font-weight:900}.month-row th{height:22px}.week-row th,.date-row th{background:#f8fafc;color:#111;font-size:7px;height:20px}
      .dept-col{width:90px}.project-col{width:190px}.metric-col{width:72px}.week-col{width:37px}.summary-label-col{width:280px}
      .dept-cell{font-weight:900;text-transform:uppercase;background:#fff}.dept-name{display:flex;align-items:center;justify-content:center;min-height:72px}
      .project-cell{text-align:left!important;padding-left:9px!important;background:#fffdf3}.project-cell strong{display:block;font-size:9px}.project-cell small{display:block;color:#4b5563;font-size:6.5px;margin-top:2px}
      .metric{font-weight:800}.pos{color:#087a24}.neg{color:#d10000}.week-cell{color:#050505;font-weight:800}.total-row td{font-weight:900;background:#f7f7f7}.empty{text-align:left!important;padding:12px!important}
      .summary{margin-top:12px;break-inside:avoid}.summary h2{margin:0;background:#00566a;color:#fff;font-size:13px;padding:7px 10px;border:0.45pt solid #00566a}
      .summary-table th:first-child,.summary-table td:first-child{text-align:left}
      .summary-label{font-weight:900}.grand-row td{font-weight:900;background:#f3f4f6}
      thead{display:table-header-group}tr{page-break-inside:avoid;break-inside:avoid}
    </style></head><body data-cws-print-kind="capacity-overview" data-cws-print-marker="${MARKER}"><div class="page">
      <header class="top">
        <div class="logo-box"><img src="${LOGO_SRC}" alt="Tasche Staalbouw"></div>
        <div class="title"><h1>CAPACITEITSOVERZICHT</h1><div>Tasche Staalbouw</div></div>
        <table class="meta"><tr><td>Projectgroep / Afdeling</td><td>${esc(departmentLabel(model))}</td></tr><tr><td>Periode</td><td>${esc(period)}</td></tr><tr><td>Auteur</td><td>${esc(window.CWS?.getCurrentUser?.()?.name || "Tasche Staalbouw")}</td></tr><tr><td>Plotdatum</td><td>${esc(formatDate())}</td></tr><tr><td>Revisie</td><td>A</td></tr><tr><td>Pagina</td><td class="page-no">1 van 1</td></tr></table>
      </header>
      ${renderMainTable(model)}
      ${renderSummaryTable(model)}
    </div></body></html>`;
  }
  function removeStalePrintFrames(){
    [document, window.parent && window.parent !== window ? window.parent.document : null].forEach(doc => {
      try {
        doc?.getElementById?.(STALE_BWS_FRAME_ID)?.remove();
      } catch (_error) {}
    });
  }
  function parsePrintHtml(printHtml){
    const parsed = new DOMParser().parseFromString(printHtml, "text/html");
    return {
      title: parsed.querySelector("title")?.textContent || "CAPACITEITSOVERZICHT",
      style: parsed.querySelector("style")?.textContent || "",
      body: parsed.body?.innerHTML || ""
    };
  }
  function installCurrentDocumentPrintRoot(printHtml){
    const parsed = parsePrintHtml(printHtml);
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(ROOT_ID)?.remove();
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `${parsed.style}
      @media screen{#${ROOT_ID}{display:none!important}}
      @media print{
        body > :not(#${ROOT_ID}){display:none!important}
        #${ROOT_ID}{display:block!important}
        html,body{margin:0!important;padding:0!important;background:#fff!important}
      }`;
    document.head.appendChild(style);
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.dataset.cwsPrintKind = "capacity-overview";
    root.dataset.cwsPrintMarker = MARKER;
    root.innerHTML = parsed.body;
    document.body.appendChild(root);
    return parsed;
  }
  function prepareCurrentDocumentPrint(options = {}){
    const model = buildPrintModel(options);
    const printHtml = renderHtml(model);
    if(options.returnHtml) return printHtml;
    if(options.returnModel) return model;
    removeStalePrintFrames();
    const parsed = installCurrentDocumentPrintRoot(printHtml);
    const oldTitle = document.title;
    let oldParentTitle = null;
    try { oldParentTitle = window.parent && window.parent !== window ? window.parent.document.title : null; } catch (_error) {}
    document.title = parsed.title || "CAPACITEITSOVERZICHT";
    try { if(window.parent && window.parent.document) window.parent.document.title = document.title; } catch (_error) {}
    window.__CWS_CAPACITY_PRINT_LAST_HTML__ = printHtml;
    window.__CWS_CAPACITY_PRINT_LAST_MODEL__ = model;
    const restore = () => {
      window.removeEventListener("afterprint", restore);
      document.getElementById(ROOT_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
      document.title = oldTitle;
      try { if(oldParentTitle != null && window.parent?.document) window.parent.document.title = oldParentTitle; } catch (_error) {}
    };
    window.addEventListener("afterprint", restore);
    setTimeout(() => {
      if(document.getElementById(ROOT_ID)) restore();
    }, 300000);
    return model;
  }
  function printCurrentDocument(options = {}){
    const model = buildPrintModel(options);
    const printHtml = renderHtml(model);
    if(options.returnHtml) return printHtml;
    if(options.returnModel) return model;
    removeStalePrintFrames();
    window.__CWS_CAPACITY_PRINT_LAST_HTML__ = printHtml;
    window.__CWS_CAPACITY_PRINT_LAST_MODEL__ = model;
    const key = `${PRINT_STORAGE_PREFIX}${Date.now()}`;
    try {
      window.localStorage.setItem(key, printHtml);
    } catch (_error) {
      throw new Error("Capaciteitsoverzicht kon niet worden voorbereid voor afdrukken.");
    }
    let printWindow = null;
    try {
      const opener = window.top && window.top.open ? window.top : window;
      const printUrl = `${window.location.origin}/layers/capacity_print_view.html?key=${encodeURIComponent(key)}&v=157`;
      printWindow = opener.open(printUrl, PRINT_WINDOW_NAME);
    } catch (_error) {}
    if(!printWindow) {
      try { window.localStorage.removeItem(key); } catch (_error) {}
      const message = "Pop-up geblokkeerd: capaciteitsoverzicht kon niet worden geopend.";
      if(window.UI?.toast) window.UI.toast(message);
      else alert(message);
      return model;
    }
    return model;
  }
  function print(options = {}){
    return printCurrentDocument(options);
  }

  window.addEventListener("beforeprint", () => {
    if(!document.getElementById(ROOT_ID)) {
      try { prepareCurrentDocumentPrint({ selectedDept:document.querySelector("#deptSel")?.value || "" }); } catch (_error) {}
    }
  });

  window.CWS_CapacityPrintTascheA3 = { print, printCurrentDocument, prepareCurrentDocumentPrint, buildPrintModel, renderHtml, colors:DEPARTMENT_COLORS, marker:MARKER, printWindowName:PRINT_WINDOW_NAME, rootId:ROOT_ID, mockToday:null };
  window.CWS = window.CWS || {};
  window.CWS.capacityPrint = window.CWS.capacityPrint || {};
  window.CWS.capacityPrint.printTascheA3 = print;
  window.CWS.capacityPrint.printTascheA3CurrentDocument = printCurrentDocument;
  window.CWS.capacityPrint.prepareTascheA3CurrentDocument = prepareCurrentDocumentPrint;
})();
