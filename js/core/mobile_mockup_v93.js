const CWS_MobileMockupV93 = (() => {
  const STYLE_HREF = "css/mobile-mockup-v93.css";
  let observer = null;

  const isMobile = () => window.innerWidth <= 767 || window.CWS_MobileAdapter?.profile?.().family === "mobile";

  function injectStylesheet(doc) {
    if (!doc?.head) return;
    if (doc.querySelector('link[data-cws-v93-mobile-mockup="true"]')) return;
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL(STYLE_HREF, window.location.href).href;
    link.dataset.cwsV93MobileMockup = "true";
    doc.head.appendChild(link);
  }

  function removeLegacyDocks(doc) {
    if (!doc?.body) return;
    doc.querySelectorAll("#cwsV37MobileActionDock,.v37-mobile-action-dock,#cwsMobileToolbar,.mobile-toolbar.responsive-only").forEach(node => node.remove());
    doc.body.classList.add("cws-v93-no-legacy-mobile-dock");
  }

  function markModule(doc) {
    if (!doc?.body) return;
    const route = window.Router?.getActiveApp?.() || window.CWS?.getState?.()?.ui?.lastApp || "";
    doc.documentElement.dataset.cwsV93MobileMockup = "true";
    doc.body.dataset.cwsV93MobileMockup = "true";
    doc.body.dataset.cwsActiveModule = route;
    doc.body.classList.add("cws-responsive-frame", "cws-v93-mobile-mockup");
  }

  function fixIframeHeight() {
    const frame = document.getElementById("appFrame");
    if (!frame) return;
    const header = document.querySelector(".headerbar")?.getBoundingClientRect?.().height || 66;
    const nav = document.getElementById("mobileBottomNav")?.getBoundingClientRect?.().height || 86;
    if (isMobile()) {
      const available = Math.max(340, Math.floor(window.innerHeight - header - nav - 18));
      frame.style.height = `${available}px`;
      frame.style.minHeight = `${available}px`;
      frame.style.maxHeight = `${available}px`;
      document.documentElement.style.setProperty("--cws-vh", `${window.innerHeight}px`);
      document.body.classList.add("cws-v93-mobile-shell");
    } else {
      frame.style.height = "calc(100vh - 140px)";
      frame.style.minHeight = "";
      frame.style.maxHeight = "";
      document.body.classList.remove("cws-v93-mobile-shell");
    }
  }

  function enhanceFrame() {
    fixIframeHeight();
    const frame = document.getElementById("appFrame");
    if (!frame?.contentDocument) return;
    try {
      const doc = frame.contentDocument;
      injectStylesheet(doc);
      markModule(doc);
      removeLegacyDocks(doc);
      if (observer) observer.disconnect();
      observer = new MutationObserver(() => removeLegacyDocks(doc));
      if (doc.body) observer.observe(doc.body, { childList:true, subtree:true });
    } catch (_e) {}
  }

  function bind() {
    injectStylesheet(document);
    fixIframeHeight();
    enhanceFrame();
    window.addEventListener("resize", () => requestAnimationFrame(enhanceFrame), { passive:true });
    window.addEventListener("orientationchange", () => setTimeout(enhanceFrame, 120), { passive:true });
    document.addEventListener("cws:appchange", () => setTimeout(enhanceFrame, 80));
    document.getElementById("appFrame")?.addEventListener("load", () => setTimeout(enhanceFrame, 40));
  }

  return { bind, enhanceFrame };
})();
