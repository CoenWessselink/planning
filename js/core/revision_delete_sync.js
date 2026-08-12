/* CWS Planning V105 — direct D1 delete for Gantt revisions. */
(function(){
  const MARKER = "v105-direct-revision-delete";
  const seen = new Set();

  async function deleteRevision(projectId, revisionId){
    if(!projectId || !revisionId) return;
    const key = `${projectId}/${revisionId}/${Date.now()}`;
    seen.add(key);
    try{
      const res = await fetch(`/api/revision-delete?projectId=${encodeURIComponent(projectId)}&revisionId=${encodeURIComponent(revisionId)}`, {
        method:"DELETE",
        headers:{ "Accept":"application/json" }
      });
      const data = await res.json().catch(()=>({}));
      if(!res.ok || !data.ok) throw new Error(data.error || `Revisie direct verwijderen mislukt (${res.status}).`);
      try{
        window.CWS = window.CWS || {};
        if(window.CWS.storageStatus){
          window.CWS.storageStatus.lastDirectRevisionDeleteAt = new Date().toISOString();
          window.CWS.storageStatus.lastDirectRevisionDelete = { projectId, revisionId, marker:MARKER };
        }
      }catch(_){}
    }catch(error){
      console.warn("CWS direct revision delete failed", error);
      try{
        window.CWS = window.CWS || {};
        if(window.CWS.storageStatus){
          window.CWS.storageStatus.unsynced = true;
          window.CWS.storageStatus.lastError = error.message;
          window.CWS.storageStatus.lastDirectRevisionDeleteError = { projectId, revisionId, message:error.message, marker:MARKER };
        }
      }catch(_){}
    }
  }

  function installForFrame(){
    const frame = document.getElementById("appFrame");
    const win = frame?.contentWindow;
    const doc = frame?.contentDocument;
    if(!win || !doc || doc.__v105RevisionDeleteSyncInstalled) return;
    doc.__v105RevisionDeleteSyncInstalled = true;

    const nativeConfirm = win.confirm ? win.confirm.bind(win) : window.confirm.bind(window);
    win.__cwsLastRevisionDeleteConfirm = null;
    win.confirm = function(message){
      const text = String(message || "");
      const result = nativeConfirm(message);
      if(text.includes("Revisie") && text.includes("definitief verwijderen")){
        win.__cwsLastRevisionDeleteConfirm = { result, at:Date.now(), message:text };
      }
      return result;
    };

    doc.addEventListener("click", (event) => {
      const btn = event.target?.closest?.('button[data-rev-action="delete"]');
      if(!btn) return;
      const tr = btn.closest("tr[data-rev]");
      const revisionId = tr?.dataset?.rev || "";
      const projectId = doc.getElementById("projectSel")?.value || doc.getElementById("mobileProjectSel")?.value || "";
      if(!projectId || !revisionId) return;
      setTimeout(() => {
        const confirmState = win.__cwsLastRevisionDeleteConfirm;
        const confirmed = Boolean(confirmState?.result && Date.now() - Number(confirmState.at || 0) < 5000);
        if(confirmed) deleteRevision(projectId, revisionId);
      }, 0);
    }, true);
  }

  window.CWS_DeleteRevisionDirect = deleteRevision;
  window.addEventListener("load", installForFrame);
  setInterval(installForFrame, 1000);
})();
