/* CWS Planning V110 — bridge Gantt revision modal to durable D1 revisions.
   The legacy modal reads model.revisions from the iframe state. Direct V108 revision saves write
   app_revisions without doing a heavy /api/state save, so the modal must hydrate the project model
   from /api/revisions before it renders. */
(function(){
  const MARKER = "v110-revision-modal-d1-bridge";
  let timer = null;

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
    return Array.isArray(data.revisions) ? data.revisions.map(rev => ({ ...rev, snapshot:cleanSnapshot(rev.snapshot || {}), _durableRevision:true })) : [];
  }

  function getProjectId(doc){
    return doc.getElementById("projectSel")?.value || doc.getElementById("mobileProjectSel")?.value || "";
  }

  function getParentState(){
    try { return window.CWS?.getState?.(); } catch (_) { return null; }
  }

  function updateParentModel(projectId, revisions){
    const st = getParentState();
    if(!st?.ganttV2?.byProject || !projectId) return;
    const model = st.ganttV2.byProject[projectId];
    if(!model) return;
    const byId = new Map();
    (Array.isArray(model.revisions) ? model.revisions : []).forEach(rev => { if(rev?.id) byId.set(String(rev.id), rev); });
    revisions.forEach(rev => { if(rev?.id) byId.set(String(rev.id), rev); });
    model.revisions = Array.from(byId.values()).sort((a,b)=>String(b.revisionDate||b.createdAt||"").localeCompare(String(a.revisionDate||a.createdAt||"")));
  }

  function forceModalRows(doc, revisions){
    const rows = doc.getElementById("revRows");
    if(!rows) return false;
    if(!revisions.length){
      rows.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;padding:24px">Nog geen revisies opgeslagen.</td></tr>';
      return true;
    }
    rows.innerHTML = revisions.map(rev => `
      <tr data-rev="${String(rev.id).replaceAll('"','&quot;')}">
        <td><b>${String(rev.revNo || '').replaceAll('<','&lt;')}</b></td>
        <td>${String(rev.revisionDate || '').replaceAll('<','&lt;')}</td>
        <td>${String(rev.status || '').replaceAll('<','&lt;')}</td>
        <td>${String(rev.description || '').replaceAll('<','&lt;')}</td>
        <td>${new Date(rev.createdAt || Date.now()).toLocaleString('nl-NL')}</td>
      </tr>`).join("");
    return true;
  }

  async function hydrateRevisionModal(reason="modal"){
    const frame = document.getElementById("appFrame");
    const doc = frame?.contentDocument;
    if(!doc) return;
    const modal = doc.getElementById("revModal");
    const rows = doc.getElementById("revRows");
    if(!modal || !rows || !modal.classList.contains("show")) return;
    const projectId = getProjectId(doc);
    if(!projectId) return;
    rows.dataset.v110Loading = "1";
    try{
      const revisions = await fetchRevisions(projectId);
      updateParentModel(projectId, revisions);
      forceModalRows(doc, revisions);
      try{
        window.CWS.storageStatus = window.CWS.storageStatus || {};
        window.CWS.storageStatus.lastRevisionModalD1HydrationAt = new Date().toISOString();
        window.CWS.storageStatus.lastRevisionModalD1Hydration = { projectId, count:revisions.length, reason, marker:MARKER };
      }catch(_){}
    }catch(error){
      console.warn("CWS revision modal D1 hydration failed", error);
      if(rows && rows.children.length === 1 && rows.textContent.includes("Nog geen revisies")){
        rows.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#92400e;padding:24px">Revisies konden niet uit D1 worden geladen: ${String(error.message || error).replaceAll('<','&lt;')}</td></tr>`;
      }
    }finally{
      if(rows) delete rows.dataset.v110Loading;
    }
  }

  function install(){
    const frame = document.getElementById("appFrame");
    const doc = frame?.contentDocument;
    if(!doc || doc.__v110RevisionModalD1BridgeInstalled) return Boolean(doc?.__v110RevisionModalD1BridgeInstalled);
    doc.__v110RevisionModalD1BridgeInstalled = true;
    doc.addEventListener("click", (event) => {
      const btn = event.target?.closest?.("button");
      const text = String(btn?.textContent || "").trim();
      if(text === "Revisies") setTimeout(() => hydrateRevisionModal("open-button"), 80);
      if(text.includes("Planning opslaan als revisie")) setTimeout(() => hydrateRevisionModal("after-save"), 450);
    }, true);
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => hydrateRevisionModal("mutation"), 120);
    });
    observer.observe(doc.body, { childList:true, subtree:true, attributes:true, attributeFilter:["class"] });
    return true;
  }

  window.CWS_HydrateRevisionModalFromD1 = hydrateRevisionModal;
  const poll = setInterval(() => { if(install()) hydrateRevisionModal("poll"); }, 700);
  setTimeout(() => clearInterval(poll), 30000);
})();
