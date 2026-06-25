/* CWS Planning V107 — restore Gantt drag/resize after reopening stored legacy models.
   Cause addressed: older D1/imported models may contain numeric row IDs while DOM data-id values
   are strings. laag4_gantt.html wireBars() uses strict row lookup, so those bars render but receive
   no pointerdown handler. This guard normalizes live Gantt row IDs and sched keys to strings before
   users interact with the module. */
(function(){
  const MARKER = "v107-gantt-interaction-hydration-guard";
  let normalizedOnce = false;
  let normalizeTimer = null;

  function normalizePred(raw, idMap){
    const text = String(raw || "").trim();
    if(!text) return text;
    return text.split(/[;,]+/).map(part => {
      const item = part.trim();
      if(!item) return "";
      const match = item.match(/^(.+?)(FS|SS|FF|SF)([+-]\d+)?$/i);
      if(match){
        const nextId = idMap.get(String(match[1])) || String(match[1]);
        return `${nextId}${String(match[2] || "FS").toUpperCase()}${match[3] || ""}`;
      }
      return idMap.get(String(item)) || String(item);
    }).filter(Boolean).join(";");
  }

  function normalizeModel(model){
    if(!model || typeof model !== "object" || !Array.isArray(model.rows)) return false;
    model.sched = model.sched && typeof model.sched === "object" ? model.sched : {};
    let changed = false;
    const idMap = new Map();
    const seen = new Set();

    model.rows.forEach((row, index) => {
      if(!row || typeof row !== "object") return;
      const oldId = row.id;
      let nextId = String(oldId ?? `row-${index + 1}`).trim();
      if(!nextId) nextId = `row-${index + 1}`;
      if(seen.has(nextId)){
        const base = nextId;
        let i = 2;
        while(seen.has(`${base}-${i}`)) i += 1;
        nextId = `${base}-${i}`;
      }
      seen.add(nextId);
      idMap.set(String(oldId), nextId);
      if(row.id !== nextId){
        row.id = nextId;
        changed = true;
      }
    });

    const nextSched = {};
    Object.entries(model.sched || {}).forEach(([key, value]) => {
      const nextKey = idMap.get(String(key)) || String(key);
      nextSched[nextKey] = value && typeof value === "object" ? { ...value } : value;
      if(nextKey !== key) changed = true;
    });
    model.rows.forEach(row => {
      if(!row || !row.id) return;
      if(!nextSched[row.id]){
        const legacy = model.sched?.[row.id] || model.sched?.[Number(row.id)] || null;
        if(legacy) nextSched[row.id] = legacy;
      }
      if(row.parent != null && row.parent !== ""){
        const nextParent = idMap.get(String(row.parent)) || String(row.parent);
        if(row.parent !== nextParent){ row.parent = nextParent; changed = true; }
      }
      if(row.predecessor){
        const nextPred = normalizePred(row.predecessor, idMap);
        if(nextPred !== row.predecessor){ row.predecessor = nextPred; changed = true; }
      }
      row.locked = Boolean(row.locked);
    });
    if(JSON.stringify(Object.keys(nextSched).sort()) !== JSON.stringify(Object.keys(model.sched || {}).sort())) changed = true;
    model.sched = nextSched;

    if(Array.isArray(model.revisions)){
      model.revisions.forEach(rev => {
        const snap = rev?.snapshot;
        if(!snap || typeof snap !== "object" || !Array.isArray(snap.rows)) return;
        snap.rows.forEach((row, index) => {
          if(row && row.id != null && typeof row.id !== "string"){
            row.id = String(row.id || `row-${index + 1}`);
            changed = true;
          }
        });
        if(snap.sched && typeof snap.sched === "object"){
          const clean = {};
          Object.entries(snap.sched).forEach(([key, value]) => { clean[String(key)] = value; });
          snap.sched = clean;
        }
      });
    }

    if(changed){
      model.meta = model.meta && typeof model.meta === "object" ? model.meta : {};
      model.meta.interactionHydrated = true;
      model.meta.interactionHydrationMarker = MARKER;
      model.meta.interactionHydratedAt = new Date().toISOString();
    }
    return changed;
  }

  function normalizeState(state){
    const byProject = state?.ganttV2?.byProject;
    if(!byProject || typeof byProject !== "object") return false;
    let changed = false;
    Object.values(byProject).forEach(model => { if(normalizeModel(model)) changed = true; });
    if(changed){
      state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};
      state.meta.ganttInteractionHydrationGuard = MARKER;
      state.meta.ganttInteractionHydratedAt = new Date().toISOString();
    }
    return changed;
  }

  function run(reason="manual"){
    if(!window.CWS?.getState || !window.CWS?.setState || window.CWS?.storageStatus?.booting) return false;
    const current = window.CWS.getState();
    const changed = normalizeState(current);
    if(!changed) return false;
    window.CWS.setState(draft => {
      normalizeState(draft);
      return draft;
    }, { userAction:false, reason:`${MARKER}:${reason}`, persistLocal:true });
    try{
      window.CWS.storageStatus = window.CWS.storageStatus || {};
      window.CWS.storageStatus.ganttInteractionHydrationMarker = MARKER;
      window.CWS.storageStatus.lastGanttInteractionHydrationAt = new Date().toISOString();
    }catch(_){}
    normalizedOnce = true;
    return true;
  }

  function schedule(reason){
    clearTimeout(normalizeTimer);
    normalizeTimer = setTimeout(() => run(reason), 120);
  }

  function bind(){
    if(!window.CWS?.subscribe) return false;
    if(window.CWS.__v107GanttInteractionHydrationGuardInstalled) return true;
    window.CWS.__v107GanttInteractionHydrationGuardInstalled = true;
    window.CWS.__v107GanttInteractionHydrationGuardMarker = MARKER;
    window.CWS.subscribe(() => schedule("store-update"));
    schedule("initial");
    window.addEventListener("message", event => {
      const type = event?.data?.type || "";
      if(String(type).includes("gantt") || String(type).includes("route") || String(type).includes("app")) schedule("message");
    });
    return true;
  }

  const timer = setInterval(() => {
    if(bind()){
      if(!normalizedOnce) schedule("poll");
    }
  }, 250);
  setTimeout(() => clearInterval(timer), 30000);
  window.CWS_NormalizeGanttInteractions = run;
})();
