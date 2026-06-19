const CWS_UiStylesLoader = (() => {
  const files = [
    "css/ui/00-tokens.css",
    "css/ui/01-reset.css",
    "css/ui/02-shell-apps.css",
    "css/ui/03-components.css",
    "css/ui/04-mobile-nav.css",
    "css/ui/05-mobile-dashboard-projects.css",
    "css/ui/06-mobile-gantt-capacity.css",
    "css/ui/10-print.css"
  ];
  let observer = null;

  function addLinks(doc) {
    if (!doc?.head) return;
    files.forEach((href, index) => {
      const attr = `data-cws-ui-file-${index}`;
      if (doc.querySelector(`link[${attr}="true"]`)) return;
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = new URL(href, window.location.href).href;
      link.setAttribute(attr, "true");
      doc.head.appendChild(link);
    });
  }

  function mark(doc) {
    if (!doc?.body || !doc.documentElement) return;
    doc.documentElement.dataset.cwsCleanUi = "true";
    doc.body.dataset.cwsCleanUi = "true";
    doc.body.classList.add("cws-responsive-frame", "cws-clean-ui");
  }

  function applyToFrame() {
    const frame = document.getElementById("appFrame");
    if (!frame?.contentDocument) return;
    try {
      const doc = frame.contentDocument;
      addLinks(doc);
      mark(doc);
      if (observer) observer.disconnect();
      observer = new MutationObserver(() => mark(doc));
      if (doc.body) observer.observe(doc.body, { childList:true, subtree:true });
    } catch (_e) {}
  }

  function bind() {
    addLinks(document);
    document.getElementById("appFrame")?.addEventListener("load", () => setTimeout(applyToFrame, 30));
    document.addEventListener("cws:appchange", () => setTimeout(applyToFrame, 60));
    setTimeout(applyToFrame, 120);
  }

  return { bind, applyToFrame };
})();
