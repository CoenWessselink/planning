const CWS_DefaultEmptyProjectFilter = (() => {
  let frameObserver = null;

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

  function clearTextProjectFilters(doc) {
    if (!doc?.body || hasExplicitProjectIntent()) return;
    const active = String(doc.body.dataset.cwsActiveModule || "").toLowerCase();
    const selectors = active === "projecten"
      ? ["#search", "#mobileProjectSearch", "#fuzzyQ", 'input[type="search"]']
      : ['input[type="search"][id*="project" i]', 'input[type="text"][id*="project" i]', 'input[placeholder*="project" i]'];
    doc.querySelectorAll(selectors.join(",")).forEach(input => {
      if (input.dataset.cwsDefaultEmptyCleared === "true") return;
      input.autocomplete = "off";
      input.dataset.cwsDefaultEmptyCleared = "true";
      if (String(input.value || "").trim()) {
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles:true }));
        input.dispatchEvent(new Event("change", { bubbles:true }));
      }
    });
  }

  function ensureBlankProjectSelect(select) {
    if (!select || select.dataset.cwsDefaultEmptyCleared === "true") return;
    const text = String(select.textContent || "").toLowerCase();
    const id = String(select.id || select.name || select.className || select.getAttribute("aria-label") || "").toLowerCase();
    const looksProject = select.classList?.contains("project") || id.includes("project") || text.includes("alle projecten") || text.includes("project");
    if (!looksProject) return;
    select.dataset.cwsDefaultEmptyCleared = "true";

    let blank = Array.from(select.options || []).find(o => String(o.value || "") === "" || /alle projecten/i.test(o.textContent || ""));
    if (!blank) {
      blank = select.ownerDocument.createElement("option");
      blank.value = "";
      blank.textContent = "Alle projecten";
      select.insertBefore(blank, select.firstChild || null);
    } else {
      blank.value = "";
      blank.textContent = /alle projecten/i.test(blank.textContent || "") ? blank.textContent : "Alle projecten";
      if (select.firstChild !== blank) select.insertBefore(blank, select.firstChild || null);
    }

    if (!hasExplicitProjectIntent() && select.value !== "") {
      select.value = "";
      select.dispatchEvent(new Event("input", { bubbles:true }));
      select.dispatchEvent(new Event("change", { bubbles:true }));
    }
  }

  function clearProjectSelects(doc) {
    if (!doc?.body) return;
    doc.querySelectorAll([
      "select.project",
      'select[id*="project" i]',
      'select[name*="project" i]',
      'select[aria-label*="project" i]',
      'select[data-filter*="project" i]'
    ].join(",")).forEach(ensureBlankProjectSelect);
  }

  function applyToDocument(doc) {
    try {
      clearTextProjectFilters(doc);
      clearProjectSelects(doc);
    } catch (_e) {}
  }

  function enhanceFrame() {
    const frame = document.getElementById("appFrame");
    if (!frame?.contentDocument) return;
    const doc = frame.contentDocument;
    applyToDocument(doc);
    if (frameObserver) frameObserver.disconnect();
    try {
      frameObserver = new MutationObserver(() => applyToDocument(doc));
      if (doc.body) frameObserver.observe(doc.body, { childList:true, subtree:true });
    } catch (_e) {}
  }

  function bind() {
    document.getElementById("appFrame")?.addEventListener("load", () => setTimeout(enhanceFrame, 120));
    document.addEventListener("cws:appchange", () => setTimeout(enhanceFrame, 160));
    setTimeout(enhanceFrame, 200);
  }

  return { bind, enhanceFrame };
})();
