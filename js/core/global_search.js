const CWS_GlobalSearch = (() => {
  const MAX_RESULTS = 40;
  let activeIndex = 0;
  let lastResults = [];

  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;"
  }[c]));

  const state = () => window.CWS?.getState?.() || {
    projects:{ order:[], byId:{} },
    ganttV2:{ byProject:{} },
    tasks:{ byProject:{} },
    resources:{ order:[], byId:{} },
    departments:{ order:[], byId:{} },
    gantt:{ sourcesByDay:{} },
  };

  const text = (...parts) => parts.flat().filter(Boolean).join(" ").toLowerCase();
  const includesAll = (haystack, query) => {
    const q = String(query || "").trim().toLowerCase();
    if(!q) return true;
    return q.split(/\s+/).every(part => haystack.includes(part));
  };

  function projectList(st=state()){
    const ids = st.projects?.order?.length ? st.projects.order : Object.keys(st.projects?.byId || {});
    return ids.map(id => st.projects?.byId?.[id]).filter(Boolean);
  }

  function projectLabel(project){
    return [project?.nr || project?.code || project?.id, project?.name || project?.title || "Project"].filter(Boolean).join(" - ");
  }

  function buildResults(query){
    const st = state();
    const results = [];

    projectList(st).forEach(project => {
      const hay = text(project.id, project.nr, project.code, project.name, project.title, project.client, project.customer, project.opdrachtgever, project.status);
      if(includesAll(hay, query)){
        results.push({
          type:"project",
          label:projectLabel(project),
          meta:[project.client || project.customer || project.opdrachtgever, project.status, "Project"].filter(Boolean).join(" | "),
          projectId:project.id,
          defaultModule:"projecten",
          score:100,
        });
      }
    });

    Object.entries(st.ganttV2?.byProject || {}).forEach(([projectId, model]) => {
      const project = st.projects?.byId?.[projectId] || {};
      (model?.rows || []).forEach(row => {
        const hay = text(row.id, row.name, row.department, row.resourceId, row.status, project.nr, project.name, project.client);
        if(!includesAll(hay, query)) return;
        const sched = model?.sched?.[row.id] || {};
        results.push({
          type:"task",
          label:row.name || row.id,
          meta:[projectLabel(project) || projectId, row.department, sched.start && sched.end ? `${sched.start} - ${sched.end}` : "", "Gantt-taak"].filter(Boolean).join(" | "),
          projectId,
          taskId:row.id,
          defaultModule:"gantt",
          score:90,
        });
      });
    });

    (st.resources?.order || Object.keys(st.resources?.byId || {})).forEach(id => {
      const resource = st.resources?.byId?.[id];
      if(!resource) return;
      const hay = text(id, resource.name, resource.email, resource.dept, resource.role);
      if(includesAll(hay, query)){
        results.push({
          type:"resource",
          label:resource.name || id,
          meta:[resource.dept, resource.role, "Resource"].filter(Boolean).join(" | "),
          resourceId:id,
          dept:resource.dept,
          defaultModule:"capaciteit",
          score:70,
        });
      }
    });

    const deptNames = new Set();
    (st.departments?.order || Object.keys(st.departments?.byId || {})).forEach(id => {
      const dept = st.departments?.byId?.[id];
      deptNames.add(dept?.name || id);
    });
    Object.values(st.gantt?.sourcesByDay || {}).forEach(byDept => Object.keys(byDept || {}).forEach(name => deptNames.add(name)));
    [...deptNames].filter(Boolean).forEach(dept => {
      if(includesAll(text(dept, "afdeling capaciteit"), query)){
        results.push({
          type:"department",
          label:dept,
          meta:"Afdeling | Capaciteit",
          dept,
          defaultModule:"capaciteit",
          score:60,
        });
      }
    });

    Object.keys(st.gantt?.sourcesByDay || {}).forEach(date => {
      const d = new Date(date + "T00:00:00");
      if(!Number.isFinite(d.getTime())) return;
      const oneJan = new Date(Date.UTC(d.getUTCFullYear(),0,1));
      const days = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - oneJan.getTime()) / 86400000);
      const week = Math.ceil((days + oneJan.getUTCDay() + 1) / 7);
      const label = `W${String(week).padStart(2,"0")} ${d.getUTCFullYear()}`;
      if(includesAll(text(label, date, "week capaciteit planning"), query)){
        results.push({
          type:"week",
          label,
          meta:`Week rond ${date} | Capaciteit`,
          weekLabel:label,
          date,
          defaultModule:"capaciteit",
          score:45,
        });
      }
    });

    const seen = new Set();
    return results
      .sort((a,b) => b.score - a.score || String(a.label).localeCompare(String(b.label)))
      .filter(result => {
        const key = `${result.type}|${result.projectId||""}|${result.taskId||""}|${result.resourceId||""}|${result.dept||""}|${result.weekLabel||""}`;
        if(seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_RESULTS);
  }

  function ensureModal(){
    let el = document.getElementById("globalSearchBackdrop");
    if(el) return el;
    el = document.createElement("div");
    el.id = "globalSearchBackdrop";
    el.className = "global-search-backdrop";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `
      <div class="global-search-modal" role="dialog" aria-modal="true" aria-labelledby="globalSearchTitle">
        <div class="global-search-head">
          <div>
            <b id="globalSearchTitle">Zoeken</b>
            <span>Ctrl+K zoekt in projecten, taken, werknemers, afdelingen en weken.</span>
          </div>
          <button type="button" class="global-search-close" aria-label="Zoeken sluiten">X</button>
        </div>
        <input id="globalSearchInput" class="global-search-input" type="search" autocomplete="off" spellcheck="false" placeholder="Zoek projectnummer, opdrachtgever, taak, werknemer, afdeling of week...">
        <div id="globalSearchResults" class="global-search-results" role="listbox"></div>
        <div class="global-search-foot">Enter opent het actieve resultaat. Gebruik de knoppen voor direct naar Gantt, Capaciteit of Project 360.</div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener("click", event => {
      if(event.target === el || event.target.closest(".global-search-close")) close();
      const action = event.target.closest("[data-global-search-action]");
      if(action){
        const result = lastResults[Number(action.dataset.index)];
        if(result) navigate(result, action.dataset.globalSearchAction);
      }
    });
    el.querySelector("#globalSearchInput")?.addEventListener("input", render);
    el.querySelector("#globalSearchInput")?.addEventListener("keydown", event => {
      if(event.key === "ArrowDown"){ event.preventDefault(); activeIndex = Math.min(lastResults.length - 1, activeIndex + 1); render(); }
      if(event.key === "ArrowUp"){ event.preventDefault(); activeIndex = Math.max(0, activeIndex - 1); render(); }
      if(event.key === "Enter"){ event.preventDefault(); if(lastResults[activeIndex]) navigate(lastResults[activeIndex], lastResults[activeIndex].defaultModule); }
      if(event.key === "Escape"){ event.preventDefault(); close(); }
    });
    return el;
  }

  function render(){
    const input = document.getElementById("globalSearchInput");
    const out = document.getElementById("globalSearchResults");
    if(!input || !out) return;
    lastResults = buildResults(input.value);
    activeIndex = Math.max(0, Math.min(activeIndex, Math.max(0, lastResults.length - 1)));
    if(!lastResults.length){
      out.innerHTML = `<div class="global-search-empty">Geen resultaten. Zoek op projectnummer, projectnaam, opdrachtgever, taaknaam, werknemer, afdeling of weeknummer.</div>`;
      return;
    }
    out.innerHTML = lastResults.map((result, index) => `
      <div class="global-search-result ${index === activeIndex ? "active" : ""}" role="option" aria-selected="${index === activeIndex ? "true" : "false"}">
        <button type="button" class="global-search-main" data-global-search-action="${esc(result.defaultModule)}" data-index="${index}">
          <span class="global-search-type">${esc(result.type)}</span>
          <span class="global-search-label">${esc(result.label)}</span>
          <span class="global-search-meta">${esc(result.meta)}</span>
        </button>
        <div class="global-search-actions">
          ${result.projectId ? `<button type="button" data-global-search-action="projecten" data-index="${index}">Project</button>` : ""}
          ${result.projectId ? `<button type="button" data-global-search-action="gantt" data-index="${index}">Gantt</button>` : ""}
          <button type="button" data-global-search-action="capaciteit" data-index="${index}">Capaciteit</button>
          ${result.projectId ? `<button type="button" data-global-search-action="project360" data-index="${index}">Project 360</button>` : ""}
        </div>
      </div>`).join("");
  }

  function setTarget(result, module){
    const payload = {
      module,
      projectId:result.projectId || "",
      taskId:result.taskId || "",
      dept:result.dept || "",
      resourceId:result.resourceId || "",
      date:result.date || "",
      weekLabel:result.weekLabel || "",
      openedAt:new Date().toISOString(),
      expiresAt:new Date(Date.now() + 120000).toISOString(),
      source:"global-search",
    };
    try{ sessionStorage.setItem("cws.globalSearchTarget", JSON.stringify(payload)); }catch(_){}
    try{
      window.CWS?.setState?.(draft => {
        draft.ui = draft.ui || {};
        draft.ui.globalSearchTarget = payload;
        if(payload.projectId){
          draft.ui.activeProjectId = payload.projectId;
          draft.ui.lastProjectId = payload.projectId;
        }
        return draft;
      }, { userAction:false, reason:"global-search-target", persistLocal:false });
    }catch(_){}
    return payload;
  }

  function navigate(result, module){
    const targetModule = module === "project360" ? "projectoverzicht" : (module || result.defaultModule || "projecten");
    const router = (typeof Router !== "undefined") ? Router : window.Router;
    setTarget(result, module || result.defaultModule);
    close();
    router?.loadApp?.(targetModule);
  }

  function open(initial=""){
    const el = ensureModal();
    el.classList.add("show");
    el.removeAttribute("aria-hidden");
    const input = el.querySelector("#globalSearchInput");
    if(input){
      input.value = initial;
      activeIndex = 0;
      render();
      setTimeout(() => input.focus(), 0);
    }
  }

  function close(){
    const el = document.getElementById("globalSearchBackdrop");
    if(!el) return;
    el.classList.remove("show");
    el.setAttribute("aria-hidden", "true");
  }

  function bind(){
    ensureModal();
    document.querySelector('[aria-label="Zoeken"]')?.addEventListener("click", () => open());
    document.addEventListener("keydown", event => {
      const key = String(event.key || "").toLowerCase();
      if((event.ctrlKey || event.metaKey) && key === "k"){
        event.preventDefault();
        open();
      }
      if(event.key === "Escape" && document.getElementById("globalSearchBackdrop")?.classList.contains("show")) close();
    });
  }

  return { bind, open, close, buildResults };
})();
