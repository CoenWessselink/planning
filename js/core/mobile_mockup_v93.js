const CWS_MobileMockupV93 = (() => {
  const STYLE_HREFS = ["css/mobile-mockup-v93.css", "css/mobile-mockup-v94.css", "css/mobile-mockup-v95.css", "css/mobile-mockup-v96.css", "css/mobile-nav-v97.css"];
  let observer = null;
  let lastRoute = "";

  const isMobile = () => window.innerWidth <= 767 || window.CWS_MobileAdapter?.profile?.().family === "mobile";

  function injectStylesheet(doc) {
    if (!doc?.head) return;
    STYLE_HREFS.forEach((href, index) => {
      const key = `cwsV${93 + index}MobileMockup`;
      if (doc.querySelector(`link[data-${key.replace(/[A-Z]/g, m => "-" + m.toLowerCase())}="true"]`)) return;
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = new URL(href, window.location.href).href;
      link.dataset[key] = "true";
      doc.head.appendChild(link);
    });
  }

  function removeLegacyDocks(doc) {
    if (!doc?.body) return;
    doc.querySelectorAll("#cwsV37MobileActionDock,.v37-mobile-action-dock,#cwsMobileToolbar,.mobile-toolbar.responsive-only").forEach(node => node.remove());
    doc.body.classList.add("cws-v93-no-legacy-mobile-dock");
  }

  function markModule(doc) {
    if (!doc?.body) return "";
    const route = window.Router?.getActiveApp?.() || window.CWS?.getState?.()?.ui?.lastApp || "";
    doc.documentElement.dataset.cwsV93MobileMockup = "true";
    doc.documentElement.dataset.cwsV94ScreenshotFix = "true";
    doc.documentElement.dataset.cwsV95FinalFit = "true";
    doc.documentElement.dataset.cwsV96StructuralFit = "true";
    doc.documentElement.dataset.cwsV97MobileNav = "true";
    doc.body.dataset.cwsV93MobileMockup = "true";
    doc.body.dataset.cwsV94ScreenshotFix = "true";
    doc.body.dataset.cwsV95FinalFit = "true";
    doc.body.dataset.cwsV96StructuralFit = "true";
    doc.body.dataset.cwsV97MobileNav = "true";
    doc.body.dataset.cwsActiveModule = route;
    doc.body.classList.add("cws-responsive-frame", "cws-v93-mobile-mockup", "cws-v94-screenshot-fix", "cws-v95-final-fit", "cws-v96-structural-fit", "cws-v97-mobile-nav");
    return route;
  }

  function resetFrameScrollIfRouteChanged(doc, route) {
    if (!isMobile() || !doc) return;
    if (route && route !== lastRoute) {
      try { doc.scrollingElement?.scrollTo({ top:0, left:0, behavior:"auto" }); } catch (_e) {}
      try { doc.documentElement.scrollTop = 0; doc.body.scrollTop = 0; } catch (_e) {}
      lastRoute = route;
    }
  }

  function fixIframeHeight() {
    const frame = document.getElementById("appFrame");
    if (!frame) return;
    const header = document.querySelector(".headerbar")?.getBoundingClientRect?.().height || 66;
    if (isMobile()) {
      const available = Math.max(420, Math.floor(window.innerHeight - header));
      frame.style.height = `${available}px`;
      frame.style.minHeight = `${available}px`;
      frame.style.maxHeight = `${available}px`;
      document.documentElement.style.setProperty("--cws-vh", `${window.innerHeight}px`);
      document.body.classList.add("cws-v93-mobile-shell", "cws-v94-screenshot-fix", "cws-v95-final-fit", "cws-v96-structural-fit", "cws-v97-mobile-nav");
    } else {
      frame.style.height = "calc(100vh - 140px)";
      frame.style.minHeight = "";
      frame.style.maxHeight = "";
      document.body.classList.remove("cws-v93-mobile-shell", "cws-v94-screenshot-fix", "cws-v95-final-fit", "cws-v96-structural-fit", "cws-v97-mobile-nav");
    }
  }

  function enhanceFrame() {
    fixIframeHeight();
    const frame = document.getElementById("appFrame");
    if (!frame?.contentDocument) return;
    try {
      const doc = frame.contentDocument;
      injectStylesheet(doc);
      const route = markModule(doc);
      removeLegacyDocks(doc);
      resetFrameScrollIfRouteChanged(doc, route);
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
    document.getElementById("appFrame")?.addEventListener("load", () => { lastRoute = ""; setTimeout(enhanceFrame, 40); });
  }

  return { bind, enhanceFrame };
})();
