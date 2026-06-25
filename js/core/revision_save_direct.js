/* CWS Planning V111 — save Gantt revisions directly to D1, hydrate revision modal from D1, and hard-align print table/diagram rows. */
(function(){
  const MARKER = "v111-revision-modal-and-print-alignment";
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

  function installPrintAlignmentGuard(){
    const doc = getFrameDoc();
    if(!doc?.head || doc.getElementById("cws-v111-print-alignment-style")) return Boolean(doc?.getElementById("cws-v111-print-alignment-style"));
    const style = doc.createElement("style");
    style.id = "cws-v111-print-alignment-style";
    style.textContent = `
      @media print{
        html body.printing{
          --v111-print-row-h:24px!important;
          --v111-print-head-h:58px!important;
          --v111-print-left-w:240px!important;
        }
        html body.printing .board,
        html body.printing .board.diagram-only,
        html body.printing .board.table-only{
          display:grid!important;
          grid-template-columns:var(--v111-print-left-w) minmax(0,1fr)!important;
          align-items:start!important;
          align-content:start!important;
          gap:0!important;
          width:100%!important;
          min-width:0!important;
        }
        html body.printing .print-task-table{
          display:block!important;
          grid-column:1!important;
          width:var(--v111-print-left-w)!important;
          min-width:var(--v111-print-left-w)!important;
          max-width:var(--v111-print-left-w)!important;
          margin:0!important;
          padding:0!important;
          border-right:.35px solid #111827!important;
          box-sizing:border-box!important;
          align-self:start!important;
        }
        html body.printing .chart-pane{
          grid-column:2!important;
          align-self:start!important;
          margin:0!important;
          padding:0!important;
          min-width:0!important;
          width:100%!important;
          overflow:visible!important;
          transform:none!important;
        }
        html body.printing .chart-pane > .timeline{
          display:none!important;
          height:0!important;
          min-height:0!important;
          max-height:0!important;
          overflow:hidden!important;
          visibility:hidden!important;
        }
        html body.printing .print-task-table thead{
          display:none!important;
          height:0!important;
          min-height:0!important;
          max-height:0!important;
          overflow:hidden!important;
          visibility:hidden!important;
        }
        html body.printing .print-task-table table{
          width:100%!important;
          border-collapse:collapse!important;
          table-layout:fixed!important;
          margin:0!important;
          padding:0!important;
          border:0!important;
        }
        html body.printing .print-task-table tbody tr,
        html body.printing .print-task-table tbody td,
        html body.printing #lanes > .lane{
          height:var(--v111-print-row-h)!important;
          min-height:var(--v111-print-row-h)!important;
          max-height:var(--v111-print-row-h)!important;
          box-sizing:border-box!important;
        }
        html body.printing .print-task-table tbody td{
          padding:2px 3px!important;
          line-height:1.05!important;
          vertical-align:middle!important;
          border:.35px solid #111827!important;
          overflow:hidden!important;
          white-space:nowrap!important;
          text-overflow:ellipsis!important;
        }
        html body.printing #lanes{
          margin:0!important;
          padding:0!important;
          border-top:0!important;
          height:auto!important;
          min-height:0!important;
          transform:none!important;
        }
        html body.printing #lanes > .lane{
          position:relative!important;
          margin:0!important;
          padding:0!important;
          border-bottom:.35px solid #111827!important;
          line-height:var(--v111-print-row-h)!important;
        }
        html body.printing #lanes > .lane .bar:not(.summary){
          top:5px!important;
          height:14px!important;
          min-height:14px!important;
          max-height:14px!important;
          line-height:14px!important;
        }
        html body.printing #lanes > .lane .bar.summary{
          top:0!important;
          height:var(--v111-print-row-h)!important;
          min-height:var(--v111-print-row-h)!important;
          max-height:var(--v111-print-row-h)!important;
        }
        html body.printing #lanes > .lane .bar.summary:before{top:10px!important;}
        html body.printing #lanes > .lane .bar.summary:after{top:15px!important;}
        html body.printing .print-calendar{
          grid-template-columns:var(--v111-print-left-w) minmax(0,1fr)!important;
        }
        html body.printing .print-calendar-left{
          width:var(--v111-print-left-w)!important;
          min-width:var(--v111-print-left-w)!important;
          max-width:var(--v111-print-left-w)!important;
        }
        html body.printing .print-calendar-top .print-calendar-left table,
        html body.printing .print-calendar-top .print-calendar-left th,
        html body.printing .print-calendar-top .timeline{
          height:var(--v111-print-head-h)!important;
          min-height:var(--v111-print-head-h)!important;
          max-height:var(--v111-print-head-h)!important;
        }
        html body.printing .dep-svg{
          top:0!important;
          height:100%!important;
        }
        html body.printing .today-line{top:0!important;}
      }
    `;
    doc.head.appendChild(style);
    try{
      window.CWS.storageStatus = window.CWS.storageStatus || {};
      window.CWS.storageStatus.ganttPrintAlignmentMarker = MARKER;
      window.CWS.storageStatus.ganttPrintAlignmentInstalledAt = new Date().toISOString();
    }catch(_){}
    return true;
  }

  function install(){
    installPrintAlignmentGuard();
    if(!window.CWS?.gantt) return false;
    if(!window.CWS.gantt.__v111DirectRevisionSaveInstalled){
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
      window.CWS.gantt.__v111DirectRevisionSaveInstalled = true;
      window.CWS.gantt.__v111DirectRevisionSaveMarker = MARKER;
    }

    const doc = getFrameDoc();
    if(doc && !doc.__v111RevisionModalHydrationInstalled){
      doc.__v111RevisionModalHydrationInstalled = true;
      doc.addEventListener("click", event => {
        const btn = event.target?.closest?.("button");
        const text = String(btn?.textContent || "").trim();
        if(text === "Revisies") setTimeout(() => hydrateRevisionModal("open-button"), 120);
        if(text.includes("Planning opslaan als revisie")) setTimeout(() => hydrateRevisionModal("after-save-button"), 700);
        if(text.includes("Print") || text.includes("Print A3")) setTimeout(installPrintAlignmentGuard, 60);
      }, true);
      if(doc.body instanceof Node){
        const observer = new MutationObserver(() => {
          installPrintAlignmentGuard();
          setTimeout(() => hydrateRevisionModal("mutation"), 120);
        });
        observer.observe(doc.body, { childList:true, subtree:true, attributes:true, attributeFilter:["class"] });
      }
    }
    return true;
  }

  window.CWS_SaveRevisionDirect = postRevision;
  window.CWS_HydrateRevisionModalFromD1 = hydrateRevisionModal;
  window.CWS_InstallGanttPrintAlignmentGuard = installPrintAlignmentGuard;
  window.addEventListener("beforeprint", installPrintAlignmentGuard);
  const timer = setInterval(() => { install(); }, 300);
  setTimeout(() => clearInterval(timer), 30000);
})();
