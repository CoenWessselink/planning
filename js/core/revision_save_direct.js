/* CWS Planning V110 — save Gantt revisions directly to D1 and hydrate revision modal from D1. */
(function(){
  const MARKER = "v110-direct-revision-save-and-modal-d1-bridge";
  const posted = new Set();

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

  function getFrameDoc(){ return document.getElementById("appFrame")?.contentDocument || null; }
  function getProjectId(doc){ return doc?.getElementById("projectSel")?.value || doc?.getElementById("mobileProjectSel")?.value || ""; }
  function esc(value){ return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;"); }

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
      try{
        window.CWS.storageStatus = window.CWS.storageStatus || {};
        window.CWS.storageStatus.lastRevisionModalD1HydrationAt = new Date().toISOString();
        window.CWS.storageStatus.lastRevisionModalD1Hydration = { projectId, count:revisions.length, reason, marker:MARKER };
      }catch(_){}
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

  function install(){
    if(!window.CWS?.gantt) return false;
    if(!window.CWS.gantt.__v110DirectRevisionSaveInstalled){
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
            try{
              window.CWS.storageStatus = window.CWS.storageStatus || {};
              window.CWS.storageStatus.unsynced = false;
              window.CWS.storageStatus.lastDirectRevisionSaveAt = new Date().toISOString();
              window.CWS.storageStatus.lastDirectRevisionSave = { projectId, revisionId:unsavedRevision.id, marker:MARKER };
            }catch(_){}
          }).catch(error => {
            console.warn("CWS direct revision save failed", error);
            try{
              window.CWS.storageStatus = window.CWS.storageStatus || {};
              window.CWS.storageStatus.unsynced = true;
              window.CWS.storageStatus.lastError = error.message;
              window.CWS.storageStatus.lastDirectRevisionSaveError = { projectId, revisionId:unsavedRevision.id, message:error.message, marker:MARKER };
            }catch(_){}
          });
          return { ok:true, directRevisionSave:true, marker:MARKER };
        }
        return original.call(this, projectId, model, mutationMeta);
      };
      window.CWS.gantt.__v110DirectRevisionSaveInstalled = true;
      window.CWS.gantt.__v110DirectRevisionSaveMarker = MARKER;
    }

    const doc = getFrameDoc();
    if(doc && !doc.__v110RevisionModalHydrationInstalled){
      doc.__v110RevisionModalHydrationInstalled = true;
      doc.addEventListener("click", event => {
        const btn = event.target?.closest?.("button");
        const text = String(btn?.textContent || "").trim();
        if(text === "Revisies") setTimeout(() => hydrateRevisionModal("open-button"), 120);
        if(text.includes("Planning opslaan als revisie")) setTimeout(() => hydrateRevisionModal("after-save-button"), 700);
      }, true);
      const observer = new MutationObserver(() => setTimeout(() => hydrateRevisionModal("mutation"), 120));
      observer.observe(doc.body, { childList:true, subtree:true, attributes:true, attributeFilter:["class"] });
    }
    return true;
  }

  window.CWS_SaveRevisionDirect = postRevision;
  window.CWS_HydrateRevisionModalFromD1 = hydrateRevisionModal;
  const timer = setInterval(() => { install(); }, 300);
  setTimeout(() => clearInterval(timer), 30000);
})();
