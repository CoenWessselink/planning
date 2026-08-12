
const AppsMenu = (() => {
  const backdrop = () => document.getElementById("appsBackdrop");
  const openBtn = () => document.getElementById("openApps");
  const closeBtn = () => document.getElementById("closeApps");
  const grid = () => document.getElementById("appsGrid");
  const footer = () => document.getElementById("appsFooter");
  const roleBtn = () => document.getElementById("roleToggle");
  const deptBtn = () => document.getElementById("deptToggle");
  const deptPill = () => document.getElementById("deptPill");

  let lastFocus = null;

  const items = [
    { id:"dashboard", label:"Dashboard", icon:"DA", desc:"Direct overzicht van planning, aandachtspunten en status." },
    { id:"projecten", label:"Projecten", icon:"PR", desc:"Projectgegevens, afdelingsuren en projectstatus beheren." },
    { id:"gantt", label:"Gantt", icon:"GA", desc:"Planning, fasen, taken, afhankelijkheden en voortgang." },
    { id:"capaciteit", label:"Capaciteit", icon:"CA", desc:"Bezetting en heatmap vanuit Gantt-uren per dag." },
    { id:"afdelingsplanning", label:"Afdelingsplanning", icon:"AP", desc:"Maand, week en dagplanning voor afdelingen en resources." },
    { id:"werkvoorraad", label:"Werkvoorraad", icon:"WV", desc:"Nog te plannen taken, blokkades en ontbrekende resources." },
    { id:"resources", label:"Resources", icon:"RE", desc:"Medewerkers, materieel, gereedschap en beschikbaarheid." },
    { id:"conflicten", label:"Conflicten", icon:"CO", desc:"Centraal conflictcenter met oorzaken en oplossuggesties." },
    { id:"mijnwerk", label:"Mijn werk", icon:"MW", desc:"Read-only medewerkerportaal met dag- en weekoverzicht." },
    { id:"rollenrechten", label:"Rollen & rechten", icon:"RR", desc:"Rechtenmatrix, uitnodigingen en viewerrollen." },
    { id:"projectoverzicht", label:"Projectoverzicht", icon:"PO", desc:"Portfolio-overzicht, risico's en Project 360." },
    { id:"planbord", label:"Planbord", icon:"PL", desc:"Operationele planning en resource-indeling." },
    { id:"rapporten", label:"Rapporten", icon:"RA", desc:"Rapportages, signaleringen en exports." },
    { id:"importexport", label:"Import / Export", icon:"IO", desc:"Excel, CSV en state-uitwisseling." },
    { id:"instellingen", label:"Instellingen", icon:"IN", desc:"Bedrijf, afdelingen, medewerkers en kalender." },
    { id:"audit", label:"Auditlog", icon:"AU", desc:"Controleer wijzigingen, saves en systeemacties." },
  ];

  const utilityItems = [
    { id:"preflight", label:"Self-test / Preflight", icon:"PF", desc:"Technische controles voor release en beheer." },
    { id:"projectplanning", label:"Projectplanning", icon:"PP", desc:"Projectplanning en detailafstemming." },
    { id:"transport", label:"Transportplanning", icon:"TR", desc:"Transportplanning en logistieke voorbereiding." },
  ];

  const show = () => {
    const st = CWS.getState();
    if (!Permissions.can(st.ui.role, "open_apps_menu")) return UI.toast("Geen rechten");
    lastFocus = document.activeElement;
    const bd = backdrop();
    bd.classList.add("show");
    bd.removeAttribute("aria-hidden");
    renderFooter();
    // focus first app card for accessibility
    setTimeout(()=>{
      const first = bd.querySelector(".app-card");
      if(first) first.focus();
    }, 0);
  };

  const hide = () => {
    const bd = backdrop();
    bd.classList.remove("show");
    bd.setAttribute("aria-hidden","true");
    // restore focus
    setTimeout(()=>{
      try{
        const tgt = (lastFocus && document.contains(lastFocus)) ? lastFocus : openBtn();
        tgt && tgt.focus && tgt.focus();
      }catch(_){ }
    },0);
  };

  const renderFooter = () => {
    const st = CWS.getState();
    const n = st.projects.order.length;
    footer().textContent = `Veilig. Betrouwbaar. Gebouwd voor planning. | ${n} projecten | D1-state blijft leidend.`;
  };

  const renderCards = (host, list, className) => {
    host.innerHTML = "";
    const st = CWS.getState();
    const visible = list.filter(it => Permissions.can(st.ui.role, "switch_app", { appId:it.id }));
    visible.forEach(it => {
      const card = document.createElement("button");
      card.className = className;
      card.type = "button";
      card.setAttribute("aria-label", `${it.label} openen`);
      card.dataset.appId = it.id;

      const icon = document.createElement("div");
      icon.className = "app-icon";
      icon.textContent = it.icon;

      const label = document.createElement("div");
      label.className = "app-label";
      label.textContent = it.label;

      const sub = document.createElement("div");
      sub.className = "smallmuted";
      sub.textContent = it.desc || "Open module";

      const arrow = document.createElement("span");
      arrow.className = "app-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "->";

      card.append(icon,label,sub,arrow);

      const open = () => { Router.loadApp(it.id); hide(); };
      card.addEventListener("click", open);
      card.addEventListener("keydown", (e)=>{ if(e.key==="Enter" || e.key===" "){ e.preventDefault(); open(); } });

      host.appendChild(card);
    });
    return visible.length;
  };

  const render = () => {
    const mainCount = renderCards(grid(), items, "app-card");
    const util = document.getElementById("appsUtility");
    if(util){
      const count = renderCards(util, utilityItems, "apps-utility-card");
      util.hidden = count === 0;
      util.previousElementSibling?.classList?.toggle("hidden", count === 0);
    }
    try{ document.getElementById("appsGrid")?.setAttribute("data-main-app-count", String(mainCount)); }catch(_){}
  };

  const bind = () => {
    openBtn().addEventListener("click", show);
    closeBtn().addEventListener("click", hide);
    backdrop().addEventListener("click", (e)=>{ if(e.target === backdrop()) hide(); });
    document.addEventListener("keydown", (e)=>{ if(e.key==="Escape") hide(); });

    deptBtn().addEventListener("click", () => {
      const st=CWS.getState();
      // derive depts from resources
      const depts = Array.from(new Set(st.resources.order.map(id=>(st.resources.byId[id]?.dept||'').trim()).filter(Boolean)));
      depts.unshift('');
      const cur = st.user?.dept || '';
      const i = depts.indexOf(cur);
      const next = depts[(i+1) % depts.length];
      CWS.setState(s=>{ s.user = s.user||{}; s.user.dept = next; return s; });
      try{ CWS.audit('change_dept', { dept: next||'Alle' }); }catch(e){}
      const pill = document.getElementById('deptPill');
      if(pill) pill.textContent = next || 'Alle';
      UI.toast('Afdeling: ' + (next||'Alle'));
      // reload current app to apply filters
      try{ Router.loadApp(CWS.getState().ui.lastApp); }catch(e){}
    });

    roleBtn().addEventListener("click", () => {
      const st=CWS.getState();
      const roles = ["admin","planner","afdelingsplanner","projectleider","medewerker_viewer","extern_viewer","viewer"];
      const cur = st.user?.role || "admin";
      const next = roles[(Math.max(0, roles.indexOf(cur)) + 1) % roles.length];
      CWS.setUserRole(next);
      CWS.audit("change_role", { to: next });
      UI.toast("Gebruiker: " + CWS.getState().ui.role);
      // IMPORTANT: role switch does not change menu availability
      renderFooter();
      const pill = document.getElementById("rolePill");
      pill.textContent = CWS.getState().ui.role;
      const dp0 = document.getElementById('deptPill');
      if(dp0) dp0.textContent = CWS.getState().user?.dept || 'Alle';
      const dp=document.getElementById("deptPill"); if(dp) dp.textContent = CWS.getState().user?.dept || "Alle";
    });
  };

  return { render, bind, show, hide };
})();
