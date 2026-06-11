/* CWS Planning - Excel project import (Build V15)
   - Browser-native .xlsx reader (no external CDN dependency)
   - Imports project lists from Engineering planning workbooks
   - Updates existing imported projects instead of duplicating
*/
window.CWS_ExcelImport = (() => {
  const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const NS_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
  const IMPORT_YEAR = new Date().getFullYear();
  const textDecoder = new TextDecoder("utf-8");

  const state = {
    workbook:null,
    fileName:"",
    selectedSheet:"",
    analysis:null,
    previewRows:[]
  };

  const esc = (v) => String(v ?? "").replace(/[&<>\"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;"
  }[ch]));

  const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
  const norm = (v) => clean(v).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[._:;()\[\]/\\-]+/g, " ")
    .replace(/\s+/g, " ").trim();

  const hash32 = (input) => {
    const str = String(input ?? "");
    let h = 0x811c9dc5;
    for(let i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h = (h + ((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24))) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  };

  const safeIdPart = (v) => clean(v).toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "X";

  const readUInt16 = (dv, offset) => dv.getUint16(offset, true);
  const readUInt32 = (dv, offset) => dv.getUint32(offset, true);

  async function inflateRaw(uint8){
    if(!uint8 || uint8.length === 0) return new Uint8Array();
    if(typeof DecompressionStream === "undefined"){
      throw new Error("Deze browser ondersteunt geen native ZIP/Deflate uitlezing. Gebruik Chrome/Edge actueel of upload een CSV-export.");
    }
    const stream = new Blob([uint8]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function readZip(arrayBuffer){
    const bytes = new Uint8Array(arrayBuffer);
    const dv = new DataView(arrayBuffer);
    let eocd = -1;
    const min = Math.max(0, bytes.length - 66000);
    for(let i = bytes.length - 22; i >= min; i--){
      if(readUInt32(dv, i) === 0x06054b50){ eocd = i; break; }
    }
    if(eocd < 0) throw new Error("Ongeldig .xlsx-bestand: ZIP-eindblok ontbreekt.");

    const entriesCount = readUInt16(dv, eocd + 10);
    let cdOffset = readUInt32(dv, eocd + 16);
    const entries = {};

    for(let i=0; i<entriesCount; i++){
      if(readUInt32(dv, cdOffset) !== 0x02014b50) throw new Error("Ongeldig .xlsx-bestand: central directory corrupt.");
      const method = readUInt16(dv, cdOffset + 10);
      const compressedSize = readUInt32(dv, cdOffset + 20);
      const uncompressedSize = readUInt32(dv, cdOffset + 24);
      const nameLen = readUInt16(dv, cdOffset + 28);
      const extraLen = readUInt16(dv, cdOffset + 30);
      const commentLen = readUInt16(dv, cdOffset + 32);
      const localOffset = readUInt32(dv, cdOffset + 42);
      const name = textDecoder.decode(bytes.slice(cdOffset + 46, cdOffset + 46 + nameLen));
      entries[name.replace(/^\//, "")] = { name:name.replace(/^\//, ""), method, compressedSize, uncompressedSize, localOffset };
      cdOffset += 46 + nameLen + extraLen + commentLen;
    }

    async function getBytes(name){
      const key = String(name || "").replace(/^\//, "");
      const entry = entries[key];
      if(!entry) throw new Error(`Bestand ontbreekt in XLSX: ${key}`);
      const off = entry.localOffset;
      if(readUInt32(dv, off) !== 0x04034b50) throw new Error(`Ongeldig ZIP-lokaalblok: ${key}`);
      const nameLen = readUInt16(dv, off + 26);
      const extraLen = readUInt16(dv, off + 28);
      const dataStart = off + 30 + nameLen + extraLen;
      const compressed = bytes.slice(dataStart, dataStart + entry.compressedSize);
      if(entry.method === 0) return compressed;
      if(entry.method === 8) return await inflateRaw(compressed);
      throw new Error(`Niet-ondersteunde ZIP-compressie (${entry.method}) in ${key}`);
    }

    async function getText(name){ return textDecoder.decode(await getBytes(name)); }
    return { entries, getBytes, getText };
  }

  function parseXml(xmlText){
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    const err = doc.querySelector("parsererror");
    if(err) throw new Error("XLSX XML kon niet worden gelezen.");
    return doc;
  }

  const byTag = (node, ns, name) => Array.from(node.getElementsByTagNameNS(ns, name));

  function resolveTarget(baseDir, target){
    if(!target) return "";
    if(target.startsWith("/")) return target.replace(/^\//, "");
    const parts = (baseDir + "/" + target).split("/");
    const out = [];
    parts.forEach(p => {
      if(!p || p === ".") return;
      if(p === "..") out.pop();
      else out.push(p);
    });
    return out.join("/");
  }

  function colToIndex(ref){
    const letters = String(ref || "").match(/^[A-Z]+/i)?.[0]?.toUpperCase() || "A";
    let n = 0;
    for(const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  }

  function parseNumber(raw){
    if(raw === null || raw === undefined || raw === "") return "";
    const n = Number(String(raw).replace(",", "."));
    return Number.isFinite(n) ? n : raw;
  }

  function excelSerialToDate(serial){
    const n = Number(serial);
    if(!Number.isFinite(n) || n < 1) return null;
    // Excel Windows date system; serial 1 = 1900-01-01, with leap-year bug accounted by using 1899-12-30.
    const ms = Math.round((n - 25569) * 86400000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function dateToNL(d){
    if(!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2,"0");
    return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth()+1)}-${d.getUTCFullYear()}`;
  }

  function isoWeekStart(year, week){
    const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
    const dow = simple.getUTCDay();
    const diff = dow <= 4 ? 1 - dow : 8 - dow;
    simple.setUTCDate(simple.getUTCDate() + diff);
    return simple;
  }

  function parsePlanningDate(value, year=IMPORT_YEAR){
    if(value === null || value === undefined || value === "") return "";
    if(typeof value === "number") return dateToNL(excelSerialToDate(value));
    const raw = clean(value);
    if(!raw) return "";

    let m = raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
    if(m){
      let y = Number(m[3]);
      if(y < 100) y += 2000;
      return dateToNL(new Date(Date.UTC(y, Number(m[2])-1, Number(m[1]))));
    }
    m = raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
    if(m) return dateToNL(new Date(Date.UTC(Number(m[1]), Number(m[2])-1, Number(m[3]))));

    // Supports: week 24, Week 34 / 38, W12, week 2 ter controle
    m = raw.match(/\b(?:week|wk|w)\s*(\d{1,2})\b/i);
    if(m){
      const wk = Math.max(1, Math.min(53, Number(m[1])));
      return dateToNL(isoWeekStart(year, wk));
    }
    // Also support values that are just a week number when the column header says week/planning.
    m = raw.match(/^\d{1,2}$/);
    if(m){
      const wk = Math.max(1, Math.min(53, Number(raw)));
      return dateToNL(isoWeekStart(year, wk));
    }
    return "";
  }

  async function parseWorkbook(file){
    const zip = await readZip(await file.arrayBuffer());
    const workbookXml = parseXml(await zip.getText("xl/workbook.xml"));
    const relsXml = parseXml(await zip.getText("xl/_rels/workbook.xml.rels"));
    const rels = {};
    byTag(relsXml, NS_REL, "Relationship").forEach(r => { rels[r.getAttribute("Id")] = r.getAttribute("Target"); });

    let sharedStrings = [];
    if(zip.entries["xl/sharedStrings.xml"]){
      const sharedXml = parseXml(await zip.getText("xl/sharedStrings.xml"));
      sharedStrings = byTag(sharedXml, NS_MAIN, "si").map(si => byTag(si, NS_MAIN, "t").map(t => t.textContent || "").join(""));
    }

    const sheets = byTag(workbookXml, NS_MAIN, "sheet").map((sheet) => {
      const rid = sheet.getAttribute("r:id") || sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
      const target = resolveTarget("xl", rels[rid] || "");
      return { name:sheet.getAttribute("name") || "Blad", rid, target, rows:[], header:null, importable:false, score:0 };
    });

    for(const sheet of sheets){
      if(!sheet.target || !zip.entries[sheet.target]) continue;
      const xml = parseXml(await zip.getText(sheet.target));
      const rowMap = new Map();
      let maxCol = 0;
      byTag(xml, NS_MAIN, "c").forEach(c => {
        const ref = c.getAttribute("r") || "A1";
        const rowNo = Number(ref.match(/\d+/)?.[0] || 1);
        const col = colToIndex(ref);
        maxCol = Math.max(maxCol, col);
        const type = c.getAttribute("t") || "";
        let value = "";
        if(type === "inlineStr"){
          value = byTag(c, NS_MAIN, "t").map(t => t.textContent || "").join("");
        }else{
          const v = byTag(c, NS_MAIN, "v")[0]?.textContent ?? "";
          if(type === "s") value = sharedStrings[Number(v)] ?? "";
          else if(type === "b") value = v === "1";
          else value = parseNumber(v);
        }
        if(!rowMap.has(rowNo)) rowMap.set(rowNo, []);
        rowMap.get(rowNo)[col] = value;
      });

      const rowNos = Array.from(rowMap.keys()).sort((a,b)=>a-b);
      sheet.rows = rowNos.map(rowNo => {
        const source = rowMap.get(rowNo) || [];
        const row = [];
        for(let i=0; i<=maxCol; i++) row[i] = source[i] ?? "";
        return { rowNo, values:row };
      }).filter(r => r.values.some(v => clean(v) !== ""));
      analyzeSheet(sheet);
    }
    return { fileName:file.name, sheets };
  }

  function headerScore(values){
    const h = values.map(norm);
    const hasNr = h.some(x => ["nummer","projectnr","project nr","projectnummer"].includes(x));
    const hasProjectName = h.some(x => x.includes("projectomschr") || x.includes("projectomschrijving") || x === "project" || x === "projectnaam" || x === "naam" || x === "omschrijving");
    const hasClient = h.some(x => x.includes("opdrachtgever") || x.includes("klant"));
    const hasStatus = h.some(x => x === "status" || x.includes("status"));
    const hasAction = h.some(x => x === "actie" || x.includes("actie"));
    let score = 0;
    if(hasNr) score += 25;
    if(hasProjectName) score += 45;
    if(hasClient) score += 10;
    if(hasStatus) score += 10;
    if(hasAction) score += 5;
    return score;
  }

  function findCol(headers, candidates){
    const normalized = headers.map(norm);
    for(const c of candidates){
      const needle = norm(c);
      const exact = normalized.findIndex(h => h === needle);
      if(exact >= 0) return exact;
    }
    for(let i=0; i<normalized.length; i++){
      for(const c of candidates){
        const needle = norm(c);
        if(normalized[i].includes(needle) || needle.includes(normalized[i])) return i;
      }
    }
    return -1;
  }

  function analyzeSheet(sheet){
    let best = null;
    sheet.rows.slice(0, 30).forEach((r) => {
      const score = headerScore(r.values);
      if(score > 0 && (!best || score > best.score)) best = { rowNo:r.rowNo, values:r.values, score };
    });
    if(!best){ sheet.header = null; sheet.importable = false; sheet.score = 0; return; }
    const headers = best.values.map(clean);
    const map = {
      projectNo: findCol(headers, ["Nummer", "Projectnr.", "Project nr", "Projectnummer", "Nr"]),
      projectName: findCol(headers, ["Projectomschr.", "Projectomschrijving", "Projectnaam", "Project", "Omschrijving", "Naam"]),
      client: findCol(headers, ["Opdrachtgever", "Klant"]),
      drafter: findCol(headers, ["Tekenaar", "Engineer"]),
      status: findCol(headers, ["Status"]),
      action: findCol(headers, ["Actie", "Opmerking", "Opmerkingen"]),
      order: findCol(headers, ["Volgorde"]),
      detail: findCol(headers, ["Detailberekeningen", "Detailberekening"]),
      montage: findCol(headers, ["Montage"]),
      amount: findCol(headers, ["Bedrag"]),
      projectLeader: findCol(headers, ["Projectleider"]),
      control: findCol(headers, ["Ter controle"]),
      done: findCol(headers, ["Gereed"]),
      planning: findCol(headers, ["Planning", "Leverweek", "Uiterlijke leverweek"]),
      start: findCol(headers, ["Start", "Startdatum", "Begindatum"]),
      end: findCol(headers, ["Einde", "Einddatum", "Gereed datum"]),
      hours: findCol(headers, ["Uren", "Benodigde uren", "Tekenuren", "Engineering uren"])
    };
    sheet.header = { rowNo:best.rowNo, headers, map };
    sheet.score = best.score;
    sheet.importable = map.projectName >= 0 && (map.projectNo >= 0 || map.client >= 0 || map.status >= 0);
  }

  function statusToCws(value){
    const s = norm(value);
    if(!s) return "Te plannen";
    if(s.includes("gereed") || s.includes("definitief")) return "Gereed";
    if(s.includes("geen werktekening") || s.includes("ntb") || s.includes("n t b")) return "Te plannen";
    if(s.includes("uitvoering") || s.includes("controle") || s.includes("retour") || s.includes("ontvangen") || s.includes("aanpassen")) return "Ingepland";
    return "Te plannen";
  }

  function value(row, idx){ return idx >= 0 ? row.values[idx] : ""; }

  function firstDateFrom(row, map){
    const candidates = [map.start, map.planning, map.control, map.detail, map.montage].filter(i => i >= 0);
    for(const idx of candidates){
      const parsed = parsePlanningDate(value(row, idx));
      if(parsed) return parsed;
    }
    return "";
  }

  function endDateFrom(row, map){
    const candidates = [map.end, map.done, map.montage, map.planning].filter(i => i >= 0);
    for(const idx of candidates){
      const parsed = parsePlanningDate(value(row, idx));
      if(parsed) return parsed;
    }
    return "";
  }

  function rowsForImport(sheet){
    if(!sheet?.importable || !sheet.header) return [];
    const map = sheet.header.map;
    return sheet.rows
      .filter(r => r.rowNo > sheet.header.rowNo)
      .map(r => {
        const nr = clean(value(r, map.projectNo));
        const name = clean(value(r, map.projectName));
        const client = clean(value(r, map.client));
        const statusOriginal = clean(value(r, map.status));
        const action = clean(value(r, map.action));
        const drafter = clean(value(r, map.drafter));
        const leader = clean(value(r, map.projectLeader));
        const key = `${nr}|${name}|${client}`;
        const start = firstDateFrom(r, map);
        const end = endDateFrom(r, map);
        const amountRaw = value(r, map.amount);
        const hoursRaw = value(r, map.hours);
        return {
          sourceRow:r.rowNo,
          nr, name, client, statusOriginal, action, drafter, leader,
          status:statusToCws(statusOriginal),
          start, end,
          detail:clean(value(r, map.detail)),
          montage:clean(value(r, map.montage)),
          planning:clean(value(r, map.planning)),
          terControle:clean(value(r, map.control)),
          gereed:clean(value(r, map.done)),
          volgorde:clean(value(r, map.order)),
          bedrag:clean(amountRaw),
          hours:Number.isFinite(Number(String(hoursRaw).replace(",", "."))) ? Math.max(0, Number(String(hoursRaw).replace(",", "."))) : null,
          importKey:`excel:${hash32(key)}`
        };
      })
      .filter(r => r.name || r.nr)
      .filter(r => !(/^nummer$/i.test(r.nr) || /projectomschr/i.test(r.name)));
  }

  function ensureDepartment(st, name){
    const deptName = clean(name) || "Engineering";
    st.departments = st.departments || { order:[], byId:{} };
    st.departments.order = Array.isArray(st.departments.order) ? st.departments.order : [];
    st.departments.byId = st.departments.byId && typeof st.departments.byId === "object" ? st.departments.byId : {};
    const existing = st.departments.order.find(id => norm(st.departments.byId[id]?.name || id) === norm(deptName));
    if(existing) return existing;
    const id = deptName;
    st.departments.byId[id] = { id, name:deptName, source:"excel-import" };
    if(!st.departments.order.includes(id)) st.departments.order.push(id);
    return id;
  }

  function ensureDefaultTasks(st, projectId, imported){
    st.tasks = st.tasks || { byProject:{} };
    st.tasks.byProject = st.tasks.byProject || {};
    if(st.tasks.byProject[projectId]?.phases?.length) return;
    const tasks = [
      { id:"T1", name:"Werktekeningen ontvangen" },
      { id:"T2", name:"Tekenwerk" },
      { id:"T3", name: imported.action ? `Actie: ${imported.action}` : "Controle / revisie" },
      { id:"T4", name:"Voor uitvoering" }
    ];
    st.tasks.byProject[projectId] = {
      source:"excel-import",
      phases:[{ id:"PH-E", name:"Engineering", tasks }]
    };
  }

  function importRows(importRows, options={}){
    if(!window.CWS?.setState) throw new Error("CWS store is nog niet geladen.");
    const summary = { added:0, updated:0, skipped:0, ganttModels:0, deptHours:0 };
    const fileName = state.fileName || options.fileName || "Excel";
    const sheetName = state.selectedSheet || options.sheetName || "";
    CWS.setState(st => {
      st.projects = st.projects || { order:[], byId:{} };
      st.projects.order = Array.isArray(st.projects.order) ? st.projects.order : [];
      st.projects.byId = st.projects.byId && typeof st.projects.byId === "object" ? st.projects.byId : {};
      st.projects.deptHours = Array.isArray(st.projects.deptHours) ? st.projects.deptHours : [];
      st.settings = st.settings || {};
      st.settings.excelImports = Array.isArray(st.settings.excelImports) ? st.settings.excelImports : [];

      const deptId = ensureDepartment(st, "Engineering");
      const byImportKey = {};
      st.projects.order.forEach(id => {
        const p = st.projects.byId[id];
        if(p?.importKey) byImportKey[p.importKey] = id;
      });

      for(const row of importRows){
        if(!row.name && !row.nr){ summary.skipped++; continue; }
        const existingId = byImportKey[row.importKey];
        const id = existingId || `IMP-${safeIdPart(row.nr)}-${hash32(row.importKey).slice(0,6)}`;
        const existing = st.projects.byId[id] || {};
        const project = {
          ...existing,
          id,
          nr: row.nr || existing.nr || id,
          code: row.nr || existing.code || id,
          name: row.name || existing.name || "Naamloos project",
          client: row.client || existing.client || "",
          status: row.status || existing.status || "Te plannen",
          start: row.start || existing.start || "",
          end: row.end || existing.end || "",
          needHours: Number.isFinite(Number(row.hours)) ? Number(row.hours) : (Number(existing.needHours) || 0),
          importKey: row.importKey,
          importSource: {
            type:"xlsx",
            fileName,
            sheetName,
            row:row.sourceRow,
            importedAt:new Date().toISOString()
          },
          excel: {
            statusOriginal: row.statusOriginal,
            action: row.action,
            tekenaar: row.drafter,
            projectleider: row.leader,
            detailberekeningen: row.detail,
            montage: row.montage,
            planning: row.planning,
            terControle: row.terControle,
            gereed: row.gereed,
            volgorde: row.volgorde,
            bedrag: row.bedrag
          }
        };
        st.projects.byId[id] = project;
        if(!st.projects.order.includes(id)){
          st.projects.order.push(id);
          summary.added++;
        }else{
          summary.updated++;
        }
        ensureDefaultTasks(st, id, row);
        if(row.hours !== null && Number(row.hours) > 0){
          const existingHours = st.projects.deptHours.find(h => h.projectId === id && h.deptId === deptId && h.source === "excel-import");
          if(existingHours) existingHours.hours = Number(row.hours);
          else st.projects.deptHours.push({ projectId:id, deptId, hours:Number(row.hours), note:"Excel import", source:"excel-import" });
          summary.deptHours++;
        }
      }
      st.settings.excelImports.push({
        ts:new Date().toISOString(),
        fileName,
        sheetName,
        added:summary.added,
        updated:summary.updated,
        skipped:summary.skipped,
        rows:importRows.length
      });
      if(st.settings.excelImports.length > 50) st.settings.excelImports = st.settings.excelImports.slice(-50);
      return st;
    });
    try{ CWS.audit?.("excel_import_projects", summary); }catch(_){ }
    try{ CWS.gantt?.recalculateHours?.(); }catch(_){ }
    return summary;
  }

  function buildModal(){
    let backdrop = document.getElementById("excelImportBackdrop");
    if(backdrop) return backdrop;
    backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.id = "excelImportBackdrop";
    backdrop.innerHTML = `
      <div class="modal excel-import-modal" role="dialog" aria-modal="true" aria-label="Excel importeren">
        <div class="modal-head">Excel projecten importeren<button class="close" id="excelImportClose" aria-label="Sluiten">X</button></div>
        <div class="modal-body">
          <div class="excel-grid">
            <div>
              <label class="excel-label">Excelbestand (.xlsx)</label>
              <input class="input" id="excelImportFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
              <div class="smallmuted" style="margin-top:6px">Ondersteunt projectlijsten met kolommen zoals Nummer, Projectomschr., Opdrachtgever, Tekenaar, Status, Actie, Montage, Planning.</div>
            </div>
            <div>
              <label class="excel-label">Blad</label>
              <select class="input" id="excelImportSheet" disabled></select>
              <div class="smallmuted" id="excelImportSheetHint" style="margin-top:6px">Nog geen bestand geladen.</div>
            </div>
          </div>
          <div id="excelImportResult" style="margin-top:14px"></div>
          <div class="table-wrap" style="margin-top:14px; max-height:360px; border:1px solid var(--border); border-radius:8px;">
            <table class="excel-preview-table">
              <thead id="excelPreviewHead"><tr><th>Preview</th></tr></thead>
              <tbody id="excelPreviewBody"><tr><td class="smallmuted">Selecteer een .xlsx bestand.</td></tr></tbody>
            </table>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px; flex-wrap:wrap;">
            <button class="btn" id="excelImportCancel">Annuleren</button>
            <button class="btn" id="excelImportProjects" disabled>Importeer projecten</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", (e) => { if(e.target === backdrop) close(); });
    backdrop.querySelector("#excelImportClose").addEventListener("click", close);
    backdrop.querySelector("#excelImportCancel").addEventListener("click", close);
    backdrop.querySelector("#excelImportFile").addEventListener("change", handleFileSelected);
    backdrop.querySelector("#excelImportSheet").addEventListener("change", () => {
      state.selectedSheet = backdrop.querySelector("#excelImportSheet").value;
      renderPreview();
    });
    backdrop.querySelector("#excelImportProjects").addEventListener("click", handleImport);
    return backdrop;
  }

  function open(){
    const backdrop = buildModal();
    backdrop.classList.add("show");
    backdrop.setAttribute("aria-hidden", "false");
  }

  function close(){
    const backdrop = document.getElementById("excelImportBackdrop");
    if(!backdrop) return;
    backdrop.classList.remove("show");
    backdrop.setAttribute("aria-hidden", "true");
  }

  async function handleFileSelected(e){
    const file = e.target.files?.[0];
    if(!file) return;
    const resultEl = document.getElementById("excelImportResult");
    const importBtn = document.getElementById("excelImportProjects");
    try{
      resultEl.innerHTML = `<div class="storage-warning">Excelbestand wordt gelezen...</div>`;
      importBtn.disabled = true;
      state.fileName = file.name;
      state.workbook = await parseWorkbook(file);
      const importable = state.workbook.sheets.filter(s => s.importable).sort((a,b)=>b.score-a.score);
      state.selectedSheet = importable[0]?.name || state.workbook.sheets[0]?.name || "";
      renderSheetSelect();
      renderPreview();
      UI.toast?.("Excelbestand gelezen.");
    }catch(error){
      console.error(error);
      resultEl.innerHTML = `<div class="storage-warning" style="border-color:#dc2626;color:#991b1b;background:#fef2f2">${esc(error.message || error)}</div>`;
      importBtn.disabled = true;
    }
  }

  function renderSheetSelect(){
    const select = document.getElementById("excelImportSheet");
    if(!select || !state.workbook) return;
    select.disabled = false;
    select.innerHTML = state.workbook.sheets.map(sheet => {
      const label = `${sheet.name}${sheet.importable ? " ✓" : ""} (${sheet.rows.length} regels)`;
      return `<option value="${esc(sheet.name)}" ${sheet.name===state.selectedSheet ? "selected" : ""}>${esc(label)}</option>`;
    }).join("");
  }

  function renderPreview(){
    const resultEl = document.getElementById("excelImportResult");
    const hint = document.getElementById("excelImportSheetHint");
    const importBtn = document.getElementById("excelImportProjects");
    const head = document.getElementById("excelPreviewHead");
    const body = document.getElementById("excelPreviewBody");
    const sheet = state.workbook?.sheets?.find(s => s.name === state.selectedSheet);
    if(!sheet){
      hint.textContent = "Geen blad geselecteerd.";
      importBtn.disabled = true;
      return;
    }
    const rows = rowsForImport(sheet);
    state.previewRows = rows;
    hint.textContent = sheet.importable
      ? `Header op rij ${sheet.header.rowNo}. ${rows.length} importeerbare projectregels gevonden.`
      : `Geen projectlijst herkend. Kies een blad met Projectomschr./Nummer.`;
    importBtn.disabled = !sheet.importable || rows.length === 0;
    resultEl.innerHTML = sheet.importable
      ? `<div class="excel-import-ok"><b>${rows.length}</b> projecten gevonden in <b>${esc(sheet.name)}</b>. Bestaande eerder geïmporteerde regels worden bijgewerkt.</div>`
      : `<div class="storage-warning" style="border-color:#f59e0b">Dit blad lijkt geen projectlijst. Verwachte kolommen: Nummer, Projectomschr., Opdrachtgever, Status.</div>`;
    head.innerHTML = `<tr><th>Rij</th><th>Nr.</th><th>Project</th><th>Opdrachtgever</th><th>Status</th><th>Start</th><th>Actie</th></tr>`;
    body.innerHTML = rows.slice(0, 25).map(r => `
      <tr>
        <td>${esc(r.sourceRow)}</td>
        <td>${esc(r.nr)}</td>
        <td>${esc(r.name)}</td>
        <td>${esc(r.client)}</td>
        <td>${esc(r.statusOriginal || r.status)}</td>
        <td>${esc(r.start)}</td>
        <td>${esc(r.action)}</td>
      </tr>`).join("") || `<tr><td colspan="7" class="smallmuted">Geen projectregels gevonden.</td></tr>`;
  }

  function handleImport(){
    try{
      if(!state.previewRows.length) throw new Error("Geen importeerbare projectregels geselecteerd.");
      if(!window.CWS?.hasPermission?.("edit_projects") && !window.CWS?.hasPermission?.("edit_planning") && window.CWS?.getState?.().user?.role !== "admin"){
        throw new Error("Geen rechten om projecten te importeren.");
      }
      const summary = importRows(state.previewRows);
      document.getElementById("excelImportResult").innerHTML = `
        <div class="excel-import-ok">
          Import gereed: <b>${summary.added}</b> nieuw, <b>${summary.updated}</b> bijgewerkt, <b>${summary.skipped}</b> overgeslagen.
        </div>`;
      UI.toast?.(`Excel import gereed: ${summary.added} nieuw, ${summary.updated} bijgewerkt.`);
      try{ Router?.loadApp?.("projecten"); }catch(_){ }
    }catch(error){
      console.error(error);
      document.getElementById("excelImportResult").innerHTML = `<div class="storage-warning" style="border-color:#dc2626;color:#991b1b;background:#fef2f2">${esc(error.message || error)}</div>`;
      UI.toast?.("Excel import mislukt.");
    }
  }

  function bind(){
    const btn = document.getElementById("importExcel");
    if(btn) btn.addEventListener("click", open);
    window.addEventListener("message", event => {
      if(event?.data?.type === "cws_import_excel") open();
    });
  }

  return { bind, open, parseWorkbook, rowsForImport, importRows, parsePlanningDate };
})();
