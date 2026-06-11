
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

  const loadApp = (app) => {
    const st = CWS.getState();
    if (!Permissions.can(st.ui.role, "switch_app", { appId: app })) return UI.toast("Geen rechten");
    const url = appFrames[app] || appFrames.projecten;
    const frame = document.getElementById("appFrame");
    frame.src = url + "?r=" + Date.now();
    setTitle(appToTitle[app] || "App");
    CWS.setState(s => { s.ui.lastApp = app; return s; });
  };

  const boot = () => {
    const app = CWS.getState().ui.lastApp || "projecten";
    loadApp(app);
  };

  return { loadApp, boot };
})();
