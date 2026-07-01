
const Router = (() => {
  const V78_BOOT_ROUTER_MARKER = "v78-router-waits-for-state-ready";
  let requestedApp = "projecten";
  let routerReady = false;

  const appFrames = {
    projecten: "layers/laag3_projecten.html",
    gantt: "layers/laag4_gantt.html",
    capaciteit: "layers/laag5_capaciteit.html",
    afdelingsplanning: "layers/laag14_afdelingsplanning.html",
    "afdelingsplanning-maand": "layers/laag14_afdelingsplanning.html",
    "afdelingsplanning-week": "layers/laag14_afdelingsplanning.html",
    "afdelingsplanning-dag": "layers/laag14_afdelingsplanning.html",
    werkvoorraad: "layers/laag15_werkvoorraad.html",
    resources: "layers/laag16_resources.html",
    conflicten: "layers/laag17_conflicten.html",
    mijnwerk: "layers/laag18_mijn_werk.html",
    rollenrechten: "layers/laag19_rollen_rechten.html",
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
    afdelingsplanning: "Afdelingsplanning",
    "afdelingsplanning-maand": "Afdelingsplanning maand",
    "afdelingsplanning-week": "Afdelingsplanning week",
    "afdelingsplanning-dag": "Afdelingsplanning dag",
    werkvoorraad: "Werkvoorraad",
    resources: "Resources",
    conflicten: "Conflicten",
    mijnwerk: "Mijn werk",
    rollenrechten: "Rollen & rechten",
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
    if(window.CWS_MobileAdapter?.profile?.().family === "mobile" || window.innerWidth <= 640) return "dashboard";
    // V77: always start the production shell on a cheap stable module. The previous
    // D1 ui.lastApp could force a heavy Gantt boot before the app was interactive.
    return "projecten";
  };

  const showLoading = (app, message="Planningdata laden...") => {
    const frame = document.getElementById("appFrame");
    if(!frame) return;
    frame.removeAttribute("src");
    frame.srcdoc = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;margin:0;padding:28px;color:#334155;background:#f8fafc}
      .card{max-width:680px;margin:8vh auto;background:#fff;border:1px solid #dbe3ef;border-radius:14px;padding:24px;box-shadow:0 12px 35px rgba(15,23,42,.08)}
      .bar{height:8px;border-radius:999px;background:linear-gradient(90deg,#e2e8f0,#2f6fbd,#e2e8f0);background-size:220% 100%;animation:load 1.4s linear infinite}
      @keyframes load{to{background-position:-220% 0}}
    </style></head><body><div class="card"><h2>${appToTitle[app] || "CWS Planning"}</h2><p>${message}</p><div class="bar"></div></div></body></html>`;
    setTitle(appToTitle[app] || "App");
  };

  const commitRouteState = (app) => {
    CWS.setState(s => {
      s.ui.lastApp = app;
      return s;
    }, { userAction:false, reason:"router-ui-only", persistLocal:false });
  };

  const renderApp = (app) => {
    const url = appFrames[app] || appFrames.projecten;
    const frame = document.getElementById("appFrame");
    frame.removeAttribute("srcdoc");
    frame.dataset.activeApp = app;
    frame.src = `${url}?app=${encodeURIComponent(app)}&r=${Date.now()}`;
    setTitle(appToTitle[app] || "App");
    commitRouteState(app);
    CWS.recordRender?.();
    try{
      document.body.dataset.activeApp = app;
      document.dispatchEvent(new CustomEvent("cws:appchange", { detail:{ app, title: appToTitle[app] || "App", url } }));
    }catch(_){ }
  };

  const loadApp = (app) => {
    const st = CWS.getState();
    if (!Permissions.can(st.ui.role, "switch_app", { appId: app })) return UI.toast("Geen rechten");
    requestedApp = appFrames[app] ? app : "projecten";
    if(!routerReady || !CWS.isStateReady?.()){
      showLoading(requestedApp);
      return;
    }
    renderApp(requestedApp);
  };

  const boot = () => {
    requestedApp = safeBootApp();
    showLoading(requestedApp, "App-shell is klaar. D1-state en identiteit worden geladen...");
    CWS.boot?.markShellReady?.();
    try{
      document.body.dataset.activeApp = requestedApp;
      document.body.dataset.routerMarker = V78_BOOT_ROUTER_MARKER;
    }catch(_){}
  };

  const markReady = () => {
    routerReady = true;
    renderApp(requestedApp);
  };

  const showBootError = (message) => {
    routerReady = false;
    showLoading(requestedApp, `Opstarten is niet voltooid: ${message || "onbekende fout"}`);
  };

  return {
    loadApp,
    boot,
    markReady,
    showBootError,
    appFrames,
    appToTitle,
    getActiveApp: () => requestedApp,
    marker:V78_BOOT_ROUTER_MARKER
  };
})();
