/* CWS Planning V106 — block print saves and strip derived capacity from revision snapshots before client save. */
(function(){
  const PRINT_MARKER = "v105-print-save-guard";
  const REVISION_CAPACITY_MARKER = "v106-client-revision-capacity-strip";
  window.CWS_PRINT_ACTIVE = window.CWS_PRINT_ACTIVE || false;

  const frameIsPrinting = () => {
    try {
      const frame = document.getElementById("appFrame");
      const body = frame?.contentDocument?.body;
      return Boolean(body?.classList?.contains("printing") || body?.classList?.contains("cap-printing"));
    } catch (_) {
      return false;
    }
  };

  const isPrinting = () => Boolean(window.CWS_PRINT_ACTIVE || document.body?.classList?.contains("printing") || frameIsPrinting());

  const setPrintActive = (active, reason="print") => {
    window.CWS_PRINT_ACTIVE = Boolean(active);
    try {
      window.CWS = window.CWS || {};
      if (window.CWS.storageStatus) {
        window.CWS.storageStatus.printActive = Boolean(active);
        window.CWS.storageStatus.printGuardMarker = PRINT_MARKER;
        window.CWS.storageStatus.printGuardReason = reason;
      }
    } catch (_) {}
  };

  const stripDerivedCapacityFromRevisionSnapshot = (snapshot) => {
    if (!snapshot || typeof snapshot !== "object") return snapshot || {};
    delete snapshot.capacity;
    delete snapshot.gantt;
    delete snapshot.hoursByDay;
    delete snapshot.sourcesByDay;
    delete snapshot.projectDeptHoursValidation;
    snapshot.meta = snapshot.meta && typeof snapshot.meta === "object" ? snapshot.meta : {};
    snapshot.meta.capacityExcludedFromRevision = true;
    snapshot.meta.capacityRevisionIsolation = REVISION_CAPACITY_MARKER;
    return snapshot;
  };

  const sanitizeRevisionObject = (revision) => {
    if (!revision || typeof revision !== "object") return revision;
    revision.snapshot = stripDerivedCapacityFromRevisionSnapshot(revision.snapshot || {});
    return revision;
  };

  const sanitizeGanttModel = (model) => {
    if (!model || typeof model !== "object") return model;
    if (Array.isArray(model.revisions)) model.revisions = model.revisions.map(sanitizeRevisionObject);
    return model;
  };

  const sanitizeStateRevisionSnapshots = (state) => {
    const byProject = state?.ganttV2?.byProject;
    if (!byProject || typeof byProject !== "object") return state;
    Object.values(byProject).forEach(sanitizeGanttModel);
    state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};
    state.meta.capacityExcludedFromRevisionSnapshotsClient = true;
    state.meta.capacityRevisionIsolationClient = REVISION_CAPACITY_MARKER;
    return state;
  };

  window.CWS_StripRevisionCapacity = sanitizeStateRevisionSnapshots;
  window.CWS_SetPrintActive = setPrintActive;
  window.addEventListener("beforeprint", () => setPrintActive(true, "beforeprint"));
  window.addEventListener("afterprint", () => setPrintActive(false, "afterprint"));

  const install = () => {
    if (!window.CWS?.storage) return false;

    if (!window.CWS.storage.__v105PrintGuardInstalled) {
      const originalSave = window.CWS.storage.save;
      if (typeof originalSave !== "function") return false;
      window.CWS.storage.save = async function(snapshot){
        if (isPrinting()) {
          const error = new Error("Remote save geblokkeerd: printmodus is actief.");
          error.cwsGuard = PRINT_MARKER;
          error.status = 423;
          try {
            window.CWS.storageStatus = window.CWS.storageStatus || {};
            window.CWS.storageStatus.savesBlockedDuringPrint = Number(window.CWS.storageStatus.savesBlockedDuringPrint || 0) + 1;
            window.CWS.storageStatus.printGuardMarker = PRINT_MARKER;
            window.CWS.storageStatus.lastPrintSaveBlockedAt = new Date().toISOString();
          } catch (_) {}
          throw error;
        }
        if (snapshot?.state) sanitizeStateRevisionSnapshots(snapshot.state);
        return originalSave.call(this, snapshot);
      };
      window.CWS.storage.__v105PrintGuardInstalled = true;
      window.CWS.storage.__v105PrintGuardMarker = PRINT_MARKER;
    }

    if (window.CWS?.gantt && !window.CWS.gantt.__v106RevisionCapacityGuardInstalled) {
      const originalSaveProjectGantt = window.CWS.gantt.saveProjectGantt;
      if (typeof originalSaveProjectGantt === "function") {
        window.CWS.gantt.saveProjectGantt = function(projectId, model, mutationMeta){
          sanitizeGanttModel(model);
          try {
            window.CWS.storageStatus = window.CWS.storageStatus || {};
            window.CWS.storageStatus.revisionCapacityGuardMarker = REVISION_CAPACITY_MARKER;
            window.CWS.storageStatus.lastRevisionCapacityStripAt = new Date().toISOString();
          } catch (_) {}
          return originalSaveProjectGantt.call(this, projectId, model, mutationMeta);
        };
        window.CWS.gantt.__v106RevisionCapacityGuardInstalled = true;
        window.CWS.gantt.__v106RevisionCapacityGuardMarker = REVISION_CAPACITY_MARKER;
      }
    }

    return Boolean(window.CWS.storage.__v105PrintGuardInstalled);
  };

  const timer = setInterval(() => {
    if (install()) clearInterval(timer);
  }, 100);
  setTimeout(() => clearInterval(timer), 20000);
})();
