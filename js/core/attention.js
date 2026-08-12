/* CWS Planning V31 - centrale attention/gezondheid engine */
window.CWS = window.CWS || {};
(function(){
  const esc = v => String(v ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const pad = n => String(n).padStart(2,"0");
  const todayIso = () => new Date().toISOString().slice(0,10);
  function parseDate(v){ if(!v) return null; const s=String(v).slice(0,10); let m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if(m) return new Date(Date.UTC(+m[1],+m[2]-1,+m[3])); m=s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/); if(m) return new Date(Date.UTC(+m[3],+m[2]-1,+m[1])); return null; }
  function clampPct(v){ return Math.max(0, Math.min(100, Math.round(Number(v)||0))); }
  function dayDiff(a,b){ const da=parseDate(a), db=parseDate(b); if(!da||!db) return 0; return Math.round((db-da)/86400000); }
  function duration(start,end){ return Math.max(1, dayDiff(start,end)+1 || 1); }
  function projectList(st){ return (st.projects?.order||[]).map(id=>st.projects?.byId?.[id]).filter(Boolean); }
  function deptList(st){
    const set = new Set();
    (st.departments?.order||[]).forEach(id=>set.add(st.departments?.byId?.[id]?.name || id));
    (st.settings?.tables?.departments||[]).forEach(d=>set.add(d.name||d.afdeling||d.code));
    Object.values(st.gantt?.hoursByDay||{}).forEach(byDept=>Object.keys(byDept||{}).forEach(d=>set.add(d)));
    (st.resources?.order||[]).forEach(id=>{ const d=st.resources?.byId?.[id]?.dept; if(d) set.add(d); });
    return [...set].filter(Boolean).sort((a,b)=>String(a).localeCompare(String(b),'nl'));
  }
  function taskItems(st, projectId){
    const model = st.ganttV2?.byProject?.[projectId] || {rows:[], sched:{}};
    return (model.rows||[]).filter(r=>r.type !== "summary").map((row,index)=>({row, sched:model.sched?.[row.id]||{}, index, projectId}));
  }
  function taskWeight(t){ const h=Number(t.row?.hours||0); return h>0?h:duration(t.sched?.start,t.sched?.end); }
  function progressSummary(st, projectId){
    const tasks = taskItems(st, projectId);
    const totalWeight = tasks.reduce((n,t)=>n+taskWeight(t),0);
    const pct = totalWeight ? Math.round(tasks.reduce((n,t)=>n+clampPct(t.row.progress)*taskWeight(t),0)/totalWeight) : 0;
    const today = parseDate(todayIso());
    const overdue = tasks.filter(t=>{ const e=parseDate(t.sched?.end || t.row?.end); return e && today && e < today && clampPct(t.row.progress)<100; });
    const blocked = tasks.filter(t=>String(t.row.status||"").toLowerCase().match(/blok|aandacht|probleem/));
    const started = tasks.some(t=>clampPct(t.row.progress)>0);
    const completed = tasks.length>0 && tasks.every(t=>clampPct(t.row.progress)>=100);
    const feedback = tasks.map(t=>({ text:String(t.row.feedback||t.row.why||"").trim(), ts:t.row.feedbackUpdatedAt||t.row.progressUpdatedAt||"" })).filter(x=>x.text).sort((a,b)=>String(b.ts).localeCompare(String(a.ts)))[0];
    let status = "Niet gestart";
    if(completed) status="Gereed"; else if(blocked.length) status="Aandacht"; else if(overdue.length) status="Vertraagd"; else if(started) status="In uitvoering";
    return { pct, status, tasks, overdue, blocked, latestFeedback:feedback?.text||"", latestFeedbackAt:feedback?.ts||"" };
  }
  function isoWeek(d){
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    return { year:date.getUTCFullYear(), week:Math.ceil((((date-yearStart)/86400000)+1)/7) };
  }
  function weekKeyFromDate(iso){ const d=parseDate(iso); if(!d) return ""; const w=isoWeek(d); return `${w.year}-W${pad(w.week)}`; }
  function capacityDemandByWeekDept(st){
    const out = {};
    Object.entries(st.gantt?.hoursByDay||{}).forEach(([date,byDept])=>{
      const wk = weekKeyFromDate(date); if(!wk) return;
      Object.entries(byDept||{}).forEach(([dept,hours])=>{
        const h = Number(hours||0); if(!h) return;
        out[wk] = out[wk] || {}; out[wk][dept] = (out[wk][dept]||0)+h;
      });
    });
    Object.keys(out).forEach(wk=>Object.keys(out[wk]).forEach(d=>out[wk][d]=Math.round(out[wk][d]*10)/10));
    return out;
  }
  function defaultAvailableWeek(st, dept){
    let sum=0;
    (st.resources?.order||[]).forEach(id=>{ const r=st.resources?.byId?.[id]||{}; if(String(r.dept||"")===String(dept)) sum += Number(r.daily||0)*5; });
    if(sum>0) return Math.round(sum*10)/10;
    const row=(st.settings?.tables?.departments||[]).find(d=>String(d.name||d.afdeling||d.code)===String(dept));
    return Math.round(Number(row?.weeklyHours || row?.weekUren || row?.capacity || 40)*10)/10;
  }
  function overridesCount(st){ return Object.values(st.capacity?.availabilityOverrides||{}).reduce((n,days)=>n+Object.keys(days||{}).length,0); }
  function attentionItems(st){
    const items=[]; const projects=projectList(st); const demand=capacityDemandByWeekDept(st);
    projects.forEach(p=>{
      const s=progressSummary(st,p.id);
      const hasGantt=s.tasks.length>0;
      const deptHours=Object.values(p.deptHours||{}).reduce((n,v)=>n+Number(v||0),0);
      if(!hasGantt) items.push({severity:deptHours>0?'red':'orange',type:'project_no_gantt',projectId:p.id,title:'Project zonder Gantt-planning',message:`${p.nr||p.id} heeft ${deptHours||0} afdelingsuren maar geen Gantt-taken.`,module:'gantt',action:'Open Gantt'});
      if(deptHours<=0) items.push({severity:'orange',type:'project_no_hours',projectId:p.id,title:'Project zonder afdelingsuren',message:`${p.nr||p.id} heeft geen uren per afdeling.`,module:'projecten',action:'Open Projecten'});
      s.overdue.forEach(t=>items.push({severity:'red',type:'task_overdue',projectId:p.id,taskId:t.row.id,title:'Taak verlopen',message:`${p.nr||p.id} · ${t.row.name||t.row.id} is verlopen en ${clampPct(t.row.progress)}% gereed.`,module:'gantt',action:'Open Gantt'}));
      s.blocked.forEach(t=>items.push({severity:'red',type:'task_blocked',projectId:p.id,taskId:t.row.id,title:'Taak geblokkeerd/aandacht',message:`${p.nr||p.id} · ${t.row.name||t.row.id}: ${t.row.feedback||t.row.why||t.row.status||'aandacht nodig'}.`,module:'projectoverzicht',action:'Open voortgang'}));
      s.tasks.filter(t=>!t.row.department).forEach(t=>items.push({severity:'orange',type:'task_no_dept',projectId:p.id,taskId:t.row.id,title:'Taak zonder afdeling',message:`${p.nr||p.id} · ${t.row.name||t.row.id} heeft geen afdeling.`,module:'gantt',action:'Open Gantt'}));
      s.tasks.filter(t=>!t.row.resource).forEach(t=>items.push({severity:'orange',type:'task_no_resource',projectId:p.id,taskId:t.row.id,title:'Taak zonder resource',message:`${p.nr||p.id} · ${t.row.name||t.row.id} heeft geen resource.`,module:'gantt',action:'Open Gantt'}));
      const lastTs=s.latestFeedbackAt||p.statusUpdatedAt||"";
      if(s.status!=='Gereed' && s.tasks.length && lastTs){ const age=dayDiff(lastTs.slice(0,10), todayIso()); if(age>7) items.push({severity:'orange',type:'stale_feedback',projectId:p.id,title:'Terugkoppeling ouder dan 7 dagen',message:`${p.nr||p.id} heeft al ${age} dagen geen recente terugkoppeling.`,module:'projectoverzicht',action:'Open voortgang'}); }
    });
    Object.entries(demand).forEach(([wk,byDept])=>Object.entries(byDept||{}).forEach(([dept,needed])=>{ const available=defaultAvailableWeek(st,dept); if(needed>available) items.push({severity:'red',type:'capacity_shortage',dept,week:wk,title:'Capaciteitstekort',message:`${dept} ${wk}: benodigd ${needed} u / beschikbaar ca. ${available} u.`,module:'capaciteit',action:'Open Capaciteit'}); else if(available && needed>available*.85) items.push({severity:'orange',type:'capacity_warn',dept,week:wk,title:'Capaciteit bijna vol',message:`${dept} ${wk}: ${needed} u van ca. ${available} u.`,module:'capaciteit',action:'Open Capaciteit'}); }));
    if(overridesCount(st)>0) items.push({severity:'blue',type:'capacity_overrides',title:'Handmatige capaciteitsafwijkingen',message:`${overridesCount(st)} handmatige dagcapaciteit-overrides actief.`,module:'capaciteit',action:'Open Capaciteit'});
    return items;
  }
  function healthForProject(st, projectId){
    const p=st.projects?.byId?.[projectId]||{}; const s=progressSummary(st,projectId); const items=attentionItems(st).filter(i=>i.projectId===projectId);
    let severity='green', label='Op schema';
    if(s.status==='Gereed' || s.pct>=100){ severity='gray'; label='Afgerond'; }
    else if(!s.tasks.length){ severity='blue'; label='Voorbereiding'; }
    if(items.some(i=>i.severity==='orange')){ severity='orange'; label='Aandacht'; }
    if(items.some(i=>i.severity==='red')){ severity='red'; label='Probleem'; }
    return { projectId, project:p, pct:s.pct, status:s.status, severity, label, reasons:items, latestFeedback:s.latestFeedback, taskCount:s.tasks.length, planningComplete:s.tasks.length>0 && !items.some(i=>['project_no_gantt','task_no_dept'].includes(i.type)) };
  }
  function dashboard(st){
    const items=attentionItems(st); const projects=projectList(st); const health=projects.map(p=>healthForProject(st,p.id));
    return {
      items, health,
      counters:{
        redProjects:health.filter(h=>h.severity==='red').length,
        orangeProjects:health.filter(h=>h.severity==='orange').length,
        overdueTasks:items.filter(i=>i.type==='task_overdue').length,
        capacityShortages:items.filter(i=>i.type==='capacity_shortage').length,
        noPlanning:items.filter(i=>i.type==='project_no_gantt').length,
        blockedTasks:items.filter(i=>i.type==='task_blocked').length,
        staleFeedback:items.filter(i=>i.type==='stale_feedback').length,
        overrides:overridesCount(st)
      }
    };
  }
  function severityClass(sev){ return ({red:'att-red',orange:'att-orange',green:'att-green',blue:'att-blue',gray:'att-gray'}[sev] || 'att-gray'); }
  function severityLabel(sev){ return ({red:'Rood',orange:'Oranje',green:'Groen',blue:'Blauw',gray:'Grijs'}[sev] || 'Info'); }
  function reasonHtml(items){ if(!items?.length) return '<p class="smallmuted">Geen aandachtspunten. Project staat op schema.</p>'; return `<ul class="attention-list">${items.map(i=>`<li class="${severityClass(i.severity)}"><strong>${esc(i.title)}</strong><br><span>${esc(i.message)}</span></li>`).join('')}</ul>`; }
  function openModule(module){ try{ if(window.parent?.Router) window.parent.Router.loadApp(module); else if(window.Router) window.Router.loadApp(module); }catch(_e){} }
  CWS.attention = { attentionItems, healthForProject, progressSummary, dashboard, deptList, capacityDemandByWeekDept, defaultAvailableWeek, severityClass, severityLabel, reasonHtml, openModule, esc };
})();
