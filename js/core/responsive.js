
const CWS_Responsive = (() => {
  const navItems = [
    {id:"dashboard", label:"Dashboard", icon:"⌂"},
    {id:"projectoverzicht", label:"Overzicht", icon:"◎"},
    {id:"gantt", label:"Gantt", icon:"▰"},
    {id:"capaciteit", label:"Capaciteit", icon:"▦"},
    {id:"apps", label:"Menu", icon:"☰"},
  ];

  navItems.splice(0, navItems.length,
    {id:"dashboard", label:"Dashboard", icon:"⌂"},
    {id:"projecten", label:"Projecten", icon:"▤"},
    {id:"gantt", label:"Gantt", icon:"▰", primary:true},
    {id:"capaciteit", label:"Capaciteit", icon:"▦"},
    {id:"more", label:"Meer", icon:"☰"}
  );
  const moreItems = [
    {id:"projectoverzicht", label:"Projectoverzicht", icon:"PO"},
    {id:"planbord", label:"Planbord", icon:"PL"},
    {id:"rapporten", label:"Rapporten", icon:"RA"},
    {id:"importexport", label:"Import / Export", icon:"IO"},
    {id:"instellingen", label:"Instellingen", icon:"IN"},
    {id:"audit", label:"Auditlog", icon:"AU"},
    {id:"preflight", label:"Self-test / Preflight", icon:"PF"},
  ];
  let moreBound = false;

  const routerApi = () => window.Router || (typeof Router !== "undefined" ? Router : null);
  const appsMenuApi = () => window.AppsMenu || (typeof AppsMenu !== "undefined" ? AppsMenu : null);
  const viewport = () => window.CWS_MobileAdapter?.profile?.().family || (window.innerWidth <= 767 ? "mobile" : (window.innerWidth <= 1199 ? "tablet" : "desktop"));
  const activeApp = () => (routerApi()?.getActiveApp?.() || window.CWS?.getState?.()?.ui?.lastApp || "projecten");

  function applyViewport(){
    window.CWS_MobileAdapter?.apply?.();
    document.body.dataset.cwsViewport = viewport();
    document.documentElement.dataset.cwsViewport = viewport();
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
    nav.innerHTML = navItems.map(item => `<button type="button" class="${item.primary ? "mobile-nav-primary" : ""}" data-mobile-app="${item.id}" aria-label="${item.label}"><span>${item.icon}</span><span>${item.label}</span></button>`).join("");
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
            <button type="button" class="mobile-more-close" aria-label="Meer-menu sluiten">X</button>
          </div>
          <div class="mobile-more-grid"></div>
        </div>`;
      document.body.appendChild(sheet);
      sheet.querySelector(".mobile-more-close")?.addEventListener("click", hideMobileMore);
      sheet.addEventListener("click", event => { if(event.target === sheet) hideMobileMore(); });
    }
    const grid = sheet.querySelector(".mobile-more-grid");
    if(grid){
      grid.innerHTML = moreItems.map(item => `<button type="button" data-more-app="${item.id}"><span>${item.icon}</span><b>${item.label}</b></button>`).join("");
      grid.querySelectorAll("[data-more-app]").forEach(button => {
        button.addEventListener("click", () => {
          hideMobileMore();
          routerApi()?.loadApp?.(button.dataset.moreApp);
        });
      });
    }
    if(!moreBound){
      moreBound = true;
      document.addEventListener("keydown", event => {
        if(event.key === "Escape") hideMobileMore();
      });
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
    markOptimized(doc);
    addMobileToolbar(doc);
    labelTables(doc);
    makeWideAreasScrollable(doc);
    installMobileInputFocusGuard(doc);
    addMobileActionDock(doc);
    observeDynamicContent(doc);
  }

  function observeDynamicContent(doc){
    if(!doc?.documentElement || !doc?.body) return;
    if(doc.documentElement.dataset.v72ResponsiveObserver === "true") return;
    doc.documentElement.dataset.v72ResponsiveObserver = "true";
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
    if(doc.body?.nodeType === 1) observer.observe(doc.body,{childList:true,subtree:true});
  }

  function addMobileToolbar(doc){
    if(doc.getElementById("cwsMobileToolbar")) return;
    const bar=doc.createElement("div");
    bar.id="cwsMobileToolbar";
    bar.className="mobile-toolbar responsive-only";
    bar.innerHTML=`<button type="button" data-act="top">Boven</button><button type="button" data-act="fit">Compact</button><button type="button" data-act="menu">Menu</button>`;
    doc.body.prepend(bar);
    bar.querySelector('[data-act="top"]').addEventListener("click",()=>doc.scrollingElement?.scrollTo({top:0,behavior:"smooth"}));
    bar.querySelector('[data-act="fit"]').addEventListener("click",()=>doc.body.classList.toggle("cws-compact-mode"));
    bar.querySelector('[data-act="menu"]').addEventListener("click",()=>appsMenuApi()?.show?.());
  }

  function labelTables(doc){
    doc.querySelectorAll("table").forEach(table=>{
      if(table.dataset.cwsResponsiveLabels==="1") return;
      const headers=Array.from(table.querySelectorAll("thead th")).map(th=>th.textContent.trim().replace(/\s+/g," "));
      if(headers.length){
        table.querySelectorAll("tbody tr").forEach(tr=>{
          Array.from(tr.children).forEach((td,i)=>{
            if(!td.hasAttribute("data-label")) td.setAttribute("data-label", headers[i] || "");
          });
        });
        table.dataset.cwsResponsiveLabels="1";
        const wrap=table.closest(".table-wrap,.matrix-wrap,.rep-right,.assign-right");
        if(wrap) wrap.classList.add("mobile-card-table");
      }
    });
  }



  function viewportHeightFix(){
    const h = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
    if(h) document.documentElement.style.setProperty("--cws-vh", `${h}px`);
  }

  function addMobileActionDock(doc){
    const vp = viewport();
    let dock = doc.getElementById("cwsV37MobileActionDock");
    if(vp !== "mobile"){
      if(dock) dock.remove();
      return;
    }
    if(!dock){
      dock = doc.createElement("div");
      dock.id = "cwsV37MobileActionDock";
      dock.className = "v37-mobile-action-dock responsive-only";
      doc.body.appendChild(dock);
    }
    const title = (document.getElementById("moduleTitle")?.textContent || "").toLowerCase();
    const route = routerApi()?.getActiveApp?.() || "";
    const actions = [];
    const add = (label, selector, fallback) => actions.push({label, selector, fallback});
    if(route === "projecten" || title.includes("projecten")){
      add("Nieuw", "#newProjectBtn,[data-action='new-project']", "window.CWS_Projecten_OpenNew?.()");
      add("Zoek", ".search,#projectSearch,input[type='search']", null);
      add("Filters", "#filterBtn,.filtersBtn", null);
    }else if(route === "gantt" || title.includes("gantt")){
      add("Taak", "#addTaskBtn,[data-action='add-task']", null);
      add("Diagram", "#viewDiagram,.btn[data-view='diagram']", null);
      add("Beide", "#viewBoth,.btn[data-view='both']", null);
    }else if(route === "capaciteit" || title.includes("capaciteit")){
      add("Vandaag", "#todayBtn", null);
      add("6 weken", "[data-weeks='6']", null);
      add("A0", "#printBtn", null);
    }else if(route === "instellingen" || title.includes("instellingen")){
      add("Bedrijf", "#quickCompany", null);
      add("Logo", "#quickLogo", null);
      add("Nieuw", "#newItemBtn", null);
    }else if(route === "projectoverzicht" || title.includes("projectoverzicht")){
      add("Zoek", "#searchInput,.search,input[type='search']", null);
      add("Print", "#printBtn", null);
      add("Export", "#exportBtn", null);
    }else{
      add("Boven", "#cwsMobileToolbar [data-act='top']", null);
      add("Compact", "#cwsMobileToolbar [data-act='fit']", null);
      add("Menu", null, "window.parent?.postMessage?.({type:'cws_apps_menu'}, '*')");
    }
    dock.innerHTML = actions.map((a,i)=>`<button type="button" data-v37-action="${i}">${a.label}</button>`).join("");
    actions.forEach((a,i)=>{
      const btn = dock.querySelector(`[data-v37-action="${i}"]`);
      btn?.addEventListener("click",()=>{
        if(a.selector){
          const target = doc.querySelector(a.selector);
          if(target){
            if(target.tagName === "INPUT" || target.tagName === "TEXTAREA") target.focus();
            else target.click();
            return;
          }
        }
        if(a.fallback){ try{ Function(a.fallback)(); }catch(_e){} }
      });
    });
  }

  function installMobileInputFocusGuard(doc){
    doc.querySelectorAll("input,select,textarea,button").forEach(el=>{
      el.style.touchAction = "manipulation";
      if((el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") && !el.dataset.v37FontGuard){
        el.dataset.v37FontGuard = "1";
        el.style.fontSize = "16px";
      }
    });
  }

  function markOptimized(doc){
    doc.documentElement.dataset.v37MobileOptimized = "true";
    doc.documentElement.dataset.v72MobileHardened = "true";
    doc.body.dataset.v37MobileOptimized = "true";
    doc.body.dataset.v72MobileHardened = "true";
    doc.body.classList.add("v37-mobile-optimized","v72-mobile-hardened");
  }

  function makeWideAreasScrollable(doc){
    doc.querySelectorAll(".board-wrap,.matrix-wrap,.heatmap-wrap,.table-wrap,.rep-right,.assign-right,.pb-right,.modal-body").forEach(el=>{
      el.style.webkitOverflowScrolling="touch";
      el.setAttribute("data-cws-scroll","x");
    });
  }

  function bind(){
    viewportHeightFix();
    ensureBottomNav();
    applyViewport();
    window.addEventListener("resize",()=>requestAnimationFrame(()=>{ viewportHeightFix(); applyViewport(); }));
    document.addEventListener("cws:appchange",()=>{ markActive(); setTimeout(enhanceFrame,80); });
    document.getElementById("appFrame")?.addEventListener("load",()=>setTimeout(enhanceFrame,40));
    window.addEventListener("orientationchange",()=>setTimeout(()=>{ viewportHeightFix(); applyViewport(); },200));
  }

  return { bind, applyViewport, enhanceFrame };
})();
