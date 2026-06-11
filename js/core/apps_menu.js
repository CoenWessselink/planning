
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
    { id:"projecten", label:"Projecten", icon:"PR" },
    { id:"gantt", label:"Gantt", icon:"GA" },
    { id:"capaciteit", label:"Capaciteit", icon:"CA" },
    { id:"projectoverzicht", label:"Projectoverzicht", icon:"PO" },
    { id:"projectplanning", label:"Projectplanning", icon:"PP" },
    { id:"planbord", label:"Planbord", icon:"PL" },
    { id:"transport", label:"Transportplanning", icon:"TR" },
    { id:"rapporten", label:"Rapporten", icon:"RA" },
    { id:"dashboard", label:"Dashboard", icon:"DA" },
    { id:"instellingen", label:"Instellingen", icon:"IN" },
    { id:"importexport", label:"Import / Export", icon:"IO" },
    { id:"audit", label:"Audit", icon:"AU" },
    { id:"preflight", label:"Self-test / Preflight", icon:"PF" },
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
    footer().textContent = `${n} projecten • Pagina 1 van 1`;
  };

  const render = () => {
    const g = grid();
    g.innerHTML = "";
    const st = CWS.getState();
    items.filter(it => Permissions.can(st.ui.role, "switch_app", { appId:it.id })).forEach(it => {
      const card = document.createElement("div");
      card.className = "app-card";
      card.tabIndex = 0;

      const icon = document.createElement("div");
      icon.className = "app-icon";
      icon.textContent = it.icon;

      const label = document.createElement("div");
      label.className = "app-label";
      label.textContent = it.label;

      const sub = document.createElement("div");
      sub.className = "smallmuted";
      sub.textContent = "Open module";

      card.append(icon,label,sub);

      const open = () => { Router.loadApp(it.id); hide(); };
      card.addEventListener("click", open);
      card.addEventListener("keydown", (e)=>{ if(e.key==="Enter") open(); });

      g.appendChild(card);
    });
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
      const cur = st.user?.role || "admin";
      const next = (cur==="admin") ? "planner" : (cur==="planner" ? "viewer" : "admin");
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
