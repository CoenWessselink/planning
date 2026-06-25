/* CWS Planning V126 — durable Gantt + revision bridge + preview materialization.
   Do not override print CSS here. A3 print is controlled by laag4_gantt.html print rules. */
(function(){
  const MARKER = "v126-durable-gantt-revision-preview-materialize";
  const postedRevisions = new Set();
  const postedGantt = new Map();

  function deepClone(value){ return JSON.parse(JSON.stringify(value ?? null)); }
  function esc(value){ return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;"); }
  function getFrameDoc(){ try{ return document.getElementById("appFrame")?.contentDocument || null; }catch(_){ return null; } }
  function getProjectId(doc){ return doc?.getElementById("projectSel")?.value || doc?.getElementById("mobileProjectSel")?.value || ""; }

  function cleanSnapshot(snapshot){
    const clean = deepClone(snapshot || {});
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

  function cleanModel(model){
    const clean = deepClone(model || {});
    clean.rows = Array.isArray(clean.rows) ? clean.rows : [];
    clean.sched = clean.sched && typeof clean.sched === "object" && !Array.isArray(clean.sched) ? clean.sched : {};
    clean.revisions = Array.isArray(clean.revisions) ? clean.revisions.map(rev => {
      if(!rev || typeof rev !== "object") return rev;
      return { ...rev, snapshot:cleanSnapshot(rev.snapshot || {}) };
    }) : [];
    return clean;
  }

  function findUnsavedRevision(model){
    const list = Array.isArray(model?.revisions) ? model.revisions : [];
    return list.find(rev => rev?.id && !rev._directSaved && !rev._durableRevision) || null;
  }

  function currentGanttProjection(){
    const gantt = window.CWS?.getState?.()?.gantt;
    if(!gantt || typeof gantt !== "object" || Array.isArray(gantt)) return null;
    return deepClone(gantt);
  }

  async function postRevision(projectId, revision){
    if(!projectId || !revision?.id) return { ok:false, error:"projectId/revision ontbreekt" };
    const key = `${projectId}/${revision.id}`;
    if(postedRevisions.has(key) || revision._directSaved || revision._durableRevision) return { ok:true, skipped:true };
    const body = { projectId:String(projectId), revision:{ ...revision, snapshot:cleanSnapshot(revision.snapshot || {}) } };
    const res = await fetch("/api/revision-save", {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Accept":"application/json" },
      body:JSON.stringify(body)
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok || !data.ok) throw new Error(data.error || `Direct revisie opslaan mislukt (${res.status}).`);
    postedRevisions.add(key);
    revision._directSaved = true;
    revision._durableRevision = true;
    revision.snapshot = body.revision.snapshot;
    return { ok:true, data };
  }

  async function fetchRevisions(projectId){
    if(!projectId) return [];
    const res = await fetch(`/api/revisions?projectId=${encodeURIComponent(projectId)}&cacheBust=${Date.now()}`, {
      headers:{ "Accept":"application/json", "Cache-Control":"no-cache" }
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok || !data.ok) throw new Error(data.error || `Revisies laden mislukt (${res.status}).`);
    return Array.isArray(data.revisions)
      ? data.revisions.map(rev => ({ ...rev, snapshot:cleanSnapshot(rev.snapshot || {}), _durableRevision:true, _directSaved:true }))
      : [];
  }

  async function postProjectGantt(projectId, model, reason="gantt-save"){
    if(!projectId || !model) return { ok:false, skipped:true };
    const clean = cleanModel(model);
    const gantt = currentGanttProjection();
    const signature = JSON.stringify({ rows:clean.rows, sched:clean.sched, revisions:clean.revisions?.map(r => ({ id:r.id, revNo:r.revNo, revisionDate:r.revisionDate, createdAt:r.createdAt })), gantt });
    const previous = postedGantt.get(projectId);
    if(previous === signature) return { ok:true, skipped:true };
    postedGantt.set(projectId, signature);
    const res = await fetch("/api/gantt-save", {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Accept":"application/json" },
      body:JSON.stringify({ projectId:String(projectId), model:clean, gantt, reason, marker:MARKER })
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok || !data.ok) throw new Error(data.error || `Direct Gantt opslaan mislukt (${res.status}).`);
    if(window.CWS?.storageStatus){
      window.CWS.storageStatus.lastDirectProjectGanttSaveAt = new Date().toISOString();
      window.CWS.storageStatus.lastDirectProjectGanttSave = { projectId, version:data.version, capacityProjectionSaved:Boolean(data.capacityProjectionSaved), marker:MARKER };
      window.CWS.storageStatus.unsynced = false;
      window.CWS.storageStatus.lastError = null;
    }
    return data;
  }

  function mergeRevisionsIntoRuntime(projectId, revisions){
    try{
      const st = window.CWS?.getState?.();
      const model = st?.ganttV2?.byProject?.[projectId];
      if(!model) return null;
      model.revisions = Array.isArray(model.revisions) ? model.revisions : [];
      const byId = new Map(model.revisions.map(rev => [String(rev.id), rev]));
      revisions.forEach(rev => { if(rev?.id) byId.set(String(rev.id), rev); });
      model.revisions = Array.from(byId.values()).sort((a,b)=>String(b.revisionDate||b.createdAt||"").localeCompare(String(a.revisionDate||a.createdAt||"")));
      return model;
    }catch(_){ return null; }
  }

  function renderRows(doc, revisions){
    const modalBody = doc?.getElementById("modalBody");
    const modalTitle = doc?.getElementById("modalTitle")?.textContent || "";
    if(!modalBody || !/Planningrevisies/i.test(modalTitle)) return false;
    const tbody = modalBody.querySelector("table.revision-table tbody") || modalBody.querySelector("tbody");
    if(!tbody) return false;
    if(!revisions.length){
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Nog geen revisies opgeslagen.</td></tr>';
      return true;
    }
    tbody.innerHTML = revisions.map(rev => `
      <tr data-rev="${esc(rev.id)}">
        <td><b>${esc(rev.revNo || '—')}</b></td>
        <td>${esc(rev.revisionDate || '—')}</td>
        <td>${esc(rev.status || '—')}</td>
        <td>${esc(rev.description || '')}</td>
        <td>${esc(String(rev.createdAt || '').slice(0,10) || '—')}</td>
        <td class="actions"><button class="btn" data-d1-rev-action="view">Bekijken</button> <button class="btn" data-d1-rev-action="print">Print</button> <button class="btn primary" data-d1-rev-action="restore">Zet live</button> <button class="btn danger" data-d1-rev-action="delete">Verwijder</button></td>
      </tr>`).join("");
    return true;
  }

  async function hydrateRevisionModal(reason="manual"){
    const doc = getFrameDoc();
    const modal = doc?.getElementById("modalBack");
    const title = doc?.getElementById("modalTitle")?.textContent || "";
    if(!doc || !modal?.classList?.contains("show") || !/Planningrevisies/i.test(title)) return;
    const projectId = getProjectId(doc);
    if(!projectId) return;
    try{
      const revisions = await fetchRevisions(projectId);
      mergeRevisionsIntoRuntime(projectId, revisions);
      renderRows(doc, revisions);
      if(window.CWS?.storageStatus){
        window.CWS.storageStatus.lastRevisionModalD1HydrationAt = new Date().toISOString();
        window.CWS.storageStatus.lastRevisionModalD1Hydration = { projectId, count:revisions.length, reason, marker:MARKER };
      }
    }catch(error){
      console.warn("CWS V126 revision hydration failed", error);
      if(window.CWS?.storageStatus){
        window.CWS.storageStatus.lastRevisionHydrationError = { message:error.message, marker:MARKER };
      }
    }
  }

  function runInFrame(doc, code){
    try { return doc?.defaultView?.eval?.(code); } catch(error) { console.warn("CWS V126 iframe eval failed", error); return null; }
  }

  const PREVIEW_MATERIALIZE_PATCH = String.raw`
(function(){
  if(window.__cwsV126GanttPreviewMaterializeGuard) return true;
  if(typeof getModel !== "function" || typeof generateModel !== "function" || typeof saveModel !== "function" || typeof render !== "function") return false;
  window.__cwsV126GanttPreviewMaterializeGuard = true;
  const marker = "v126-gantt-preview-materialize-before-edit";
  const originalGetModel = getModel;
  const originalRender = render;
  function clone(value){ return JSON.parse(JSON.stringify(value || {})); }
  function hasRows(model){ return !!(model && Array.isArray(model.rows) && model.rows.length); }
  function materialize(projectId){
    const live = originalGetModel(projectId) || { rows:[], sched:{}, revisions:[] };
    if(hasRows(live)) return live;
    if(window.__cwsV126RenderActive || window.__cwsV126Materializing) return live;
    const generated = generateModel(projectId);
    if(!hasRows(generated)) return live;
    const next = clone(generated);
    delete next._previewOnly;
    next.revisions = Array.isArray(live.revisions) ? clone(live.revisions) : [];
    next.meta = next.meta && typeof next.meta === "object" ? next.meta : {};
    next.meta.materializedFromPreview = true;
    next.meta.materializedFromPreviewAt = new Date().toISOString();
    next.meta.materializedFromPreviewMarker = marker;
    window.__cwsV126Materializing = true;
    try{
      const result = saveModel(projectId, next, "Fasen automatisch geactiveerd", { action:"gantt_preview_materialized", projectId, marker });
      if(result && result.ok === false){ console.warn("CWS V126 preview materialize save failed", result); return next; }
    }finally{
      window.__cwsV126Materializing = false;
    }
    const stored = originalGetModel(projectId);
    return hasRows(stored) ? stored : next;
  }
  render = function(){
    window.__cwsV126RenderActive = true;
    try { return originalRender.apply(this, arguments); }
    finally { window.__cwsV126RenderActive = false; }
  };
  getModel = function(projectId){
    const live = originalGetModel(projectId);
    if(hasRows(live) || window.__cwsV126RenderActive || window.__cwsV126Materializing) return live;
    const stack = String(new Error().stack || "");
    const dragActive = !!(typeof UI !== "undefined" && UI && UI.drag);
    const userIntent = dragActive || /openEdit|addTask|deleteRow|duplicateRow|mutateSelectedRows|finishPointerMutation|saveModelNoRender|change|onclick|EventListener|HTMLButtonElement|HTMLInputElement|HTMLSelectElement/i.test(stack);
    if(!userIntent) return live;
    return materialize(projectId);
  };
  window.CWS_GanttMaterializePreviewNow = materialize;
  window.__cwsV126GanttPreviewMaterializeMarker = marker;
  return true;
})();`;

  function installPreviewMaterializeGuard(){
    const doc = getFrameDoc();
    if(!doc) return false;
    return Boolean(runInFrame(doc, PREVIEW_MATERIALIZE_PATCH));
  }

  function installRevisionActionBridge(){
    const doc = getFrameDoc();
    if(!doc || doc.__v126RevisionActionBridgeInstalled) return Boolean(doc?.__v126RevisionActionBridgeInstalled);
    doc.__v126RevisionActionBridgeInstalled = true;
    doc.addEventListener("click", async (event) => {
      const btn = event.target?.closest?.("button[data-d1-rev-action]");
      if(!btn) return;
      event.preventDefault();
      event.stopPropagation();
      const tr = btn.closest("tr[data-rev]");
      const revId = tr?.dataset?.rev || "";
      const projectId = getProjectId(doc);
      if(!projectId || !revId) return;
      const revisions = await fetchRevisions(projectId).catch(() => []);
      const rev = revisions.find(r => String(r.id) === String(revId));
      if(!rev) return;
      const action = btn.dataset.d1RevAction;
      if(action === "view" || action === "print"){
        mergeRevisionsIntoRuntime(projectId, [rev]);
        runInFrame(doc, `UI.revisionId=${JSON.stringify(rev.id)}; document.getElementById('modalBack')?.classList.remove('show'); render();`);
        if(action === "print") setTimeout(() => runInFrame(doc, `printA3();`), 180);
        return;
      }
      if(action === "restore"){
        if(!window.confirm(`Revisie ${rev.revNo || ""} als live planning herstellen? De bestaande live planning wordt overschreven.`)) return;
        const current = window.CWS?.gantt?.getProjectGantt?.(projectId) || { rows:[], sched:{}, revisions:[] };
        const keep = Array.isArray(current.revisions) ? current.revisions : [];
        const next = { ...current, rows:deepClone(rev.snapshot?.rows || []), sched:deepClone(rev.snapshot?.sched || {}), revisions:keep };
        window.CWS?.gantt?.saveProjectGantt?.(projectId, next, { action:"gantt_revision_restore", projectId, revisionId:rev.id });
        await postProjectGantt(projectId, next, "revision-restore").catch(error => console.warn("Direct restore save failed", error));
        doc.getElementById("modalBack")?.classList?.remove("show");
        doc.defaultView?.location?.reload?.();
        return;
      }
      if(action === "delete"){
        if(!window.confirm(`Revisie ${rev.revNo || ""} definitief verwijderen?`)) return;
        const res = await fetch(`/api/revision-delete?projectId=${encodeURIComponent(projectId)}&revisionId=${encodeURIComponent(rev.id)}`, {
          method:"DELETE",
          headers:{ "Accept":"application/json" }
        });
        if(!res.ok) console.warn("Revision delete failed", await res.text().catch(() => ""));
        hydrateRevisionModal("after-delete");
      }
    }, true);
    return true;
  }

  function installGanttSaveBridge(){
    if(!window.CWS?.gantt || window.CWS.gantt.__v126DurableBridgeInstalled) return Boolean(window.CWS?.gantt?.__v126DurableBridgeInstalled);
    const original = window.CWS.gantt.saveProjectGantt;
    if(typeof original !== "function") return false;
    window.CWS.gantt.saveProjectGantt = function(projectId, model, mutationMeta={}){
      const clean = cleanModel(model);
      const unsavedRevision = findUnsavedRevision(clean);
      if(unsavedRevision) {
        unsavedRevision.snapshot = cleanSnapshot(unsavedRevision.snapshot || {});
        postRevision(projectId, unsavedRevision).catch(error => console.warn("CWS direct revision save failed", error));
      }
      const result = original.call(this, projectId, clean, mutationMeta || {});
      if(result?.ok !== false){
        const action = mutationMeta?.action || mutationMeta?.reason || (unsavedRevision ? "revision-save" : "gantt-save");
        setTimeout(() => {
          postProjectGantt(projectId, clean, action).catch(error => {
            console.warn("CWS direct project Gantt save failed", error);
            if(window.CWS?.storageStatus){
              window.CWS.storageStatus.unsynced = true;
              window.CWS.storageStatus.lastError = error.message;
              window.CWS.storageStatus.lastDirectProjectGanttSaveError = { projectId, message:error.message, marker:MARKER };
            }
          });
        }, 120);
      }
      return result;
    };
    window.CWS.gantt.__v126DurableBridgeInstalled = true;
    window.CWS.gantt.__v126DurableBridgeMarker = MARKER;
    return true;
  }

  function installFrameHooks(){
    const doc = getFrameDoc();
    if(!doc) return false;
    installPreviewMaterializeGuard();
    if(doc.__v126FrameHooksInstalled) return true;
    doc.__v126FrameHooksInstalled = true;
    doc.addEventListener("click", event => {
      const text = String(event.target?.closest?.("button")?.textContent || "").trim();
      if(text === "Revisies") setTimeout(() => hydrateRevisionModal("open-button"), 160);
      if(text.includes("Planning opslaan als revisie")) setTimeout(() => hydrateRevisionModal("after-save-button"), 900);
    }, true);
    const observer = new MutationObserver(() => {
      installPreviewMaterializeGuard();
      setTimeout(() => hydrateRevisionModal("mutation"), 180);
    });
    if(doc.body) observer.observe(doc.body, { childList:true, subtree:true, attributes:true, attributeFilter:["class"] });
    installRevisionActionBridge();
    return true;
  }

  function install(){
    installGanttSaveBridge();
    installFrameHooks();
    installRevisionActionBridge();
    installPreviewMaterializeGuard();
    return true;
  }

  window.CWS_SaveRevisionDirect = postRevision;
  window.CWS_HydrateRevisionModalFromD1 = hydrateRevisionModal;
  window.CWS_DirectProjectGanttSave = postProjectGantt;
  const timer = setInterval(install, 100);
  setTimeout(() => clearInterval(timer), 30000);
})();
