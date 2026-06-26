/* CWS Planning - definitive BWS A3 print renderer (V145), fed by the screen Gantt print source. */
(function(){
  "use strict";

  const MARKER = "CWS_BWS_A3_PRINT_FINAL_V145_SSOT";
  const SCRIPT_ID = "cwsBwsA3PrintFinalScript";
  const SCRIPT_SRC = "/js/core/gantt_print_bws_a3_final.js?v=145";
  if (window.__CWS_BWS_A3_PRINT_FINAL__ === MARKER) return;
  window.__CWS_BWS_A3_PRINT_FINAL__ = MARKER;

  const MONTHS = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];
  const LEGEND = [
    ["BWS Bouw","#0b71bd"],["Dak- en wandmontage","#00d169"],["Staalbouwer","#302e6e"],
    ["Buitenkozijnen","#8b35c9"],["Installateur W","#168fb0"],["Dakdekker","#f28c00"],
    ["Grondwerk/infra","#b57a28"],["Betonvloer","#ce2525"],["Uithardingstijd","#ffffff"],
    ["Trapleverancier","#9e2a2a"],["OH-deuren","#00b050"],["Dekvloeren","#ffff00"]
  ];
  const FALLBACK_COLORS = ["#0b71bd","#00d169","#302e6e","#8b35c9","#168fb0","#f28c00","#ce2525","#00b050","#ffff00","#9e2a2a","#b57a28"];

  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[ch]));
  const pad = value => String(value).padStart(2,"0");
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function parseDate(value){
    if (value instanceof Date && Number.isFinite(value.getTime())) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    if (!value) return null;
    const raw = String(value).trim().slice(0,10);
    let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (match) return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
    return null;
  }
  function iso(value){
    const d = parseDate(value);
    return d ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}` : "";
  }
  function nl(value){
    const d = parseDate(value);
    return d ? `${pad(d.getUTCDate())}-${pad(d.getUTCMonth()+1)}-${d.getUTCFullYear()}` : "-";
  }
  function addDays(value, amount){
    const d = parseDate(value) || new Date();
    d.setUTCDate(d.getUTCDate() + Number(amount || 0));
    return iso(d);
  }
  function daysBetween(start, end){
    const a = parseDate(start), b = parseDate(end);
    return a && b ? Math.round((b - a) / 86400000) : 0;
  }
  function startOfWeek(value){
    const d = parseDate(value) || new Date();
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - day + 1);
    return iso(d);
  }
  function endOfWeek(value){ return addDays(startOfWeek(value), 6); }
  function isoWeek(value){
    const d = parseDate(value) || new Date();
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = x.getUTCDay() || 7;
    x.setUTCDate(x.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
    return { year:x.getUTCFullYear(), week:Math.ceil((((x - yearStart) / 86400000) + 1) / 7) };
  }
  function deepClone(value){
    try { return JSON.parse(JSON.stringify(value ?? null)); } catch (_error) { return value; }
  }
  function getCws(){
    try { return window.CWS || (window.parent && window.parent !== window ? window.parent.CWS : null); } catch (_error) { return window.CWS || null; }
  }
  function getPrintSource(){
    return window.CWS_GANTT_PRINT_SOURCE || null;
  }
  function isSummary(row){
    const type = String(row?.type || row?.kind || "").toLowerCase();
    return type === "summary" || type === "phase" || type === "fase" || row?.summary === true;
  }
  function isNonWork(data, day){
    const d = parseDate(day);
    if (!d) return false;
    const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    if (wd >= 6) return true;
    const cal = data?.calendar || {};
    if (cal.workweek && cal.workweek[wd] === false) return true;
    if (cal.overrides && typeof cal.overrides[day] === "boolean") return cal.overrides[day];
    return false;
  }
  function colorFor(row, index){
    const direct = row?.color && /^#[0-9a-f]{3,8}$/i.test(String(row.color)) ? row.color : "";
    if (direct) return direct;
    const label = String(row?.resource || row?.bouwkundig || row?.department || "").toLowerCase();
    const hit = LEGEND.find(([name]) => label.includes(name.toLowerCase()));
    return hit ? hit[1] : FALLBACK_COLORS[index % FALLBACK_COLORS.length];
  }
  function discipline(row){
    return row?.bouwkundig || row?.discipline || row?.department || row?.dept || row?.afdeling || row?.resource || row?.resourceId || "-";
  }
  function projectTitle(project){
    return project?.name || project?.title || project?.omschrijving || project?.description || "Project";
  }
  function projectNo(project){
    return project?.nr || project?.code || project?.number || project?.projectnummer || project?.id || "-";
  }
  function projectClient(project){
    return project?.client || project?.customer || project?.opdrachtgever || project?.klant || "-";
  }
  function safeFilePart(value){
    return String(value || "").normalize("NFKD").replace(/[\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "planning";
  }
  function printFileName(data){
    const now = new Date();
    const date = `${pad(now.getDate())}-${pad(now.getMonth()+1)}-${now.getFullYear()}`;
    return [projectTitle(data.project), projectClient(data.project), date].map(safeFilePart).join("-");
  }
  function companyLogo(data){
    return data?.company?.logo?.dataUrl || data?.project?.logo || getCws()?.getCompanyLogo?.() || "";
  }
  function dateRange(start, end){
    const days = [];
    for (let cursor = start, guard = 0; daysBetween(cursor, end) >= 0 && guard < 190; cursor = addDays(cursor, 1), guard++) days.push(cursor);
    return days;
  }
  function normalizeRange(data, rows){
    const dates = [];
    rows.forEach(row => {
      if (row.start) dates.push(row.start);
      if (row.end) dates.push(row.end);
    });
    let start = dates.length ? dates.slice().sort()[0] : (iso(data?.range?.start) || iso(data?.project?.startDate || data?.project?.start || new Date()));
    let end = dates.length ? dates.slice().sort().at(-1) : (iso(data?.range?.end) || addDays(start, 28));
    start = startOfWeek(addDays(start, -7));
    end = endOfWeek(addDays(end, 7));
    return { start, end, days:dateRange(start, end) };
  }
  function fallbackSchedule(seedStart, row, index){
    const duration = Math.max(1, Math.min(14, Number(row?.duration || row?.workdays || 5) || 5));
    const offset = Math.max(0, Math.floor(index * 2.4));
    const start = addDays(seedStart, offset);
    return { start, end:addDays(start, duration - 1), fallback:true };
  }
  function cleanRows(sourceData){
    const rawRows = Array.isArray(sourceData?.rows) ? sourceData.rows : [];
    return rawRows.map((row, index) => {
      const schedule = sourceData?.schedules?.[row?.id] || {};
      let start = iso(row?.start || schedule.start);
      let end = iso(row?.end || schedule.end);
      if (start && end && daysBetween(start, end) < 0) {
        const swap = start;
        start = end;
        end = swap;
      }
      return {
        ...deepClone(row),
        no:Number(row?.no || index + 1),
        name:row?.name || row?.title || row?.id || "",
        type:isSummary(row) ? "summary" : "task",
        level:Number(row?.level || 0),
        start,
        end,
        color:row?.color || colorFor(row, index),
        resource:row?.resource || row?.resourceLabel || row?.resourceName || row?.resourceId || "-",
        durationText:row?.durationText || (row?.duration || row?.workdays ? `${Number(row.duration || row.workdays)} d` : "-"),
        labels:row?.labels && typeof row.labels === "object" ? row.labels : {},
        fallback:false,
        invalid:Boolean((start && !end) || (!start && end))
      };
    });
  }
  function validateAndPrepare(sourceData){
    const warnings = [];
    const errors = [];
    const rows = cleanRows(sourceData);
    if (!rows.length) errors.push("Geen Gantt-regels beschikbaar voor print.");

    let normal = rows.filter(row => !isSummary(row));
    let missing = 0;
    let invalid = 0;
    normal.forEach(row => {
      if (!row.start || !row.end) missing++;
      else if (daysBetween(row.start, row.end) < 0) invalid++;
    });

    if (missing > 0) warnings.push("Let op: niet alle taakdatums zijn beschikbaar voor print.");
    if (normal.length && missing / normal.length > 0.30) warnings.push("Let op: meer dan 30% van de taakdatums ontbreekt; ontbrekende taken zijn trapsgewijs gemarkeerd.");
    if (invalid > 0) warnings.push("Let op: enkele taakdatums zijn ongeldig en worden niet als volle-breedte balk getekend.");

    const seed = startOfWeek(iso(sourceData?.project?.startDate || sourceData?.project?.start || new Date()));
    rows.forEach((row, index) => {
      if (isSummary(row)) return;
      if (row.start && row.end && daysBetween(row.start, row.end) >= 0) return;
      const fallback = fallbackSchedule(seed, row, index);
      row.start = fallback.start;
      row.end = fallback.end;
      row.fallback = true;
    });

    for (let index = rows.length - 1; index >= 0; index--) {
      const row = rows[index];
      if (!isSummary(row)) continue;
      const children = [];
      for (let i = index + 1; i < rows.length && Number(rows[i].level || 0) > Number(row.level || 0); i++) {
        if (rows[i].start && rows[i].end) children.push(rows[i]);
      }
      if (children.length) {
        row.start = children.map(item => item.start).sort()[0];
        row.end = children.map(item => item.end).sort().at(-1);
      }
    }

    const range = normalizeRange(sourceData, rows);
    normal = rows.filter(row => !isSummary(row));
    const starts = new Set(normal.map(row => row.start).filter(Boolean));
    const broadTasks = normal.filter(row => {
      if (!row.start || !row.end) return false;
      const width = daysBetween(row.start, row.end) + 1;
      return width >= Math.max(21, range.days.length * 0.75);
    });
    if (normal.length >= 3 && starts.size <= 1) warnings.push("Let op: alle normale taken hebben dezelfde startdatum; controleer de Gantt-brondata.");
    if (normal.length && broadTasks.length / normal.length > 0.30) {
      warnings.push("Let op: meerdere taakbalken lijken projectbreed. Deze print gebruikt geen automatische volle-breedte correctie.");
      broadTasks.forEach((row, i) => {
        if (isSummary(row)) return;
        const replacement = fallbackSchedule(range.start, row, i + 1);
        row.start = replacement.start;
        row.end = replacement.end;
        row.fallback = true;
      });
    }

    const printableBars = rows.filter(row => row.start && row.end && daysBetween(row.start, row.end) >= 0);
    if (!printableBars.length) errors.push("Geen geplande taakbalken beschikbaar voor print.");

    return { ...sourceData, rows, range:normalizeRange(sourceData, rows), warnings, errors };
  }
  function readModel(){
    const source = getPrintSource();
    if (!source?.getBwsPrintModel) {
      return validateAndPrepare({
        project:{ name:"Project" },
        rows:[],
        schedules:{},
        calendar:{},
        meta:{ marker:"missing-print-source" }
      });
    }
    return validateAndPrepare(source.getBwsPrintModel());
  }
  function text(x,y,value,size=2,weight=700,anchor="middle",extra=""){
    return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" dominant-baseline="middle" font-family="Arial,Helvetica,sans-serif" ${extra}>${esc(value)}</text>`;
  }
  function rect(x,y,w,h,fill="#fff",stroke="#000",sw=.18,extra=""){
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
  }
  function line(x1,y1,x2,y2,sw=.16,stroke="#000",extra=""){
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
  }
  function path(d, sw=.2, stroke="#334155", extra=""){
    return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
  }
  function segments(days, kind){
    const keyFor = day => {
      const d = parseDate(day);
      if (kind === "year") return String(d.getUTCFullYear());
      if (kind === "month") return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}`;
      if (kind === "week") {
        const w = isoWeek(day);
        return `${w.year}-W${pad(w.week)}`;
      }
      return day;
    };
    const labelFor = key => {
      if (kind === "year") return key;
      if (kind === "month") return MONTHS[Number(key.split("-")[1]) - 1] || key;
      if (kind === "week") return String(Number((key.match(/W(\d+)$/) || [])[1] || 0));
      return pad(parseDate(key).getUTCDate());
    };
    const out = [];
    days.forEach(day => {
      const key = keyFor(day);
      const last = out.at(-1);
      if (last && last.key === key) last.count++;
      else out.push({ key, count:1, label:labelFor(key) });
    });
    return out;
  }
  function calendarSvg(data, x, y, width, top){
    // kalender boven / kalender onder
    const order = top ? ["year","month","date","week"] : ["date","week","month","year"];
    const heights = top ? [4.4,5,4.8,4.8] : [4.8,4.8,5,4.4];
    const dayWidth = width / Math.max(1, data.range.days.length);
    let out = "", cursorY = y;
    order.forEach((kind, rowIndex) => {
      const h = heights[rowIndex];
      if (kind === "date") {
        data.range.days.forEach((day, index) => {
          const xx = x + index * dayWidth;
          out += rect(xx, cursorY, dayWidth, h, isNonWork(data, day) ? "#d9d9d9" : "#fff", "#333", .08, `data-calendar-date="${esc(day)}"`);
          out += text(xx + dayWidth / 2, cursorY + h / 2, pad(parseDate(day).getUTCDate()), 1.12, 800);
        });
      } else {
        let xx = x;
        segments(data.range.days, kind).forEach(segment => {
          const w = segment.count * dayWidth;
          out += rect(xx, cursorY, w, h, "#fff", "#111", .13);
          out += text(xx + w / 2, cursorY + h / 2, segment.label, kind === "week" ? 1.22 : 1.52, 900);
          xx += w;
        });
      }
      cursorY += h;
    });
    return out;
  }
  function headerSvg(data, W, margin, headerH){
    const project = data.project || {};
    const metaX = W - margin - 86;
    let out = rect(margin, margin, W - 2 * margin, headerH, "#fff", "#000", .35);
    out += rect(margin, margin, 80, headerH, "#fff", "#000", .25);
    const logo = companyLogo(data);
    if (logo) out += `<image href="${esc(logo)}" x="${margin + 6}" y="${margin + 4}" width="66" height="14" preserveAspectRatio="xMidYMid meet"/>`;
    else {
      out += rect(margin + 6, margin + 4, 66, 14, "#ffd92f", "none", 0);
      out += text(margin + 39, margin + 10, "TASCHE", 5.3, 900);
      out += text(margin + 39, margin + 15, "STAALBOUW", 2.25, 800);
    }
    out += text(W / 2, margin + 8, projectTitle(project), 3.15, 900);
    out += text(W / 2, margin + 13, `Opdrachtg.: ${projectClient(project)}`, 2.25, 900);
    out += text(W / 2, margin + 17, `Bouwplanning - bereik ${nl(data.range.start)} t/m ${nl(data.range.end)}`, 1.55, 700);

    const rev = data.meta?.revision || {};
    [
      ["Project nr.:", projectNo(project)],
      ["Opdrachtgever:", projectClient(project)],
      ["Omschrijving:", project.omschrijving || project.description || projectTitle(project)],
      ["Projectleider:", project.projectleider || project.projectLead || data.user?.name || "-"],
      ["Plotdatum:", new Date().toLocaleDateString("nl-NL")],
      ["Revisienr.:", rev.revNo || project.revision || "-"],
      ["Revisiedatum:", rev.revisionDate ? nl(rev.revisionDate) : (project.revisionDate ? nl(project.revisionDate) : "-")]
    ].forEach((item, index) => {
      const rowH = headerH / 7;
      const y = margin + index * rowH;
      out += rect(metaX, y, 30, rowH, "#fff", "#000", .16);
      out += rect(metaX + 30, y, 56, rowH, "#fff", "#000", .16);
      out += text(metaX + 1.4, y + rowH / 2, item[0], 1.15, 900, "start");
      out += text(metaX + 32, y + rowH / 2, item[1], 1.15, 700, "start");
    });
    return out;
  }
  function renderSvg(data){
    const W = 408, H = 285, M = 3.2;
    const headerH = 23, legendH = 15;
    const boardY = M + headerH;
    const boardW = W - 2 * M;
    const leftW = 136;
    const chartX = M + leftW;
    const chartW = boardW - leftW;
    const topCalH = 19;
    const bottomCalH = 19;
    const legendY = H - M - legendH;
    const bottomCalY = legendY - bottomCalH;
    const bodyY = boardY + topCalH;
    const visibleRows = Math.max(42, data.rows.length);
    const bodyH = bottomCalY - bodyY;
    const rowH = bodyH / visibleRows;
    const dayWidth = chartW / Math.max(1, data.range.days.length);
    const bodyBottom = bodyY + bodyH;
    let out = `<svg xmlns="http://www.w3.org/2000/svg" width="408mm" height="285mm" viewBox="0 0 408 285" shape-rendering="crispEdges" data-bws-marker="${MARKER}"><defs><marker id="bwsDepArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="3.4" markerHeight="3.4" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#334155"/></marker></defs>`;
    out += rect(M, M, W - 2 * M, H - 2 * M, "#fff", "#000", .55);
    out += headerSvg(data, W, M, headerH);

    if (data.warnings.length || data.errors.length) {
      const msg = [...data.errors, ...data.warnings].join(" ");
      out += rect(M + 82, M + 18.1, 236, 3.7, "#fff7ed", "#9a3412", .18);
      out += text(M + 83.5, M + 20, msg.slice(0, 220), 1.18, 800, "start");
    }

    out += rect(M, boardY, boardW, legendY - boardY, "#fff", "#000", .35);
    out += rect(M, boardY, leftW, topCalH, "#fff", "#000", .25);
    out += rect(M, boardY, 10, topCalH, "#fff", "#000", .18);
    out += rect(M + 10, boardY, 44, topCalH, "#fff", "#000", .18);
    out += rect(M + 54, boardY, 26, topCalH, "#fff", "#000", .18);
    out += rect(M + 80, boardY, 42, topCalH, "#fff", "#000", .18);
    out += rect(M + 122, boardY, 14, topCalH, "#fff", "#000", .18);
    out += text(M + 5, boardY + topCalH - 2.2, "Regel", 1.35, 900);
    out += text(M + 32, boardY + topCalH - 2.2, "Naam", 1.35, 900);
    out += text(M + 67, boardY + topCalH - 2.2, "Bouwkundig", 1.28, 900);
    out += text(M + 101, boardY + topCalH - 2.2, "Resource", 1.28, 900);
    out += text(M + 129, boardY + topCalH - 2.2, "Dagen", 1.2, 900);
    out += calendarSvg(data, chartX, boardY, chartW, true);

    for (let index = 0; index < visibleRows; index++) {
      const row = data.rows[index];
      const phase = row && isSummary(row);
      const y = bodyY + index * rowH;
      const fill = phase ? "#63cfc9" : (index % 2 ? "#eeeeee" : "#fff");
      out += rect(M, y, 10, rowH, fill, "#000", .13);
      out += rect(M + 10, y, 44, rowH, fill, "#000", .13);
      out += rect(M + 54, y, 26, rowH, fill, "#000", .13);
      out += rect(M + 80, y, 42, rowH, fill, "#000", .13);
      out += rect(M + 122, y, 14, rowH, fill, "#000", .13);
      if (row) {
        out += text(M + 5, y + rowH / 2, row.no, 1.35, 900);
        out += text(M + 12 + clamp(Number(row.level || 0) * 1.8, 0, 7), y + rowH / 2, row.name, 1.18, phase ? 900 : 700, "start");
        out += text(M + 56, y + rowH / 2, discipline(row), 1.08, phase ? 900 : 700, "start");
        out += text(M + 82, y + rowH / 2, row.resource || "-", 1.08, phase ? 900 : 700, "start");
        out += text(M + 129, y + rowH / 2, row.durationText || "-", 1.05, phase ? 900 : 700);
      }
    }

    // weekendvlakken
    data.range.days.forEach((day, index) => {
      const x = chartX + index * dayWidth;
      if (isNonWork(data, day)) out += rect(x, bodyY, dayWidth, bodyH, "#d9d9d9", "none", 0, `data-weekendvlak="${esc(day)}"`);
    });
    for (let index = 0; index <= visibleRows; index++) out += line(chartX, bodyY + index * rowH, chartX + chartW, bodyY + index * rowH, .09, "#777");
    data.range.days.forEach((day, index) => {
      const x = chartX + index * dayWidth;
      const d = parseDate(day);
      const month = d && d.getUTCDate() === 1;
      const week = d && d.getUTCDay() === 1;
      const attr = month ? `data-maandlijnen="1"` : (week ? `data-weeklijnen="1"` : `stroke-dasharray="1 1" data-daglijnen="1"`);
      out += line(x, bodyY, x, bodyBottom, month ? .45 : (week ? .28 : .08), month || week ? "#000" : "#777", attr);
    });
    out += line(chartX + chartW, bodyY, chartX + chartW, bodyBottom, .35, "#000");
    const todayIso = iso(new Date());
    if (todayIso && daysBetween(data.range.start, todayIso) >= 0 && daysBetween(todayIso, data.range.end) >= 0) {
      const todayX = chartX + daysBetween(data.range.start, todayIso) * dayWidth;
      out += line(todayX, boardY, todayX, bodyBottom, .45, "#dc2626", `data-vandaaglijn="1"`);
      out += text(todayX + 1, boardY + 2.4, "Vandaag", 1.15, 900, "start", `fill="#dc2626"`);
    }

    // taakbalken
    const rowGeometry = new Map();
    data.rows.forEach((row, index) => {
      if (!row.start || !row.end || daysBetween(row.start, row.end) < 0) return;
      const startIndex = clamp(daysBetween(data.range.start, row.start), 0, data.range.days.length - 1);
      const endIndex = clamp(daysBetween(data.range.start, row.end), 0, data.range.days.length - 1);
      const x = chartX + startIndex * dayWidth;
      const width = Math.max(dayWidth, (endIndex - startIndex + 1) * dayWidth);
      const y = bodyY + index * rowH;
      rowGeometry.set(String(row.id), { x, y, width, centerY:y + rowH / 2, row });
      if (isSummary(row)) {
        out += line(x, y + rowH * .52, x + width, y + rowH * .52, .9, "#000", `data-summary-balk="1"`);
        const phaseLabel = row.labels?.inside || row.name;
        out += text(Math.min(x + width + 1, chartX + chartW - 1), y + rowH * .5, phaseLabel, 1.25, 900, x + width + 24 < chartX + chartW ? "start" : "end");
        return;
      }
      const barH = Math.min(3.7, Math.max(2.3, rowH * .62));
      const by = y + (rowH - barH) / 2;
      const before = String(row.labels?.before || "").trim();
      const inside = String(row.labels?.inside || row.name || "").trim();
      const after = String(row.labels?.after || "").trim();
      if (before && x - chartX > 7) out += text(Math.max(chartX + .6, x - 1.2), by + barH / 2, before.slice(0, 34), 1.05, 900, "end", `fill="#000" data-label-before="1"`);
      out += `<rect x="${x}" y="${by}" width="${width}" height="${barH}" rx="0.5" fill="${esc(colorFor(row, index))}" stroke="#000" stroke-width="0.32" data-taakbalken="1" data-row-id="${esc(row.id)}" data-start="${esc(row.start)}" data-end="${esc(row.end)}" data-fallback="${row.fallback ? "1" : "0"}"/>`;
      if (inside && width > 6) {
        const label = `${inside}${row.fallback ? " *" : ""}`;
        out += text(x + .8, by + barH / 2, label.slice(0, 42), 1.08, 900, "start", `fill="#fff" data-label-inside="1"`);
      }
      if (after && x + width < chartX + chartW - 7) out += text(x + width + 1.2, by + barH / 2, after.slice(0, 38), 1.05, 900, "start", `fill="#000" data-label-after="1"`);
    });
    if (data.meta?.showDeps && Array.isArray(data.dependencies) && data.dependencies.length) {
      data.dependencies.forEach(dep => {
        const from = rowGeometry.get(String(dep.from));
        const to = rowGeometry.get(String(dep.to));
        if (!from || !to) return;
        const startX = Math.min(chartX + chartW - 2, from.x + from.width + Math.max(.8, dayWidth * .14));
        const endX = Math.max(chartX + 2, to.x - Math.max(1, dayWidth * .24));
        const elbowX = Math.max(startX + 2, Math.min(endX - 1, startX + Math.max(4, (endX - startX) * .45)));
        const route = `M ${startX} ${from.centerY} H ${elbowX} V ${to.centerY} H ${endX}`;
        out += path(route, .7, "#fff", `data-afhankelijkheid-halo="1"`);
        out += path(route, .28, "#334155", `marker-end="url(#bwsDepArrow)" data-afhankelijkheden="1"`);
      });
    }

    out += rect(M, bottomCalY, leftW, bottomCalH, "#fff", "#000", .25);
    out += text(M + 3, bottomCalY + 6, "Regel", 1.35, 900, "start");
    out += text(M + 13, bottomCalY + 6, "Naam", 1.35, 900, "start");
    out += text(M + 25, bottomCalY + 6, "Bouwkundig", 1.35, 900, "start");
    out += text(M + 58, bottomCalY + 6, "Resource", 1.35, 900, "start");
    out += text(M + 94, bottomCalY + 6, "Dagen", 1.35, 900, "start");
    out += calendarSvg(data, chartX, bottomCalY, chartW, false);

    out += rect(M, legendY, boardW, legendH, "#fff", "#000", .35);
    out += text(M + 3, legendY + 7, "Legenda", 1.55, 900, "start");
    LEGEND.forEach(([label, color], index) => {
      const x = M + 32 + (index % 6) * 31;
      const y = legendY + 4 + Math.floor(index / 6) * 5;
      out += rect(x, y, 10, 2.4, color, "#000", .18);
      out += text(x + 12, y + 1.2, label, 1.2, 700, "start");
    });
    if (data.rows.some(row => row.fallback)) out += text(M + boardW - 2, legendY + 12.1, "* datum-fallback", 1.15, 800, "end");
    return `${out}</svg>`;
  }
  function buildHtml(data){
    return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<title>${esc(printFileName(data))}</title>
<style>
@page { size: A3 landscape; margin: 6mm; }
html, body {
  margin: 0;
  padding: 0;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
svg { display: block; width: 408mm; height: 285mm; }
@media screen {
  body { background: #666; padding: 8px; }
  svg { background: #fff; box-shadow: 0 8px 22px rgba(0,0,0,.35); }
}
</style>
</head>
<body data-bws-print-ready="${MARKER}" data-bws-print-source="${esc(data.meta?.marker || "")}">
${renderSvg(data)}
</body>
</html>`;
  }
  function printCurrentProject(){
    const data = readModel();
    const html = buildHtml(data);
    const filename = printFileName(data);
    window.__CWS_BWS_PRINT_LAST_HTML__ = html;
    window.__CWS_BWS_PRINT_LAST_MODEL__ = deepClone(data);
    window.__CWS_BWS_PRINT_LAST_FILENAME__ = filename;
    let iframe = document.getElementById("cwsBwsA3PrintFrame");
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = "cwsBwsA3PrintFrame";
      iframe.title = "BWS A3 afdruk";
      iframe.setAttribute("aria-hidden","true");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
      document.body.appendChild(iframe);
    }
    const frameWindow = iframe.contentWindow;
    const doc = iframe.contentDocument || frameWindow?.document;
    if (!frameWindow || !doc) return false;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      try {
        const oldTitle = document.title;
        const oldParentTitle = window.parent && window.parent !== window ? window.parent.document.title : null;
        document.title = filename;
        try { if (window.parent && window.parent.document) window.parent.document.title = filename; } catch (_error) {}
        frameWindow.focus();
        frameWindow.print();
        setTimeout(() => {
          document.title = oldTitle;
          try { if (oldParentTitle != null && window.parent?.document) window.parent.document.title = oldParentTitle; } catch (_error) {}
        }, 300000);
      } catch (error) {
        console.error("BWS A3 print mislukt", error);
      }
    }, 220);
    return true;
  }
  function isPrintButton(target){
    const el = target?.closest?.("#printBtn,[data-ctx-action='print'],[data-rev-action='print']");
    return Boolean(el && (el.id === "printBtn" || el.dataset?.ctxAction === "print" || el.dataset?.revAction === "print"));
  }
  function install(){
    if (document.__CWS_BWS_A3_PRINT_FINAL_BOUND__ === MARKER) return;
    document.__CWS_BWS_A3_PRINT_FINAL_BOUND__ = MARKER;
    document.addEventListener("click", event => {
      if (!isPrintButton(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      printCurrentProject();
    }, true);
    window.CWS_BWS_A3_PRINT = {
      marker:MARKER,
      printCurrentProject,
      buildPrintModel:readModel,
      buildPrintHtml:buildHtml,
      usesPopup:false,
      source:"screen-gantt-getBwsPrintModel"
    };
    window.CWS_BWS_GanttPrintA3 = window.CWS_BWS_A3_PRINT;
  }
  function inject(frame){
    try {
      const doc = frame?.contentDocument || frame?.contentWindow?.document;
      if (!doc?.head) return false;
      const existing = doc.getElementById(SCRIPT_ID);
      if (existing && String(existing.src || "").includes("v=145")) return true;
      if (existing) existing.remove();
      const script = doc.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.dataset.cwsMarker = MARKER;
      doc.head.appendChild(script);
      return true;
    } catch (_error) {
      return false;
    }
  }
  function boot(){
    if (document.getElementById("printBtn")) {
      install();
      return;
    }
    const frame = document.getElementById("appFrame");
    if (!frame) return;
    const go = () => inject(frame);
    frame.addEventListener("load", () => setTimeout(go, 80));
    setTimeout(go, 80);
    let tries = 0;
    const timer = setInterval(() => {
      if (go() || ++tries > 80) clearInterval(timer);
    }, 300);
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot, { once:true }) : boot();
})();
