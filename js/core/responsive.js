const CWS_Responsive = (() => {
  const icon = {
    dashboard:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5v7.8c0 .9-.7 1.7-1.7 1.7H15v-6H9v6H4.7c-.9 0-1.7-.7-1.7-1.7v-7.8Z"/></svg>',
    projecten:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v3H4V4Zm0 5h16v3H4V9Zm0 5h16v3H4v-3Zm0 5h16v1.5H4V19Z"/></svg>',
    gantt:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h12a2 2 0 1 1 0 4H4V7Zm5 6h11a2 2 0 1 1 0 4H9v-4Z"/></svg>',
    capaciteit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4V4Zm2 2v3h3V6H6Zm5 0v3h3V6h-3Zm5 0v3h2V6h-2ZM6 11v3h3v-3H6Zm5 0v3h3v-3h-3Zm5 0v3h2v-3h-2ZM6 16v2h3v-2H6Zm5 0v2h3v-2h-3Zm5 0v2h2v-2h-2Z"/></svg>',
    more:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14v2.5H5V7Zm0 4.75h14v2.5H5v-2.5ZM5 16.5h14V19H5v-2.5Z"/></svg>',
    overview:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5V4Zm2 3v2h10V7H7Zm0 4v2h10v-2H7Zm0 4v2h6v-2H7Z"/></svg>',
    board:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h7v6H4V5Zm9 0h7v10h-7V5ZM4 13h7v6H4v-6Zm9 4h7v2h-7v-2Z"/></svg>',
    reports:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V4h3v16H5Zm5 0V9h3v11h-3Zm5 0V6h3v14h-3Z"/></svg>',
    importexport:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5h3l-8 8-8-8h3V4Zm-2 15h14v2H5v-2Z"/></svg>',
    settings:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13.5c.1-.5.1-1 .1-1.5s0-1-.1-1.5l2-1.5-2-3.5-2.4 1a8 8 0 0 0-2.6-1.5L14 2h-4l-.4 2.5A8 8 0 0 0 7 6L4.6 5l-2 3.5 2 1.5A8 8 0 0 0 4.5 12c0 .5 0 1 .1 1.5l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 2.6 1.5L10 22h4l.4-2.5A8 8 0 0 0 17 18l2.4 1 2-3.5-2-1.5ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"/></svg>',
    audit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6V3Zm2 4v2h8V7H8Zm0 4v2h8v-2H8Zm0 4v2h5v-2H8Z"/></svg>'
  };

  const navItems = [
    {id:"dashboard", label:"Dashboard", icon:icon.dashboard},
    {id:"projecten", label:"Projecten", icon:icon.projecten},
    {id:"gantt", label:"Gantt", icon:icon.gantt, primary:true},
    {id:"capaciteit", label:"Capaciteit", icon:icon.capaciteit},
    {id:"more", label:"Meer", icon:icon.more}
  ];
  const moreItems = [
    {id:"projectoverzicht", label:"Projectoverzicht", icon:icon.overview},
    {id:"planbord", label:"Planbord", icon:icon.board},
    {id:"rapporten", label:"Rapporten", icon:icon.reports},
    {id:"importexport", label:"Import / Export", icon:icon.importexport},
    {id:"instellingen", label:"Instellingen", icon:icon.settings},
    {id:"audit", label:"Auditlog", icon:icon.audit}
  ];
  let moreBound = false;

  const routerApi = () => window.Router || (typeof Router !== "undefined" ? Router : null);
  const appsMenuApi = () => window.AppsMenu || (typeof AppsMenu !== "undefined" ? AppsMenu : null);
  const viewport = () => window.CWS_MobileAdapter?.profile?.().family || (window.innerWidth <= 767 ? "mobile" : (window.innerWidth <= 1199 ? "tablet" : "desktop"));
  const activeApp = () => (routerApi()?.getActiveApp?.() || window.CWS?.getState?.()?.ui?.lastApp || "projecten");

  function applyViewport(){
    window.CWS_MobileAdapter?.apply?.();
    const vp = viewport();
    document.body.dataset.cwsViewport = vp;
    document.documentElement.dataset.cwsViewport = vp;
    ensureBottomNav();
    markActive();
    enhanceFrame();
  }

  function ensureBottomNav(){
    let nav=document.getElementById("mobileBottomNav");
    if(!nav){
      nav=document.createElement("nav");
      nav.id="mobileBottomNav";
      nav.className="mobile-bottom-nav";
      nav.setAttribute("aria-label","Mobiele snelnavigatie");
      document.body.appendChild(nav);
    }
    nav.innerHTML = navItems.map(item => `<button type="button" class="${item.primary ? "mobile-nav-primary" : ""}" data-mobile-app="${item.id}" aria-label="${item.label}"><span class="nav-icon">${item.icon}</span><span class="nav-label">${item.label}</span></button>`).join("");
    if(nav.dataset.cwsPremiumNavBound !== "true"){
      nav.dataset.cwsPremiumNavBound = "true";
      nav.addEventListener("click", event => {
        const btn = event.target?.closest?.("[data-mobile-app]");
        if(!btn || !nav.contains(btn)) return;
        const id = btn.dataset.mobileApp;
        if(id === "more") return showMobileMore();
        routerApi()?.loadApp?.(id);
      });
    }
    ensureMobileMoreSheet();
    markActive();
  }

  function markActive(){
    const app=activeApp();
    const moreActive = moreItems.some(item => item.id === app);
    document.querySelectorAll("[data-mobile-app]").forEach(btn=>{
      const id = btn.dataset.mobileApp;
      const active = id === app || (id === "more" && moreActive);
      btn.classList.toggle("active", active);
      if(active) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
  }

  function ensureMobileMoreSheet(){
    let sheet = document.getElementById("mobileMoreSheet");
    if(!sheet){
      sheet = document.createElement("div");
      sheet.id = "mobileMoreSheet";
      sheet.className = "mobile-more-sheet";
      sheet.setAttribute("aria-hidden", "true");
      sheet.innerHTML = `
        <div class="mobile-more-panel" role="dialog" aria-modal="true" aria-labelledby="mobileMoreTitle">
          <div class="mobile-more-head">
            <div><b id="mobileMoreTitle">Meer modules</b><span>Alle bestaande CWS Planning onderdelen</span></div>
            <button type="button" class="mobile-more-close" aria-label="Meer-menu sluiten">×</button>
          </div>
          <div class="mobile-more-grid"></div>
        </div>`;
      document.body.appendChild(sheet);
      sheet.querySelector(".mobile-more-close")?.addEventListener("click", hideMobileMore);
      sheet.addEventListener("click", event => { if(event.target === sheet) hideMobileMore(); });
    }
    const grid = sheet.querySelector(".mobile-more-grid");
    if(grid){
      grid.innerHTML = moreItems.map(item => `<button type="button" data-more-app="${item.id}"><span class="more-icon">${item.icon}</span><b>${item.label}</b></button>`).join("");
      grid.querySelectorAll("[data-more-app]").forEach(button => {
        button.addEventListener("click", () => {
          hideMobileMore();
          routerApi()?.loadApp?.(button.dataset.moreApp);
        });
      });
    }
    if(!moreBound){
      moreBound = true;
      document.addEventListener("keydown", event => { if(event.key === "Escape") hideMobileMore(); });
    }
  }

  function showMobileMore(){
    ensureMobileMoreSheet();
    const sheet = document.getElementById("mobileMoreSheet");
    if(!sheet) return appsMenuApi()?.show?.();
    sheet.classList.add("show");
    sheet.removeAttribute("aria-hidden");
    document.body.classList.add("mobile-more-open");
    setTimeout(() => sheet.querySelector("[data-more-app]")?.focus(), 0);
  }
  function hideMobileMore(){
    const sheet = document.getElementById("mobileMoreSheet");
    if(!sheet) return;
    sheet.classList.remove("show");
    sheet.setAttribute("aria-hidden", "true");
    document.body.classList.remove("mobile-more-open");
  }

  function enhanceFrame(){
    const frame=document.getElementById("appFrame");
    if(!frame || !frame.contentDocument) return;
    try{ enhanceDocument(frame.contentDocument); }catch(_){ }
  }

  function enhanceDocument(doc){
    if(!doc?.documentElement || !doc?.body) return;
    const vp=viewport();
    window.CWS_MobileAdapter?.enhanceDocument?.(doc, window.innerWidth);
    doc.documentElement.dataset.cwsViewport=vp;
    doc.body.dataset.cwsViewport=vp;
    doc.body.classList.add("cws-responsive-frame");
    labelTables(doc);
    makeWideAreasScrollable(doc);
    installMobileInputFocusGuard(doc);
    observeDynamicContent(doc);
  }

  function observeDynamicContent(doc){
    if(!doc?.documentElement || !doc?.body) return;
    if(doc.documentElement.dataset.v100ResponsiveObserver === "true") return;
    doc.documentElement.dataset.v100ResponsiveObserver = "true";
    let queued=false;
    const observer=new MutationObserver(()=>{
      if(queued) return;
      queued=true;
      requestAnimationFrame(()=>{
        queued=false;
        labelTables(doc);
        makeWideAreasScrollable(doc);
        installMobileInputFocusGuard(doc);
      });
    });
    observer.observe(doc.body,{childList:true,subtree:true});
  }

  function labelTables(doc){
    doc.querySelectorAll("table").forEach(table=>{
      if(table.dataset.cwsResponsiveLabels==="1") return;
      const headers=Array.from(table.querySelectorAll("thead th")).map(th=>th.textContent.trim().replace(/\s+/g," "));
      if(headers.length){
        table.querySelectorAll("tbody tr").forEach(tr=>{
          Array.from(tr.children).forEach((td,i)=>{ if(!td.hasAttribute("data-label")) td.setAttribute("data-label", headers[i] || ""); });
        });
        table.dataset.cwsResponsiveLabels="1";
      }
    });
  }

  function makeWideAreasScrollable(doc){
    doc.querySelectorAll(".table-wrap,.tablewrap,.matrix-wrap,.heatmap-wrap,.board-wrap,.rep-right,.assign-right,.pb-right").forEach(wrap=>{
      wrap.classList.add("v100-scroll-container");
      wrap.style.overflowX = wrap.style.overflowX || "auto";
      wrap.style.webkitOverflowScrolling = "touch";
    });
  }

  function installMobileInputFocusGuard(doc){
    doc.querySelectorAll("input,select,textarea,button").forEach(el=>{
      el.style.touchAction = "manipulation";
      if((el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") && !el.dataset.v100FontGuard){
        el.dataset.v100FontGuard = "1";
        el.style.fontSize = "16px";
      }
    });
  }

  function viewportHeightFix(){
    const h = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
    if(h) document.documentElement.style.setProperty("--cws-vh", `${h}px`);
  }

  function bind(){
    viewportHeightFix();
    applyViewport();
    ensureBottomNav();
    window.addEventListener("resize",()=>{ viewportHeightFix(); applyViewport(); },{passive:true});
    window.addEventListener("orientationchange",()=>setTimeout(()=>{ viewportHeightFix(); applyViewport(); },120),{passive:true});
    document.getElementById("appFrame")?.addEventListener("load",()=>setTimeout(enhanceFrame,40));
    document.addEventListener("cws:appchange",()=>setTimeout(()=>{ markActive(); enhanceFrame(); },80));
  }

  return { bind, applyViewport, enhanceDocument, ensureBottomNav, markActive };
})();
