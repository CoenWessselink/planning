const CWS_MobileAdapter = (() => {
  const DEVICE_CLASSES = ["is-mobile", "is-tablet", "is-desktop", "is-touch"];
  let resizeQueued = false;
  let frameObserver = null;

  function profile(width = window.innerWidth) {
    if (width <= 430) return { family:"mobile", viewport:"mobile-small" };
    if (width <= 767) return { family:"mobile", viewport:"mobile-wide" };
    if (width <= 899) return { family:"tablet", viewport:"tablet-portrait" };
    if (width <= 1199) return { family:"tablet", viewport:"tablet-landscape" };
    return { family:"desktop", viewport:"desktop" };
  }

  function isTouchDevice(targetWindow = window) {
    return Boolean(
      targetWindow.matchMedia?.("(pointer: coarse)")?.matches ||
      targetWindow.navigator?.maxTouchPoints > 0
    );
  }

  function applyClasses(doc, width = window.innerWidth, touch = isTouchDevice()) {
    if (!doc?.body || !doc.documentElement) return;
    const current = profile(width);
    [doc.documentElement, doc.body].forEach(node => {
      node.classList.remove(...DEVICE_CLASSES);
      node.classList.add(`is-${current.family}`);
      if (touch) node.classList.add("is-touch");
      node.dataset.cwsV73Viewport = current.viewport;
      node.dataset.cwsV73Responsive = "true";
    });
  }

  function ensureStylesheet(doc) {
    if (!doc?.head || doc.querySelector('link[data-cws-v73-responsive="true"]')) return;
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("css/responsive-v73.css", window.location.href).href;
    link.dataset.cwsV73Responsive = "true";
    doc.head.appendChild(link);
  }

  function improveAccessibility(doc) {
    doc.querySelectorAll(".modal, .dialog, .drawer, .cws-modal").forEach(dialog => {
      if (!dialog.hasAttribute("role")) dialog.setAttribute("role", "dialog");
      if (!dialog.hasAttribute("aria-modal")) dialog.setAttribute("aria-modal", "true");
    });
    doc.querySelectorAll("button").forEach(button => {
      if (button.getAttribute("aria-label") || button.textContent.trim()) return;
      const title = button.getAttribute("title");
      if (title) button.setAttribute("aria-label", title);
    });
  }

  function markScrollContainers(doc) {
    doc.querySelectorAll([
      ".table-wrap", ".tablewrap", ".matrix-wrap", ".heatmap-wrap",
      ".board-wrap", ".rep-right", ".assign-right", ".pb-right",
      ".tabs", ".tabs360", ".toolbar", ".buttonbar", ".filterbar"
    ].join(",")).forEach(element => element.classList.add("v73-scroll-container"));
  }

  function ensureGanttFallback(doc) {
    const shell = doc.querySelector(".gantt-shell");
    if (!shell || shell.querySelector(".v73-gantt-mobile-hint")) return;
    const hint = doc.createElement("div");
    hint.className = "v73-gantt-mobile-hint";
    hint.setAttribute("role", "note");
    hint.textContent = "Op mobiel: tik een taak aan om datums en duur te wijzigen. Sleep het diagram horizontaal om de planning te bekijken.";
    const toolbar = shell.querySelector(".toolbar");
    toolbar?.insertAdjacentElement("afterend", hint);
  }

  function enhanceDocument(doc, width = window.innerWidth) {
    if (!doc?.body) return;
    ensureStylesheet(doc);
    applyClasses(doc, width, isTouchDevice());
    markScrollContainers(doc);
    improveAccessibility(doc);
    ensureGanttFallback(doc);
  }

  function enhanceFrame() {
    const frame = document.getElementById("appFrame");
    if (!frame?.contentDocument) return;
    try {
      enhanceDocument(frame.contentDocument, window.innerWidth);
      if (!frameObserver) {
        frameObserver = new MutationObserver(() => {
          if (resizeQueued) return;
          resizeQueued = true;
          requestAnimationFrame(() => {
            resizeQueued = false;
            try { enhanceDocument(frame.contentDocument, window.innerWidth); } catch {}
          });
        });
      }
      frameObserver.disconnect();
      const frameBody = frame.contentDocument?.body;
      if(frameBody instanceof Node) frameObserver.observe(frameBody, { childList:true, subtree:true });
    } catch {}
  }

  function apply() {
    applyClasses(document);
    enhanceFrame();
  }

  function queueApply() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      apply();
    });
  }

  function bind() {
    apply();
    window.addEventListener("resize", queueApply, { passive:true });
    window.addEventListener("orientationchange", queueApply, { passive:true });
    document.getElementById("appFrame")?.addEventListener("load", () => requestAnimationFrame(enhanceFrame));
    document.addEventListener("cws:appchange", () => setTimeout(enhanceFrame, 60));
  }

  return { bind, apply, enhanceDocument, profile };
})();
