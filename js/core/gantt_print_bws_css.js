/* CWS Planning V140 - BWS A3 print renderer bridge for Layer 4 Gantt.
   Injects the single full-page SVG print renderer into the Gantt iframe. No data writes, no saves. */
(function(){
  const MARKER = "v140-bws-a3-fullpage-svg-renderer-bridge";
  const RENDERER_ID = "cwsBwsPrintA3RendererScript";
  const RENDERER_MARKER = "CWS_BWS_PRINT_A3_RENDERER_V140";
  const RENDERER_SRC = "/js/core/gantt_print_a3_bouwplanning.js?v=140";
  if (window.CWS_BWS_PRINT_CSS?.marker === MARKER) return;

  function isGanttFrame(frame){
    const href = String(frame?.contentWindow?.location?.href || frame?.src || "").toLowerCase();
    const title = String(document.getElementById("moduleTitle")?.textContent || "").toLowerCase();
    return href.includes("laag4_gantt") || title.includes("gantt");
  }

  function inject(){
    const frame = document.getElementById("appFrame");
    const doc = frame?.contentDocument;
    if (!doc || !doc.head || !isGanttFrame(frame)) return false;
    const oldScript = doc.getElementById(RENDERER_ID);
    if (oldScript && oldScript.getAttribute("data-cws-marker") !== RENDERER_MARKER) oldScript.remove();
    if (!doc.getElementById(RENDERER_ID) && doc.documentElement?.dataset?.cwsBwsPrintA3Renderer !== RENDERER_MARKER) {
      const script = doc.createElement("script");
      script.id = RENDERER_ID;
      script.src = RENDERER_SRC;
      script.setAttribute("data-cws-marker", RENDERER_MARKER);
      doc.head.appendChild(script);
    }
    doc.documentElement?.setAttribute("data-cws-bws-print", MARKER);
    return true;
  }

  inject();
  const timer = setInterval(inject, 350);
  setTimeout(() => clearInterval(timer), 90000);
  window.addEventListener("message", inject);
  window.addEventListener("focus", inject);
  document.getElementById("appFrame")?.addEventListener?.("load", () => setTimeout(inject, 80));
  window.CWS_BWS_PRINT_CSS = { marker: MARKER, inject, renderer: RENDERER_SRC };
})();