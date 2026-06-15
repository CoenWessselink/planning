
const Router = (() => {
  const appFrames = {
    projecten: "layers/laag3_projecten.html",
    gantt: "layers/laag4_gantt.html",
    capaciteit: "layers/laag5_capaciteit.html",
    projectoverzicht: "layers/laag6_projectoverzicht.html",
    projectplanning: "layers/laag7_projectplanning.html",
    planbord: "layers/laag8_planbord.html",
    transport: "layers/laag9_transport.html",
    rapporten: "layers/laag8_rapporten.html",
    dashboard: "layers/laag9_dashboard.html",
    instellingen: "layers/laag10_instellingen.html",
    nietwerkbaredagen: "layers/laag10_nietwerkbaredagen.html",
    werknemerswerkweek: "layers/laag10_werknemers_werkweek.html",
    importexport: "layers/laag11_io.html",
    audit: "layers/laag12_audit.html",
    preflight: "layers/laag13_preflight.html",
  };

  const setTitle = (t) => {
    const titleEl = document.getElementById("moduleTitle");
    if (titleEl) titleEl.textContent = t;
  };

  const appToTitle = {
    projecten: "Projecten",
    gantt: "Gantt",
    projectoverzicht: "Projectoverzicht",
    projectplanning: "Projectplanning",
    planbord: "Planbord",
    transport: "Transportplanning",
    capaciteit: "Capaciteit",
    rapporten: "Rapporten",
    dashboard: "Dashboard",
    instellingen: "Instellingen",
    nietwerkbaredagen: "Niet-werkbare dagen",
    werknemerswerkweek: "Werknemers",
    importexport: "Import / Export",
    audit: "Audit",
    preflight: "Self-test / Preflight",
  };


  const appFromUrl = () => {
    try{
      const url = new URL(window.location.href);
      const q = String(url.searchParams.get("app") || "").trim().toLowerCase();
      const h = String(url.hash || "").replace(/^#\/?/, "").trim().toLowerCase();
      const candidate = q || h;
      return appFrames[candidate] ? candidate : "";
    }catch(_){ return ""; }
  };

  const safeBootApp = () => {
    const explicit = appFromUrl();
    if(explicit) return explicit;
    // V77: always start the production shell on a cheap stable module. The previous
    // D1 ui.lastApp could force a heavy Gantt boot before the app was interactive.
    return "projecten";
  };

  const loadApp = (app) => {
    const st = CWS.getState();
    if (!Permissions.can(st.ui.role, "switch_app", { appId: app })) return UI.toast("Geen rechten");
    const url = appFrames[app] || appFrames.projecten;
    const frame = document.getElementById("appFrame");
    frame.src = url + "?r=" + Date.now();
    setTitle(appToTitle[app] || "App");
    CWS.setState(s => { s.ui.lastApp = app; return s; });
    try{
      document.body.dataset.activeApp = app;
      document.dispatchEvent(new CustomEvent("cws:appchange", { detail:{ app, title: appToTitle[app] || "App", url } }));
    }catch(_){ }
  };

  const boot = () => {
    loadApp(safeBootApp());
  };

  return { loadApp, boot, appFrames, appToTitle, getActiveApp: () => (CWS.getState().ui.lastApp || "projecten") };
})();
