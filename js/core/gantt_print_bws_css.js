/* CWS Planning V135 - BWS-style print CSS for Layer 4 Gantt.
   This module only injects print CSS into the Gantt iframe. It does not change data or save logic. */
(function(){
  const MARKER = "v135-bws-style-gantt-print-css";
  const STYLE_ID = "cws-bws-gantt-print-css-v135";
  if (window.CWS_BWS_PRINT_CSS?.marker === MARKER) return;

  const css = `
@media print{
  @page{size:A3 landscape;margin:6mm}
  :root{--rowH:4.75mm!important;--headH:15mm!important;--dayW:2.1mm!important;--leftW:96mm!important}
  html,body{height:auto!important;margin:0!important;padding:0!important;background:#fff!important;color:#000!important;font-family:Arial,Helvetica,sans-serif!important;font-size:6px!important;line-height:1.1!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;overflow:visible!important}
  body{padding:0!important}
  .gantt-shell{border:3px solid #111!important;border-radius:0!important;box-shadow:none!important;background:#fff!important;overflow:visible!important;padding:2mm!important;page-break-inside:avoid!important}
  .module-head{display:grid!important;grid-template-columns:36mm 1fr 100mm!important;align-items:stretch!important;gap:0!important;min-height:16mm!important;margin:0 0 1.5mm 0!important;padding:0!important;border:2px solid #111!important;background:#fff!important}
  .module-head:before{content:"CWS\\A PLANNING";white-space:pre;display:flex!important;align-items:center!important;justify-content:center!important;border-right:2px solid #111!important;color:#169d9d!important;font-size:14px!important;line-height:.95!important;font-weight:950!important;letter-spacing:.8px!important;text-align:center!important}
  .module-head>div:first-child{display:flex!important;flex-direction:column!important;justify-content:center!important;text-align:center!important;padding:1mm 3mm!important}
  .module-head h1{font-size:10px!important;margin:0 0 1mm 0!important;color:#000!important;font-weight:900!important;text-align:center!important}
  .module-head p{font-size:6px!important;color:#111!important;margin:0!important;text-align:center!important}
  .module-head .status{display:grid!important;grid-template-columns:1fr 1fr!important;gap:0!important;align-items:stretch!important;border-left:2px solid #111!important;background:#fff!important}
  .module-head .badge{border:0!important;border-bottom:1px solid #111!important;border-right:1px solid #111!important;border-radius:0!important;background:#fff!important;color:#000!important;font-size:5.6px!important;font-weight:700!important;padding:1px 2px!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;white-space:nowrap!important;min-height:3.8mm!important}
  .toolbar,.notice,.context,.toast,.gantt-context-menu,.modalback{display:none!important}
  .meta-line{display:block!important;text-align:right!important;color:#000!important;font-size:5.5px!important;padding:0 0 1mm 0!important}
  .board-wrap{margin:0!important;border:2px solid #111!important;border-radius:0!important;box-shadow:none!important;overflow:visible!important;background:#fff!important}
  .board{display:grid!important;grid-template-columns:var(--leftW) max-content!important;min-width:0!important;width:max-content!important;background:#fff!important}
  .table-pane{position:relative!important;left:auto!important;z-index:5!important;background:#fff!important;border-right:2px solid #111!important;box-shadow:none!important;width:var(--leftW)!important;max-width:var(--leftW)!important;overflow:hidden!important}
  .chart-pane{min-width:0!important;overflow:visible!important;background:#fff!important}
  .gantt-table{width:var(--leftW)!important;table-layout:fixed!important;border-collapse:collapse!important;border-spacing:0!important;font-size:5.7px!important;color:#000!important}
  .gantt-table th,.gantt-table td{border-right:1px solid #111!important;border-bottom:1px solid #777!important;background:#f6f6f6!important;color:#000!important;height:var(--rowH)!important;max-height:var(--rowH)!important;padding:0 1.2mm!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;vertical-align:middle!important}
  .gantt-table thead th{height:var(--headH)!important;max-height:var(--headH)!important;border-bottom:2px solid #111!important;background:#f2f2f2!important;font-size:5.7px!important;font-weight:900!important;vertical-align:bottom!important;text-align:left!important}
  .gantt-table tbody tr:nth-child(even) td{background:#ededed!important}
  .gantt-table tbody tr.summary td,.gantt-table tbody tr.phase td{background:#63c9c8!important;font-weight:900!important;text-transform:uppercase!important}
  .gantt-table th:nth-child(1),.gantt-table td:nth-child(1),.gantt-table th:nth-child(n+5),.gantt-table td:nth-child(n+5){display:none!important}
  .gantt-table th:nth-child(2),.gantt-table td:nth-child(2){width:12mm!important;text-align:center!important}
  .gantt-table th:nth-child(3),.gantt-table td:nth-child(3){width:58mm!important}
  .gantt-table th:nth-child(4),.gantt-table td:nth-child(4){width:26mm!important}
  .taskcell{min-width:0!important;width:100%!important;gap:1px!important}.twisty{width:3mm!important}.taskname,.cellinput,.resource-select,.dept-select,.color-select{height:var(--rowH)!important;min-width:0!important;width:100%!important;border:0!important;background:transparent!important;color:#000!important;font-size:5.7px!important;font-weight:700!important;padding:0!important}.iconbtn,.row-actions,.handle{display:none!important}
  .timeline{height:var(--headH)!important;position:relative!important;top:auto!important;z-index:4!important;background:#fff!important;border-bottom:2px solid #111!important;display:grid!important;grid-template-rows:5mm 5mm 5mm!important;min-width:max-content!important}
  .tl-row{display:grid!important;min-width:max-content!important}.tl-cell{height:auto!important;border-right:1px solid #111!important;border-bottom:1px solid #111!important;background:#fff!important;color:#000!important;font-size:5px!important;font-weight:800!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important;white-space:nowrap!important}.tl-cell.day{font-size:4.7px!important;line-height:1!important;flex-direction:column!important}.tl-cell.day.weekend{background:#d9d9d9!important;color:#000!important}.tl-cell.today{background:#fff!important;color:#c00000!important;border-left:2px solid #e00000!important}.tl-cell:first-child,.tl-cell.month-start,.tl-cell.week-start{border-left:2px solid #111!important}
  .lane{height:var(--rowH)!important;border-bottom:1px solid #b5b5b5!important;background-color:#fff!important;background-image:linear-gradient(to right,#9b9b9b 1px,transparent 1px),linear-gradient(to right,rgba(0,0,0,.11) 0,rgba(0,0,0,.11) 100%)!important;background-size:var(--dayW) 100%,calc(var(--dayW) * 7) 100%!important;background-repeat:repeat,repeat!important;overflow:visible!important}
  .lane:nth-child(even){background-color:#f6f6f6!important}.nonwork-shade{background:rgba(0,0,0,.12)!important;border-left:1px solid #777!important;border-right:1px solid #777!important}.day-grid-line{border-left:1px dotted #8d8d8d!important}.week-grid-line{border-left:2px solid #111!important}.month-grid-line{border-left:3px solid #111!important}
  .bar{top:.7mm!important;height:3.25mm!important;border:1.2px solid #111!important;border-radius:1.2mm!important;box-shadow:none!important;color:#000!important;font-size:5.4px!important;font-weight:900!important;padding:0 1.2mm!important;overflow:visible!important;white-space:nowrap!important;display:flex!important;align-items:center!important;gap:1mm!important;print-color-adjust:exact!important;-webkit-print-color-adjust:exact!important;cursor:default!important}.bar-label{overflow:visible!important;text-overflow:clip!important;background:rgba(255,255,255,.72)!important;color:#000!important;padding:0 .8mm!important;line-height:3mm!important}.bar-progress,.bar-feedback-dot{display:none!important}.bar.summary{background:transparent!important;border:0!important;color:#000!important;height:var(--rowH)!important}.bar.summary:before{border-top:2.2px solid #111!important;top:2mm!important}.bar.summary:after{border-top:1.5px solid #111!important;top:3.3mm!important}
  .baseline{height:1.2mm!important;background:#111!important;opacity:.65!important;bottom:.3mm!important}.dep-svg{display:none!important}.empty{display:none!important}
}
`;

  function inject(){
    const frame = document.getElementById("appFrame");
    const doc = frame?.contentDocument;
    if (!doc || !doc.head) return false;
    const href = String(frame?.contentWindow?.location?.href || frame?.src || "").toLowerCase();
    const title = String(document.getElementById("moduleTitle")?.textContent || "").toLowerCase();
    if (!href.includes("laag4_gantt") && !title.includes("gantt")) return false;
    let style = doc.getElementById(STYLE_ID);
    if (!style) {
      style = doc.createElement("style");
      style.id = STYLE_ID;
      style.setAttribute("data-cws-marker", MARKER);
      doc.head.appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;
    doc.documentElement?.setAttribute("data-cws-bws-print", MARKER);
    return true;
  }

  const timer = setInterval(inject, 500);
  setTimeout(() => clearInterval(timer), 60000);
  window.addEventListener("message", inject);
  window.addEventListener("focus", inject);
  document.getElementById("appFrame")?.addEventListener?.("load", () => setTimeout(inject, 100));
  window.CWS_BWS_PRINT_CSS = { marker: MARKER, inject };
})();
