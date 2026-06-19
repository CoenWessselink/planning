const CWS_DefaultEmptyProjectFilter = (() => {
  let frameObserver = null;
  let forceTimer = null;
  let forceUntil = 0;
  let userTouched = false;

  function activeModule(doc) {
    return String(doc?.body?.dataset?.cwsActiveModule || window.Router?.getActiveApp?.() || window.CWS?.getState?.()?.ui?.lastApp || "").toLowerCase();
  }

  function hasExplicitProjectIntent() {
    try {
      const st = window.CWS?.getState?.();
      const target = st?.ui?.globalSearchTarget;
      if (target?.module && target?.projectId) return true;
      const qs = new URLSearchParams(window.location.search || "");
      if (qs.get("project") || qs.get("projectId")) return true;
    } catch (_e) {}
    return false;
  }

  function clearStateProjectSelection(doc) {
    if (hasExplicitProjectIntent() || userTouched) return;
    const active = activeModule(doc);
    if (!["gantt", "capaciteit"].includes(active)) return;
    try {
      window.CWS?.setState?.(s => {
        s.ui = s.ui || {};
        s.ui.activeProjectId = "";
        s.ui.lastProjectId = "";
        s.ui.projectId = "";
        s.ui.selectedProjectId = "";
        s.ui.globalSearchTarget = null;
        s.ganttV2 = s.ganttV2 || { byProject:{}, ui:{} };
        s.ganttV2.ui = s.ganttV2.ui || {};
        s.ganttV2.ui.projectId = "";
        s.ganttV2.ui.selectedProjectId = "";
        return s;
      });
    } catch (_e) {}
  }

  function fireSilentChange(el) {
    el.dispatchEvent(new Event("input", { bubbles:true }));
    el.dispatchEvent(new Event("change", { bubbles:true }));
  }

  function clearTextProjectFilters(doc) {
    if (!doc?.body || hasExplicitProjectIntent() || userTouched) return;
    const active = activeModule(doc);
    const selectors = active === "projecten"
      ? ["#search", "#mobileProjectSearch", "#fuzzyQ", 'input[type="search"]']
      : ['#projectSearch', 'input[type="search"][id*="project" i]', 'input[type="text"][id*="project" i]', 'input[placeholder*="project" i]'];
    doc.querySelectorAll(selectors.join(",")).forEach(input => {
      input.autocomplete = "off";
      if (input.dataset.cwsUserTouched !== "true") {
        input.addEventListener("pointerdown", () => { userTouched = true; input.dataset.cwsUserTouched = "true"; }, { once:true });
        input.addEventListener("keydown", () => { userTouched = true; input.dataset.cwsUserTouched = "true"; }, { once:true });
      }
      if (!userTouched && String(input.value || "").trim()) {
        input.value = "";
        input.title = "Alle projecten";
        input.placeholder = input.id === "projectSearch" ? "Alle projecten" : (input.placeholder || "");
        fireSilentChange(input);
      }
    });
  }

  function ensureBlankProjectSelect(select) {
    if (!select) return;
    const text = String(select.textContent || "").toLowerCase();
    const id = String(select.id || select.name || select.className || select.getAttribute("aria-label") || "").toLowerCase();
    const looksProject = select.classList?.contains("project") || id.includes("project") || text.includes("alle projecten") || text.includes("project");
    if (!looksProject) return;

    let blank = Array.from(select.options || []).find(o => String(o.value || "") === "" || /alle projecten/i.test(o.textContent || ""));
    if (!blank) {
      blank = select.ownerDocument.createElement("option");
      blank.value = "";
      blank.textContent = "Alle projecten";
      select.insertBefore(blank, select.firstChild || null);
    } else {
      blank.value = "";
      blank.textContent = "Alle projecten";
      if (select.firstChild !== blank) select.insertBefore(blank, select.firstChild || null);
    }

    if (select.dataset.cwsUserTouched !== "true") {
      select.addEventListener("pointerdown", () => { userTouched = true; select.dataset.cwsUserTouched = "true"; }, { once:true });
      select.addEventListener("keydown", () => { userTouched = true; select.dataset.cwsUserTouched = "true"; }, { once:true });
    }

    if (!hasExplicitProjectIntent() && !userTouched && select.value !== "") {
      select.value = "";
      select.selectedIndex = 0;
      fireSilentChange(select);
    }
  }

  function clearProjectSelects(doc) {
    if (!doc?.body) return;
    doc.querySelectorAll([
      "#mobileProjectSel",
      "#projectSel",
      "select.project",
      'select[id*="project" i]',
      'select[name*="project" i]',
      'select[aria-label*="project" i]',
      'select[data-filter*="project" i]'
    ].join(",")).forEach(ensureBlankProjectSelect);
  }

  function patchGanttVisualDefaults(doc) {
    if (!doc?.body || hasExplicitProjectIntent() || userTouched) return;
    if (activeModule(doc) !== "gantt") return;
    const input = doc.querySelector("#projectSearch");
    if (input) {
      input.value = "";
      input.placeholder = "Alle projecten";
      input.title = "Alle projecten";
    }
    const mobile = doc.querySelector("#mobileProjectSel");
    if (mobile) ensureBlankProjectSelect(mobile);
    const native = doc.querySelector("#projectSel");
    if (native) ensureBlankProjectSelect(native);
  }

  function applyToDocument(doc) {
    try {
      clearStateProjectSelection(doc);
      clearTextProjectFilters(doc);
      clearProjectSelects(doc);
      patchGanttVisualDefaults(doc);
    } catch (_e) {}
  }

  function forceForAWhile(doc) {
    if (forceTimer) clearInterval(forceTimer);
    forceUntil = Date.now() + 15000;
    forceTimer = setInterval(() => {
      applyToDocument(doc);
      if (Date.now() > forceUntil || userTouched) {
        clearInterval(forceTimer);
        forceTimer = null;
      }
    }, 80);
  }

  function enhanceFrame() {
    const frame = document.getElementById("appFrame");
    if (!frame?.contentDocument) return;
    const doc = frame.contentDocument;
    userTouched = false;
    applyToDocument(doc);
    forceForAWhile(doc);
    if (frameObserver) frameObserver.disconnect();
    try {
      frameObserver = new MutationObserver(() => applyToDocument(doc));
      if (doc.body) frameObserver.observe(doc.body, { childList:true, subtree:true, attributes:true, attributeFilter:["value", "selected", "data-cws-active-module"] });
    } catch (_e) {}
  }

  function bind() {
    document.getElementById("appFrame")?.addEventListener("load", () => setTimeout(enhanceFrame, 80));
    document.addEventListener("cws:appchange", () => setTimeout(enhanceFrame, 120));
    setTimeout(enhanceFrame, 200);
  }

  return { bind, enhanceFrame };
})();
