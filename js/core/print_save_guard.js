/* CWS Planning V134 — block actual print saves, but never leave print mode stuck. */
(function(){
  const PRINT_MARKER = "v134-print-save-guard-auto-release";
  const REVISION_CAPACITY_MARKER = "v134-client-revision-capacity-strip";
  const PRINT_MAX_MS = 12000;
  let printTimer = null;

  window.CWS_PRINT_ACTIVE = Boolean(window.CWS_PRINT_ACTIVE && false);

  const frameIsPrinting = () => {
    try {
      const frame = document.getElementById("appFrame");
      const body = frame?.contentDocument?.body;
      return Boolean(body?.classList?.contains("printing") || body?.classList?.contains("cap-printing"));
    } catch (_) {
      return false;
    }
  };

  const clearFramePrintClasses = () => {
    try {
      const frame = document.getElementById("appFrame");
      frame?.contentDocument?.body?.classList?.remove("printing", "cap-printing");
    } catch (_) {}
  };

  const setPrintActive = (active, reason="print") => {
    window.CWS_PRINT_ACTIVE = Boolean(active);
    if (printTimer) {
      clearTimeout(printTimer);
      printTimer = null;
    }
    if (active) {
      printTimer = setTimeout(() => setPrintActive(false, "auto-release-timeout"), PRINT_MAX_MS);
    } else {
      clearFramePrintClasses();
      document.body?.classList?.remove("printing", "cap-printing");
    }
    try {
      window.CWS = window.CWS || {};
      if (window.CWS.storageStatus) {
        window.CWS.storageStatus.printActive = Boolean(active);
        window.CWS.storageStatus.printGuardMarker = PRINT_MARKER;
        window.CWS.storageStatus.printGuardReason = reason;
        if (!active) window.CWS.storageStatus.lastPrintGuardReleasedAt = new Date().toISOString();
      }
    } catch (_) {}
  };

  const isPrinting = () => Boolean(window.CWS_PRINT_ACTIVE || document.body?.classList?.contains("printing") || frameIsPrinting());

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
  window.CWS_ClearPrintActive = () => setPrintActive(false, "manual-clear");
  window.addEventListener("beforeprint", () => setPrintActive(true, "beforeprint"));
  window.addEventListener("afterprint", () => setPrintActive(false, "afterprint"));
  window.addEventListener("focus", () => setTimeout(() => setPrintActive(false, "window-focus"), 500));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) setTimeout(() => setPrintActive(false, "visibility-return"), 500);
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") setPrintActive(false, "escape");
  }, true);

  const install = () => {
    if (!window.CWS?.storage) return false;

    if (!window.CWS.storage.__v134PrintGuardInstalled) {
      const originalSave = window.CWS.storage.save;
      if (typeof originalSave !== "function") return false;
      window.CWS.storage.save = async function(snapshot){
        if (isPrinting()) {
          if (window.CWS_PRINT_ACTIVE && !frameIsPrinting() && !document.body?.classList?.contains("printing")) {
            setPrintActive(false, "stale-active-reset-before-save");
          }
        }
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
      window.CWS.storage.__v134PrintGuardInstalled = true;
      window.CWS.storage.__v134PrintGuardMarker = PRINT_MARKER;
    }

    if (window.CWS?.gantt && !window.CWS.gantt.__v134RevisionCapacityGuardInstalled) {
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
        window.CWS.gantt.__v134RevisionCapacityGuardInstalled = true;
        window.CWS.gantt.__v134RevisionCapacityGuardMarker = REVISION_CAPACITY_MARKER;
      }
    }

    return Boolean(window.CWS.storage.__v134PrintGuardInstalled);
  };

  const timer = setInterval(() => {
    if (install()) clearInterval(timer);
  }, 100);
  setTimeout(() => clearInterval(timer), 20000);
  setTimeout(() => setPrintActive(false, "boot-clear"), 250);
})();
