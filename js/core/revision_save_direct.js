/* CWS Planning V108 — save Gantt revisions directly to D1 and bypass heavy /api/state for revision-only saves. */
(function(){
  const MARKER = "v108-direct-revision-save";
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

  async function postRevision(projectId, revision){
    if(!projectId || !revision?.id) return { ok:false, error:"projectId/revision ontbreekt" };
    const key = `${projectId}/${revision.id}`;
    if(posted.has(key) || revision._directSaved || revision._durableRevision) return { ok:true, skipped:true };
    const body = {
      projectId:String(projectId),
      revision:{
        ...revision,
        snapshot:cleanSnapshot(revision.snapshot || {})
      }
    };
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
    if(!window.CWS?.gantt || window.CWS.gantt.__v108DirectRevisionSaveInstalled) return Boolean(window.CWS?.gantt?.__v108DirectRevisionSaveInstalled);
    const original = window.CWS.gantt.saveProjectGantt;
    if(typeof original !== "function") return false;

    window.CWS.gantt.saveProjectGantt = function(projectId, model, mutationMeta){
      const unsavedRevision = findUnsavedRevision(model);
      const looksLikeRevisionOnly = Boolean(unsavedRevision && (!mutationMeta || Object.keys(mutationMeta || {}).length === 0));
      if(looksLikeRevisionOnly){
        unsavedRevision.snapshot = cleanSnapshot(unsavedRevision.snapshot || {});
        postRevision(projectId, unsavedRevision).then(() => {
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

    window.CWS.gantt.__v108DirectRevisionSaveInstalled = true;
    window.CWS.gantt.__v108DirectRevisionSaveMarker = MARKER;
    return true;
  }

  window.CWS_SaveRevisionDirect = postRevision;
  const timer = setInterval(() => { if(install()) clearInterval(timer); }, 100);
  setTimeout(() => clearInterval(timer), 20000);
})();
