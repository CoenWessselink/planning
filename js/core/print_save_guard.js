/* CWS Planning V105 — block remote saves while print mode is active. */
(function(){
  const MARKER = "v105-print-save-guard";
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
        window.CWS.storageStatus.printGuardMarker = MARKER;
        window.CWS.storageStatus.printGuardReason = reason;
      }
    } catch (_) {}
  };

  window.CWS_SetPrintActive = setPrintActive;
  window.addEventListener("beforeprint", () => setPrintActive(true, "beforeprint"));
  window.addEventListener("afterprint", () => setPrintActive(false, "afterprint"));

  const install = () => {
    if (!window.CWS?.storage || window.CWS.storage.__v105PrintGuardInstalled) return Boolean(window.CWS?.storage?.__v105PrintGuardInstalled);
    const originalSave = window.CWS.storage.save;
    if (typeof originalSave !== "function") return false;
    window.CWS.storage.save = async function(snapshot){
      if (isPrinting()) {
        const error = new Error("Remote save geblokkeerd: printmodus is actief.");
        error.cwsGuard = MARKER;
        error.status = 423;
        try {
          window.CWS.storageStatus = window.CWS.storageStatus || {};
          window.CWS.storageStatus.savesBlockedDuringPrint = Number(window.CWS.storageStatus.savesBlockedDuringPrint || 0) + 1;
          window.CWS.storageStatus.printGuardMarker = MARKER;
          window.CWS.storageStatus.lastPrintSaveBlockedAt = new Date().toISOString();
        } catch (_) {}
        throw error;
      }
      return originalSave.call(this, snapshot);
    };
    window.CWS.storage.__v105PrintGuardInstalled = true;
    window.CWS.storage.__v105PrintGuardMarker = MARKER;
    return true;
  };

  const timer = setInterval(() => {
    if (install()) clearInterval(timer);
  }, 100);
  setTimeout(() => clearInterval(timer), 20000);
})();
