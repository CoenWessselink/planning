/* CWS Planning V117 — D1 state load recovery before boot fallback + direct revisions + print alignment.
   This script is loaded after store.js and before CWS.init(). It patches fetch itself so a truncated
   180000-character D1 chunk can never reach store.js as if it were a complete state. */
(function(){
  const MARKER = "v117-intercept-truncated-d1-state-before-boot";
  const posted = new Set();

  function isStateRawRequest(input){
    try{
      const rawUrl = typeof input === "string" ? input : String(input?.url || "");
      const url = new URL(rawUrl, location.origin);
      return url.pathname === "/api/state" && url.searchParams.get("payload") === "raw-state" && !url.searchParams.has("chunkIndex") && !url.searchParams.has("chunk");
    }catch(_){ return false; }
  }

  function isTruncatedStateText(text){
    if(typeof text !== "string" || !text) return false;
    if(text.length >= 179900 && text.length <= 180100) return true;
    try{ JSON.parse(text); return false; }
    catch(error){ return /Unterminated string|Unexpected end of JSON|position\s+180000|JSON/i.test(String(error.message || error)); }
  }

  async function nativeTextFetch(nativeFetch, url, options={}){
    const res = await nativeFetch(url, options);
    const text = await res.text();
    if(!res.ok) throw new Error(`Fetch mislukt ${url} (${res.status}): ${text.slice(0, 300)}`);
    return { res, text };
  }

  async function recoverFullStateResponse(nativeFetch){
    const manifestCall = await nativeTextFetch(nativeFetch, "/api/state?chunks=manifest&payload=raw-state&cacheBust=" + Date.now(), {
      headers:{ "Accept":"application/json", "X-CWS-State-Response":"chunk-manifest", "Cache-Control":"no-cache" }
    });
    let manifest = null;
    try{ manifest = JSON.parse(manifestCall.text || "{}"); }
    catch(error){ throw new Error(`D1 manifest is geen geldige JSON (${error.message}).`); }
    if(manifest?.stateJson){
      try{ manifest = JSON.parse(manifest.stateJson); }catch(_){}
    }
    const version = Number(manifest?.version || manifestCall.res.headers.get("X-CWS-Version") || 0);
    const chunkCount = Number(manifest?.chunkCount || manifestCall.res.headers.get("X-CWS-Chunk-Count") || 0);
    if(!version || !chunkCount) throw new Error("D1 manifest mist version/chunkCount; herstel niet mogelijk.");

    const chunks = [];
    for(let i=0;i<chunkCount;i+=1){
      const chunk = await nativeTextFetch(nativeFetch, `/api/state?payload=raw-state&chunkIndex=${encodeURIComponent(String(i))}&version=${encodeURIComponent(String(version))}&cacheBust=${Date.now()}`, {
        headers:{ "Accept":"application/json", "X-CWS-State-Response":"raw-state", "Cache-Control":"no-cache" }
      });
      chunks.push(chunk.text);
    }
    const full = chunks.join("");
    try{ JSON.parse(full); }
    catch(error){ throw new Error(`D1 chunk-herstel leverde geen geldige JSON op (${error.message}).`); }

    const headers = new Headers();
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("Cache-Control", "no-store");
    headers.set("X-CWS-OK", "true");
    headers.set("X-CWS-State-Exists", "1");
    headers.set("X-CWS-Version", String(version));
    headers.set("X-CWS-Bytes", String(full.length));
    headers.set("X-CWS-Chunked", "0");
    headers.set("X-CWS-Recovered-Truncated-State", "1");
    headers.set("X-CWS-V117", MARKER);
    for(const key of ["X-CWS-User-Email", "X-CWS-User-Role", "X-CWS-User-Display-Name", "X-CWS-Updated-At", "X-CWS-Updated-By"]){
      const value = manifestCall.res.headers.get(key);
      if(value) headers.set(key, value);
    }
    return new Response(full, { status:200, statusText:"OK", headers });
  }

  function installStateFetchInterceptor(){
    if(window.__cwsV117StateFetchInterceptorInstalled) return true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async function(input, init){
      const response = await nativeFetch(input, init);
      if(!isStateRawRequest(input)) return response;
      try{
        const clone = response.clone();
        const text = await clone.text();
        if(!isTruncatedStateText(text)) return response;
        console.warn("CWS V117: truncated /api/state raw response intercepted; loading manifest/chunks instead.");
        const recovered = await recoverFullStateResponse(nativeFetch);
        try{
          window.CWS = window.CWS || {};
          window.CWS.__v117RecoveredTruncatedD1State = { at:new Date().toISOString(), marker:MARKER, originalLength:text.length };
          if(window.CWS.storageStatus){
            window.CWS.storageStatus.d1Reachable = true;
            window.CWS.storageStatus.lastError = null;
            window.CWS.storageStatus.v117RecoveredTruncatedD1StateAt = new Date().toISOString();
          }
        }catch(_){}
        return recovered;
      }catch(error){
        console.warn("CWS V117 state fetch interceptor could not recover", error);
        return response;
      }
    };
    window.__cwsV117StateFetchInterceptorInstalled = true;
    window.__cwsV117StateFetchInterceptorMarker = MARKER;
    return true;
  }

  function cleanSnapshot(snapshot){
    const clean = JSON.parse(JSON.stringify(snapshot || {}));
    delete clean.capacity;
    delete clean.gantt;
    delete clean.hoursByDay;
    delete clean.sourcesByDay;
    delete clean.projectDeptHoursValidation;
    clean.meta = clean.meta && typeof clean.meta === "object" ? clean.meta : {};
    clean.meta.capacityExcludedFromRevision = true;
    clean.meta.capacityRevisionIsolation = MARKER;
    return clean;
  }

  function esc(value){
    return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");
  }

  function getFrameDoc(){
    try{ return document.getElementById("appFrame")?.contentDocument || null; }
    catch(_){ return null; }
  }

  function getProjectId(doc){
    return doc?.getElementById("projectSel")?.value || doc?.getElementById("mobileProjectSel")?.value || "";
  }

  async function fetchRevisions(projectId){
    if(!projectId) return [];
    const res = await fetch(`/api/revisions?projectId=${encodeURIComponent(projectId)}`, { headers:{ "Accept":"application/json" } });
    const data = await res.json().catch(()=>({}));
    if(!res.ok || !data.ok) throw new Error(data.error || `Revisies laden mislukt (${res.status}).`);
    return Array.isArray(data.revisions) ? data.revisions.map(rev => ({ ...rev, snapshot:cleanSnapshot(rev.snapshot || {}), _durableRevision:true, _directSaved:true })) : [];
  }

  function mergeModelRevisions(projectId, revisions){
    try{
      const st = window.CWS?.getState?.();
      const model = st?.ganttV2?.byProject?.[projectId];
      if(!model) return;
      const byId = new Map();
      (Array.isArray(model.revisions) ? model.revisions : []).forEach(rev => { if(rev?.id) byId.set(String(rev.id), rev); });
      revisions.forEach(rev => { if(rev?.id) byId.set(String(rev.id), rev); });
      model.revisions = Array.from(byId.values()).sort((a,b)=>String(b.revisionDate||b.createdAt||"").localeCompare(String(a.revisionDate||a.createdAt||"")));
    }catch(_){}
  }

  function renderRevisionRows(doc, revisions){
    const rows = doc?.getElementById("revRows");
    if(!rows) return false;
    if(!revisions.length){
      rows.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;padding:24px">Nog geen revisies opgeslagen.</td></tr>';
      return true;
    }
    rows.innerHTML = revisions.map(rev => `
      <tr data-rev="${esc(rev.id)}">
        <td><b>${esc(rev.revNo || '')}</b></td>
        <td>${esc(rev.revisionDate || '')}</td>
        <td>${esc(rev.status || '')}</td>
        <td>${esc(rev.description || '')}</td>
        <td>${new Date(rev.createdAt || Date.now()).toLocaleString('nl-NL')}</td>
      </tr>`).join("");
    return true;
  }

  async function hydrateRevisionModal(reason="manual"){
    const doc = getFrameDoc();
    const modal = doc?.getElementById("revModal");
    if(!doc || !modal || !modal.classList.contains("show")) return;
    const projectId = getProjectId(doc);
    if(!projectId) return;
    const rows = doc.getElementById("revRows");
    try{
      const revisions = await fetchRevisions(projectId);
      mergeModelRevisions(projectId, revisions);
      renderRevisionRows(doc, revisions);
      if(window.CWS?.storageStatus){
        window.CWS.storageStatus.lastRevisionModalD1HydrationAt = new Date().toISOString();
        window.CWS.storageStatus.lastRevisionModalD1Hydration = { projectId, count:revisions.length, reason, marker:MARKER };
      }
    }catch(error){
      console.warn("CWS revision modal D1 hydration failed", error);
      if(rows && rows.textContent.includes("Nog geen revisies")){
        rows.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#92400e;padding:24px">Revisies konden niet uit D1 worden geladen: ${esc(error.message || error)}</td></tr>`;
      }
    }
  }

  async function postRevision(projectId, revision){
    if(!projectId || !revision?.id) return { ok:false, error:"projectId/revision ontbreekt" };
    const key = `${projectId}/${revision.id}`;
    if(posted.has(key) || revision._directSaved || revision._durableRevision) return { ok:true, skipped:true };
    const body = { projectId:String(projectId), revision:{ ...revision, snapshot:cleanSnapshot(revision.snapshot || {}) } };
    const res = await fetch("/api/revision-save", {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Accept":"application/json" },
      body:JSON.stringify(body)
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok || !data.ok) throw new Error(data.error || `Direct revisie opslaan mislukt (${res.status}).`);
    posted.add(key);
    revision._directSaved = true;
    revision._durableRevision = true;
    revision.snapshot = body.revision.snapshot;
    return { ok:true, data };
  }

  function findUnsavedRevision(model){
    const list = Array.isArray(model?.revisions) ? model.revisions : [];
    return list.find(rev => rev?.id && !rev._directSaved && !rev._durableRevision) || null;
  }

  function installGanttRevisionGuard(){
    if(!window.CWS?.gantt || window.CWS.gantt.__v117DirectRevisionSaveInstalled) return Boolean(window.CWS?.gantt?.__v117DirectRevisionSaveInstalled);
    const original = window.CWS.gantt.saveProjectGantt;
    if(typeof original !== "function") return false;
    window.CWS.gantt.saveProjectGantt = function(projectId, model, mutationMeta){
      const unsavedRevision = findUnsavedRevision(model);
      const looksLikeRevisionOnly = Boolean(unsavedRevision && (!mutationMeta || Object.keys(mutationMeta || {}).length === 0));
      if(looksLikeRevisionOnly){
        unsavedRevision.snapshot = cleanSnapshot(unsavedRevision.snapshot || {});
        postRevision(projectId, unsavedRevision).then(() => {
          mergeModelRevisions(projectId, [unsavedRevision]);
          hydrateRevisionModal("after-direct-save");
          if(window.CWS?.storageStatus){
            window.CWS.storageStatus.unsynced = false;
            window.CWS.storageStatus.lastDirectRevisionSaveAt = new Date().toISOString();
            window.CWS.storageStatus.lastDirectRevisionSave = { projectId, revisionId:unsavedRevision.id, marker:MARKER };
          }
        }).catch(error => {
          console.warn("CWS direct revision save failed", error);
          if(window.CWS?.storageStatus){
            window.CWS.storageStatus.unsynced = true;
            window.CWS.storageStatus.lastError = error.message;
            window.CWS.storageStatus.lastDirectRevisionSaveError = { projectId, revisionId:unsavedRevision.id, message:error.message, marker:MARKER };
          }
        });
        return { ok:true, directRevisionSave:true, marker:MARKER };
      }
      return original.call(this, projectId, model, mutationMeta);
    };
    window.CWS.gantt.__v117DirectRevisionSaveInstalled = true;
    window.CWS.gantt.__v117DirectRevisionSaveMarker = MARKER;
    return true;
  }

  function installPrintAlignmentGuard(){
    const doc = getFrameDoc();
    if(!doc?.head || doc.getElementById("cws-v117-print-alignment-style")) return Boolean(doc?.getElementById("cws-v117-print-alignment-style"));
    const style = doc.createElement("style");
    style.id = "cws-v117-print-alignment-style";
    style.textContent = `
      @media print{
        html body.printing{--v117-print-row-h:24px!important;--v117-print-left-w:240px!important;}
        html body.printing .board{display:grid!important;grid-template-columns:var(--v117-print-left-w) minmax(0,1fr)!important;gap:0!important;align-items:start!important;}
        html body.printing .print-task-table{grid-column:1!important;width:var(--v117-print-left-w)!important;margin:0!important;padding:0!important;align-self:start!important;}
        html body.printing .chart-pane{grid-column:2!important;margin:0!important;padding:0!important;align-self:start!important;overflow:visible!important;}
        html body.printing .chart-pane>.timeline,html body.printing .print-task-table thead{display:none!important;height:0!important;overflow:hidden!important;visibility:hidden!important;}
        html body.printing .print-task-table tbody tr,html body.printing .print-task-table tbody td,html body.printing #lanes>.lane{height:var(--v117-print-row-h)!important;min-height:var(--v117-print-row-h)!important;max-height:var(--v117-print-row-h)!important;box-sizing:border-box!important;}
        html body.printing .print-task-table tbody td{padding:2px 3px!important;line-height:1.05!important;vertical-align:middle!important;border:.35px solid #111827!important;overflow:hidden!important;white-space:nowrap!important;text-overflow:ellipsis!important;}
        html body.printing #lanes{margin:0!important;padding:0!important;border-top:0!important;transform:none!important;}
        html body.printing #lanes>.lane{position:relative!important;margin:0!important;padding:0!important;border-bottom:.35px solid #111827!important;}
        html body.printing #lanes>.lane .bar:not(.summary){top:5px!important;height:14px!important;min-height:14px!important;max-height:14px!important;line-height:14px!important;}
      }
    `;
    doc.head.appendChild(style);
    return true;
  }

  function installFrameHooks(){
    const doc = getFrameDoc();
    if(!doc || doc.__v117RevisionHooksInstalled) return Boolean(doc?.__v117RevisionHooksInstalled);
    doc.__v117RevisionHooksInstalled = true;
    doc.addEventListener("click", event => {
      const btn = event.target?.closest?.("button");
      const text = String(btn?.textContent || "").trim();
      if(text === "Revisies") setTimeout(() => hydrateRevisionModal("open-button"), 120);
      if(text.includes("Planning opslaan als revisie")) setTimeout(() => hydrateRevisionModal("after-save-button"), 700);
      if(text.includes("Print") || text.includes("Print A3")) setTimeout(installPrintAlignmentGuard, 60);
    }, true);
    if(doc.body && doc.body.nodeType === 1){
      const observer = new MutationObserver(() => {
        installPrintAlignmentGuard();
        setTimeout(() => hydrateRevisionModal("mutation"), 120);
      });
      observer.observe(doc.body, { childList:true, subtree:true, attributes:true, attributeFilter:["class"] });
    }
    return true;
  }

  function install(){
    installStateFetchInterceptor();
    installGanttRevisionGuard();
    installPrintAlignmentGuard();
    installFrameHooks();
    return true;
  }

  installStateFetchInterceptor();
  window.CWS_SaveRevisionDirect = postRevision;
  window.CWS_HydrateRevisionModalFromD1 = hydrateRevisionModal;
  window.CWS_InstallGanttPrintAlignmentGuard = installPrintAlignmentGuard;
  const timer = setInterval(install, 100);
  setTimeout(() => clearInterval(timer), 30000);
})();
