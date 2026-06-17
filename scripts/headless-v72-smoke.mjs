import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const chromeCandidates = process.platform === "win32"
  ? [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe")
    ]
  : process.platform === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
const chrome = chromeCandidates.find(candidate => candidate && fs.existsSync(candidate));

if (!chrome) {
  console.log("SKIP - Chrome niet gevonden; dependency-vrije fallback-tests blijven actief.");
  process.exit(0);
}

const port = 9410 + Math.floor(Math.random() * 200);
const debugPort = port + 1000;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cws-v72-chrome-"));
let server;
let browser;
let socket;
let sessionId;
let commandId = 0;
const pending = new Map();
let routeErrors = [];
let failed = false;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function check(label, pass, detail="") {
  console.log(`${pass ? "OK" : "FAIL"} - ${label}${detail ? `: ${detail}` : ""}`);
  if(!pass) failed = true;
}
async function waitFor(fn, timeout=15_000) {
  const started = Date.now();
  while(Date.now() - started < timeout) {
    try {
      const value = await fn();
      if(value) return value;
    } catch {}
    await delay(100);
  }
  throw new Error("Timeout tijdens wachten op browser/server.");
}
function cdp(method, params={}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => {
    const timer=setTimeout(()=>{
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    },15_000);
    pending.set(id, {
      resolve:value=>{ clearTimeout(timer); resolve(value); },
      reject:error=>{ clearTimeout(timer); reject(error); }
    });
  });
}
async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue:true, awaitPromise:true });
  if(result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser-evaluatie mislukt.");
  return result.result?.value;
}
async function openRoute(route, width=1440, height=1000) {
  routeErrors = [];
  await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor:1, mobile:width <= 820 });
  await cdp("Page.navigate", { url:`http://127.0.0.1:${port}/${route}` });
  await waitFor(async() => evaluate("document.readyState === 'complete' && !!window.CWS && !!document.body"), 20_000);
  await delay(350);
  const bodyLength = await evaluate("document.body?.innerText?.length || 0");
  const bootFailure = await evaluate("document.body?.innerText?.includes('CWS Planning kon niet starten') || false");
  check(`${route} rendert bij ${width}px`, bodyLength > 40 && !bootFailure, `body=${bodyLength}`);
  check(`${route} zonder kritieke consolefout`, routeErrors.length === 0, routeErrors.slice(0,2).join(" | "));
}
async function mouse(type, x, y, buttons=0) {
  await cdp("Input.dispatchMouseEvent", { type, x, y, button:"left", buttons, clickCount:1 });
}
async function wheel(x, y, deltaY, deltaX=0, modifiers=0) {
  await cdp("Input.dispatchMouseEvent", { type:"mouseWheel", x, y, deltaX, deltaY, modifiers });
}
async function dragPointer(targetExpression, deltaX, steps=5) {
  let target = await evaluate(targetExpression);
  if(!target) return null;
  const viewportWidth = await evaluate("window.innerWidth");
  if(target.x < 12 || target.x > viewportWidth - 12) {
    await evaluate(`document.querySelector('#boardWrap').scrollLeft += ${JSON.stringify(target.x - (viewportWidth * .72))}`);
    await delay(100);
    target = await evaluate(targetExpression);
  }
  if(!target || target.x < 12 || target.x > viewportWidth - 12) return null;
  await mouse("mouseMoved", target.x, target.y, 0);
  await mouse("mousePressed", target.x, target.y, 1);
  for(let step=1; step<=steps; step+=1) {
    await mouse("mouseMoved", target.x + (deltaX * step / steps), target.y, 1);
  }
  await mouse("mouseReleased", target.x + deltaX, target.y, 0);
  await delay(250);
  return target;
}

try {
  server = spawn(process.execPath, ["scripts/serve.mjs", `--port=${port}`], {
    cwd:process.cwd(),
    stdio:["ignore","pipe","pipe"],
    windowsHide:true
  });
  await waitFor(async() => {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const data = await response.json();
    return response.ok && data.ok && ["local-test-v73","local-test-v76","local-test-v77","local-test-v78"].includes(data.version);
  });
  check("lokale V73 health (V72 regressiesuite)", true);

  browser = spawn(chrome, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    "about:blank"
  ], { stdio:["ignore","ignore","ignore"], windowsHide:true });

  const pageTarget = await waitFor(async() => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    if(!response.ok) return null;
    const targets = await response.json();
    return targets.find(item => item.type === "page" && item.webSocketDebuggerUrl) || null;
  });
  socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if(message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if(message.error) item.reject(new Error(message.error.message));
      else item.resolve(message.result || {});
      return;
    }
    if(message.sessionId !== sessionId) return;
    if(message.method === "Runtime.exceptionThrown") {
      routeErrors.push(message.params?.exceptionDetails?.text || "Uncaught exception");
    }
    if(message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
      routeErrors.push((message.params.args || []).map(arg => arg.value || arg.description || "").join(" "));
    }
  };

  await cdp("Page.enable");
  await cdp("Runtime.enable");

  await cdp("Page.navigate", { url:`http://127.0.0.1:${port}/index.html?bootTest=remote-d1` });
  await waitFor(async() => evaluate("document.body?.dataset?.cwsShellReady === 'true'"), 10_000);
  check("V78 shell verschijnt voor remote state-ready", await evaluate("document.body.dataset.cwsReady !== 'true' && document.querySelector('#appFrame')?.hasAttribute('srcdoc')"));
  await evaluate("CWS.setState(s=>{ s.projects.byId['BOOT-BLOCKED']={id:'BOOT-BLOCKED',name:'Boot blocked'}; s.projects.order.push('BOOT-BLOCKED'); return s; }, {reason:'v78-boot-save-test'})");
  check("V78 save tijdens boot wordt geblokkeerd", await evaluate("CWS.storageStatus.savesBlockedDuringBoot >= 1 && !CWS.getState().projects.byId['BOOT-BLOCKED']"));
  await waitFor(async() => evaluate("document.body?.dataset?.cwsReady === 'true'"), 15_000);
  check("V78 vertraagde remote D1 wint", await evaluate("CWS.storageStatus.stateSource === 'remote-d1' && CWS.getState().projects.order.length === 76"));
  check("V78 productie-indicator gebruikt remote identity", await evaluate("CWS.getCurrentUser().email === 'remote-test@cws.test' && !document.querySelector('#userPill').textContent.includes('local-dev@cws.test')"));
  await waitFor(async() => evaluate("Number(document.querySelector('#appFrame')?.contentDocument?.querySelector('#rows')?.dataset?.renderedCount || 0) > 10"), 15_000);
  check("V78 Projecten hydrateert na state-ready", true);
  await evaluate("Router.loadApp('gantt')");
  await waitFor(async() => evaluate("document.querySelector('#appFrame')?.contentDocument?.querySelectorAll('#projectSel option')?.length > 10"), 15_000);
  check("V78 Gantt hydrateert na state-ready", true);
  await evaluate("Router.loadApp('capaciteit')");
  await waitFor(async() => evaluate("document.querySelector('#appFrame')?.contentDocument?.querySelector('#matrix') != null"), 15_000);
  check("V78 Capaciteit opent na state-ready", true);

  await cdp("Page.navigate", { url:`http://127.0.0.1:${port}/index.html?bootTest=production-regression&app=gantt` });
  await waitFor(async() => evaluate("document.body?.dataset?.cwsReady === 'true'"), 10_000);
  await waitFor(async() => evaluate("document.querySelector('#appFrame')?.contentDocument?.querySelectorAll('#tableRows tr')?.length >= 180"), 10_000);
  check("V79 productie-achtige boot blijft snel", await evaluate("CWS.storageStatus.bootDurationMs < 4000"), await evaluate("String(CWS.storageStatus.bootDurationMs) + ' ms'"));
  check("V79 Gantt toont projecten bij zware legacy-state", await evaluate("document.querySelector('#appFrame')?.contentDocument?.querySelectorAll('#projectSel option')?.length === 76"));
  check("V79 Gantt begrenst extreme legacy-datum", await evaluate("document.querySelector('#appFrame')?.contentDocument?.querySelectorAll('#timeline .tl-row .day')?.length <= 730"));
  check("V79 Gantt rendert 180 productietaken zonder wit scherm", await evaluate("document.querySelector('#appFrame')?.contentDocument?.querySelectorAll('#tableRows tr')?.length === 180"));

  await cdp("Page.navigate", { url:`http://127.0.0.1:${port}/index.html?fixture=restored-d1&bootTest=fallback` });
  await waitFor(async() => evaluate("document.body?.dataset?.cwsReady === 'true'"), 15_000);
  check("V78 fallback wordt pas na state-fout gekozen", await evaluate("CWS.storageStatus.stateSource === 'fixture' && CWS.getState().projects.order.length === 76"));
  check("V78 fallbackwaarschuwing zichtbaar", await evaluate("document.querySelector('#storageWarning')?.hidden === false && document.querySelector('#storageWarning')?.innerText.includes('V78 geforceerde state-fout')"));

  const desktopRoutes = [
    "index.html?fixture=restored-d1",
    "layers/laag3_projecten.html?fixture=restored-d1",
    "layers/laag4_gantt.html?fixture=restored-d1",
    "layers/laag5_capaciteit.html?fixture=restored-d1",
    "layers/laag6_projectoverzicht.html?fixture=restored-d1",
    "layers/laag7_projectplanning.html?fixture=restored-d1",
    "layers/laag8_planbord.html?fixture=restored-d1",
    "layers/laag9_transport.html?fixture=restored-d1",
    "layers/laag8_rapporten.html?fixture=restored-d1",
    "layers/laag9_dashboard.html?fixture=restored-d1",
    "layers/laag10_instellingen.html?fixture=restored-d1",
    "layers/laag10_nietwerkbaredagen.html?fixture=restored-d1",
    "layers/laag10_werknemers_werkweek.html?fixture=restored-d1",
    "layers/laag11_io.html?fixture=restored-d1",
    "layers/laag12_audit.html?fixture=restored-d1",
    "layers/laag13_preflight.html?fixture=restored-d1"
  ];
  for(const route of desktopRoutes) await openRoute(route, 1440, 1000);

  await openRoute("layers/laag3_projecten.html?fixture=restored-d1", 390, 844);
  check("Projecten fixture bevat 76 projecten", await evaluate("CWS.getState().projects.order.length === 76"));
  check("Projecten infinite-scroll marker", await evaluate("document.documentElement.dataset.projectsMode === 'infinite-scroll' || document.body.dataset.projectsMode === 'infinite-scroll' || document.documentElement.outerHTML.includes('infinite-scroll')"));

  for(const width of [768,1024]) {
    for(const route of [
      "layers/laag3_projecten.html?fixture=restored-d1",
      "layers/laag4_gantt.html?fixture=restored-d1",
      "layers/laag5_capaciteit.html?fixture=restored-d1",
      "layers/laag6_projectoverzicht.html?fixture=restored-d1",
      "layers/laag10_instellingen.html?fixture=restored-d1",
      "layers/laag11_io.html?fixture=restored-d1"
    ]) await openRoute(route, width, 900);
  }

  await openRoute("layers/laag4_gantt.html?fixture=restored-d1", 1440, 1000);
  check("Gantt projectdropdown gevuld", await evaluate("document.querySelectorAll('#projectSel option').length > 0"));
  const projectSearch = await evaluate(`(()=>{
    const input=document.querySelector('#projectSearch');
    const sel=document.querySelector('#projectSel');
    const before=sel?.value || "";
    if(!input || !sel) return {ok:false,reason:"missing controls"};
    const candidates=Array.from(document.querySelectorAll('#projectSel option')).map(option=>({id:option.value,label:option.textContent||""})).filter(item=>item.id && item.id!==before);
    const target=candidates.find(item=>/\\d/.test(item.label)) || candidates[0];
    if(!target) return {ok:false,reason:"missing target",before};
    const query=target.label.split(" - ").at(-1).trim().split(/\\s+/).slice(0,2).join(" ") || target.label.slice(0,8);
    input.focus();
    input.value=query;
    input.dispatchEvent(new Event("input",{bubbles:true}));
    const results=document.querySelector('#projectResults');
    const first=results?.querySelector('.project-result');
    const count=results?.querySelectorAll('.project-result')?.length || 0;
    const firstText=first?.innerText || "";
    const openBeforeSelect=!results?.hidden;
    first?.click();
    const after=sel.value;
    if(before && before!==after){
      sel.value=before;
      sel.dispatchEvent(new Event("change",{bubbles:true}));
    }
    return {ok:openBeforeSelect && count>0 && firstText.toLowerCase().includes(query.toLowerCase()) && after!==before,count,query,firstText,before,after};
  })()`);
  check("Gantt projectzoeker filtert en selecteert project", projectSearch.ok, JSON.stringify(projectSearch));
  check("Gantt brede continue balk zichtbaar", await evaluate("Array.from(document.querySelectorAll('.bar:not(.summary)')).some(el => el.getBoundingClientRect().width > 60)"));
  check("Gantt tabel bedekt de balken niet", await evaluate(`(()=>{const table=document.querySelector('.table-pane');const bar=document.querySelector('.bar:not(.summary):not(.locked)');if(!table||!bar)return false;const t=table.getBoundingClientRect(),r=bar.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return t.right<=r.left && !!hit?.closest('.bar');})()`));
  await evaluate("document.querySelector('#boardWrap').scrollLeft=0");
  await delay(150);
  const dragBefore = await dragPointer(`(()=>{const bar=document.querySelector('.bar:not(.summary):not(.locked)');if(!bar)return null;const r=bar.getBoundingClientRect();const id=bar.dataset.id;const pid=document.querySelector('#projectSel')?.value;const sc=CWS.getState().ganttV2.byProject[pid].sched[id];return {x:r.left+r.width/2,y:r.top+r.height/2,id,pid,start:sc.start,end:sc.end};})()`, 66);
  if(dragBefore) {
    const dragged = await evaluate(`(()=>{const sc=CWS.getState().ganttV2.byProject[${JSON.stringify(dragBefore.pid)}].sched[${JSON.stringify(dragBefore.id)}];return {ok:sc.start!==${JSON.stringify(dragBefore.start)} && CWS.getState().meta.lastAction==='gantt_task_moved',start:sc.start,end:sc.end,lastAction:CWS.getState().meta.lastAction,validation:CWS.getLastValidation()};})()`);
    check("Gantt drag werkt met één mutatie", dragged.ok, JSON.stringify(dragged));
  } else check("Gantt dragbare balk gevonden", false);

  const resizeBefore = await dragPointer(`(()=>{const bar=document.querySelector('.bar:not(.summary):not(.locked)');const h=bar?.querySelector('.handle.right');if(!bar||!h)return null;const r=h.getBoundingClientRect();const id=bar.dataset.id;const pid=document.querySelector('#projectSel')?.value;const sc=CWS.getState().ganttV2.byProject[pid].sched[id];return {x:r.left+r.width/2,y:r.top+r.height/2,id,pid,start:sc.start,end:sc.end};})()`, 66);
  if(resizeBefore) {
    const resized = await evaluate(`(()=>{const st=CWS.getState(),model=st.ganttV2.byProject[${JSON.stringify(resizeBefore.pid)}],sc=model.sched[${JSON.stringify(resizeBefore.id)}],row=model.rows.find(item=>item.id===${JSON.stringify(resizeBefore.id)});return {ok:sc.start===${JSON.stringify(resizeBefore.start)} && sc.end!==${JSON.stringify(resizeBefore.end)} && row.duration===sc.workdays && sc.workdays<50 && st.meta.lastAction==='gantt_task_resized',start:sc.start,end:sc.end,workdays:sc.workdays,duration:row.duration,lastAction:st.meta.lastAction,audit:st.auditLog?.at(-1)?.meta,before:${JSON.stringify(resizeBefore)},validation:CWS.getLastValidation()};})()`);
    check("Gantt rechter-resize houdt start vast", resized.ok, JSON.stringify(resized));
  } else check("Gantt resize-handle gevonden", false);

  let persistedTask = null;
  const leftResizeBefore = await dragPointer(`(()=>{const bar=document.querySelector('.bar:not(.summary):not(.locked)');const h=bar?.querySelector('.handle.left');if(!bar||!h)return null;const r=h.getBoundingClientRect();const id=bar.dataset.id;const pid=document.querySelector('#projectSel')?.value;const sc=CWS.getState().ganttV2.byProject[pid].sched[id];return {x:r.left+r.width/2,y:r.top+r.height/2,id,pid,start:sc.start,end:sc.end};})()`, 44);
  if(leftResizeBefore) {
    const resized = await evaluate(`(()=>{const st=CWS.getState(),model=st.ganttV2.byProject[${JSON.stringify(leftResizeBefore.pid)}],sc=model.sched[${JSON.stringify(leftResizeBefore.id)}],row=model.rows.find(item=>item.id===${JSON.stringify(leftResizeBefore.id)});return {ok:sc.start!==${JSON.stringify(leftResizeBefore.start)} && sc.end===${JSON.stringify(leftResizeBefore.end)} && row.duration===sc.workdays && sc.workdays<50 && st.meta.lastAction==='gantt_task_resized',start:sc.start,end:sc.end,workdays:sc.workdays,duration:row.duration,lastAction:st.meta.lastAction,audit:st.auditLog?.at(-1)?.meta,before:${JSON.stringify(leftResizeBefore)},validation:CWS.getLastValidation()};})()`);
    check("Gantt linker-resize houdt einde vast", resized.ok, JSON.stringify(resized));
    if(resized.ok) persistedTask = { pid:leftResizeBefore.pid, id:leftResizeBefore.id, start:resized.start, end:resized.end, workdays:resized.workdays };
  } else check("Gantt linker resize-handle gevonden", false);

  if(persistedTask) {
    await openRoute("layers/laag4_gantt.html", 1440, 1000);
    const persisted = await evaluate(`(()=>{const model=CWS.getState().ganttV2.byProject[${JSON.stringify(persistedTask.pid)}],sc=model?.sched?.[${JSON.stringify(persistedTask.id)}];return {ok:!!sc && sc.start===${JSON.stringify(persistedTask.start)} && sc.end===${JSON.stringify(persistedTask.end)},start:sc?.start,end:sc?.end};})()`);
    check("Gantt wijziging blijft behouden na refresh/heropen", persisted.ok, JSON.stringify(persisted));
    await openRoute("layers/laag5_capaciteit.html", 1440, 1000);
    const capacity = await evaluate(`(()=>{const st=CWS.getState(),wanted=${JSON.stringify(persistedTask)},sources=st.gantt?.sourcesByDay||{},hours=st.gantt?.hoursByDay||{};const rows=[];Object.entries(sources).forEach(([date,byDept])=>Object.entries(byDept||{}).forEach(([dept,items])=>(Array.isArray(items)?items:[]).forEach(item=>{if(item.projectId===wanted.pid && (item.taskId===wanted.id || item.rowId===wanted.id)) rows.push({date,dept,hours:Number(item.hours)||0,projectId:item.projectId,taskId:item.taskId,taskName:item.taskName,hoursSource:item.hoursSource,allocationMode:item.allocationMode,start:item.start,end:item.end});})));const weekendRows=rows.filter(r=>{const d=new Date(r.date+'T00:00:00Z').getUTCDay();return d===0||d===6;});const total=rows.reduce((sum,r)=>sum+r.hours,0);return {ok:rows.length>0 && total>0 && rows.some(r=>r.date>=wanted.start && r.date<=wanted.end) && rows.every(r=>r.hoursSource==='project-dept-hours'||r.hoursSource==='manual-override') && weekendRows.length===0,rows:rows.slice(0,3),rowCount:rows.length,total,weekendRows,hourDays:Object.keys(hours).length};})()`);
    check("Capaciteit rekent door vanuit Gantt hoursByDay/sourcesByDay", capacity.ok, JSON.stringify(capacity));
    await openRoute("layers/laag4_gantt.html", 1440, 1000);
  }

  const repeatedBefore = await dragPointer(`(()=>{const bar=document.querySelector('.bar:not(.summary):not(.locked)');const h=bar?.querySelector('.handle.right');if(!bar||!h)return null;const r=h.getBoundingClientRect(),id=bar.dataset.id,pid=document.querySelector('#projectSel')?.value,model=CWS.getState().ganttV2.byProject[pid],sc=model.sched[id],row=model.rows.find(item=>item.id===id);return {x:r.left+r.width/2,y:r.top+r.height/2,id,pid,start:sc.start,end:sc.end,workdays:sc.workdays,duration:row.duration};})()`, 22);
  if(repeatedBefore) {
    const repeated = await evaluate(`(()=>{const model=CWS.getState().ganttV2.byProject[${JSON.stringify(repeatedBefore.pid)}],sc=model.sched[${JSON.stringify(repeatedBefore.id)}],row=model.rows.find(item=>item.id===${JSON.stringify(repeatedBefore.id)});return {ok:sc.start===${JSON.stringify(repeatedBefore.start)} && sc.workdays===row.duration && sc.workdays>=${Number(repeatedBefore.workdays)} && sc.workdays<=${Number(repeatedBefore.workdays)+1},start:sc.start,end:sc.end,workdays:sc.workdays,duration:row.duration,before:${JSON.stringify(repeatedBefore)}};})()`);
    check("Gantt opeenvolgende resize telt alleen werkelijk gesnapte werkdag", repeated.ok, JSON.stringify(repeated));
  } else check("Gantt herhaalde resize-handle gevonden", false);

  const clampBefore = await dragPointer(`(()=>{const bar=document.querySelector('.bar:not(.summary):not(.locked)');const h=bar?.querySelector('.handle.left');if(!bar||!h)return null;const r=h.getBoundingClientRect();const id=bar.dataset.id;const pid=document.querySelector('#projectSel')?.value;return {x:r.left+r.width/2,y:r.top+r.height/2,id,pid};})()`, 900, 8);
  if(clampBefore) {
    const clamped = await evaluate(`(()=>{const sc=CWS.getState().ganttV2.byProject[${JSON.stringify(clampBefore.pid)}].sched[${JSON.stringify(clampBefore.id)}];return {ok:sc.start===sc.end,start:sc.start,end:sc.end,validation:CWS.getLastValidation()};})()`);
    check("Gantt linker-resize kruist einddatum niet", clamped.ok, JSON.stringify(clamped));
  }
  const rightClampBefore = await dragPointer(`(()=>{const bar=document.querySelector('.bar:not(.summary):not(.locked)');const h=bar?.querySelector('.handle.right');if(!bar||!h)return null;const r=h.getBoundingClientRect();const id=bar.dataset.id;const pid=document.querySelector('#projectSel')?.value;return {x:r.left+r.width/2,y:r.top+r.height/2,id,pid};})()`, -900, 8);
  if(rightClampBefore) {
    const clamped = await evaluate(`(()=>{const sc=CWS.getState().ganttV2.byProject[${JSON.stringify(rightClampBefore.pid)}].sched[${JSON.stringify(rightClampBefore.id)}];return {ok:sc.start===sc.end,start:sc.start,end:sc.end,validation:CWS.getLastValidation()};})()`);
    check("Gantt rechter-resize kruist startdatum niet", clamped.ok, JSON.stringify(clamped));
  }

  await openRoute("layers/laag4_gantt.html?fixture=restored-d1", 1440, 1000);
  const compact = await evaluate(`(()=>{const row=document.querySelector('.gantt-table tbody tr'),table=document.querySelector('.gantt-table'),bar=document.querySelector('.bar:not(.summary)');return {rowHeight:row?.getBoundingClientRect().height||0,tableFont:parseFloat(getComputedStyle(table).fontSize)||0,barHeight:bar?.getBoundingClientRect().height||0};})()`);
  const fonts = await evaluate(`(()=>({field:parseFloat(getComputedStyle(document.querySelector('.taskname')).fontSize)||0,hours:parseFloat(getComputedStyle(document.querySelector('.hours-source-cell .cellinput')).fontSize)||0,auto:parseFloat(getComputedStyle(document.querySelector('.hours-source-select')).fontSize)||0}))()`);
  check("Gantt desktopweergave gebruikt leesbare tabel en compacte urenbron", compact.rowHeight <= 39 && compact.tableFont === 11 && fonts.field === 11 && fonts.hours <= 9 && fonts.auto <= 9 && compact.barHeight <= 35, JSON.stringify({...compact,...fonts}));
  const scrollTarget = await evaluate(`(()=>{const wrap=document.querySelector('#boardWrap');wrap.style.maxHeight='240px';wrap.scrollTop=0;const r=wrap.getBoundingClientRect();return {x:r.left+r.width*.75,y:r.top+r.height*.7};})()`);
  await wheel(scrollTarget.x, scrollTarget.y, 240);
  await delay(100);
  check("Gantt wielscroll werkt zonder voorafgaande klik", await evaluate("document.querySelector('#boardWrap').scrollTop > 0"));
  const horizontalTarget = await evaluate(`(()=>{const wrap=document.querySelector('#boardWrap');wrap.style.maxHeight='none';wrap.scrollTop=0;wrap.scrollLeft=0;const r=wrap.getBoundingClientRect();return {x:r.left+r.width*.75,y:r.top+Math.min(r.height*.5,300)};})()`);
  await wheel(horizontalTarget.x, horizontalTarget.y, 0, 260);
  await delay(100);
  check("Gantt horizontale wielscroll werkt zonder voorafgaande klik", await evaluate("document.querySelector('#boardWrap').scrollLeft > 0"));

  await cdp("Emulation.setEmulatedMedia", { media:"print" });
  await evaluate("window.print=()=>{};document.querySelector('#printBtn').click()");
  await delay(450);
  const printLayout = await evaluate(`(()=>{const left=document.querySelector('#printTaskTable').getBoundingClientRect().width,chart=document.querySelector('#chartPane').getBoundingClientRect().width,total=left+chart,pid=document.querySelector('#projectSel').value,model=CWS.getState().ganttV2.byProject[pid],starts=Object.values(model.sched||{}).map(sc=>sc?.start).filter(Boolean).sort(),firstTask=starts[0],expected=new Date(firstTask+'T00:00:00Z');expected.setUTCDate(expected.getUTCDate()-7);return {printing:document.body.classList.contains('printing'),left,chart,total,dayW:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dayW'))||0,firstTask,expectedStart:expected.toISOString().slice(0,10),printStart:document.querySelector('#timeline .tl-cell.day')?.dataset.iso||''};})()`);
  check("Gantt A3-print past zonder browser-miniatuurschaal", printLayout.total <= 1510 && printLayout.total >= 1400 && printLayout.chart > 800, JSON.stringify(printLayout));
  check("Gantt A3-print start exact één week voor eerste taak", printLayout.printStart === printLayout.expectedStart, JSON.stringify(printLayout));
  await cdp("Emulation.setEmulatedMedia", { media:"screen" });
  await openRoute("layers/laag4_gantt.html?fixture=restored-d1", 1440, 1000);

  const corrupted = await evaluate(`(()=>{const bar=document.querySelector('.bar:not(.summary):not(.locked)');if(!bar)return null;const id=bar.dataset.id,pid=document.querySelector('#projectSel')?.value;CWS.setState(st=>{const model=st.ganttV2.byProject[pid],row=model.rows.find(item=>item.id===id),sc=model.sched[id];row.duration=4;model.sched[id]={...sc,start:'2026-06-01',end:'2028-02-21',workdays:638,explicitRange:false};return st;});return {id,pid};})()`);
  await delay(300);
  check("Gantt duurkolom toont betrouwbare taakduur", await evaluate(`document.querySelector('tr[data-id="${corrupted.id}"] .duration-input')?.value === '4'`));
  const recoveredResizeBefore = corrupted && await dragPointer(`(()=>{const bar=document.querySelector('.bar[data-id="${corrupted.id}"]'),h=bar?.querySelector('.handle.right');if(!bar||!h)return null;const r=h.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,id:${JSON.stringify(corrupted.id)},pid:${JSON.stringify(corrupted.pid)}};})()`, 22);
  if(recoveredResizeBefore) {
    const recoveredResize = await evaluate(`(()=>{const model=CWS.getState().ganttV2.byProject[${JSON.stringify(corrupted.pid)}],row=model.rows.find(item=>item.id===${JSON.stringify(corrupted.id)}),sc=model.sched[${JSON.stringify(corrupted.id)}];return {ok:row.duration===sc.workdays && sc.workdays>=4 && sc.workdays<=5,start:sc.start,end:sc.end,workdays:sc.workdays,duration:row.duration};})()`);
    check("Gantt resize springt niet naar legacy-einddatum of 600+ dagen", recoveredResize.ok, JSON.stringify(recoveredResize));
  } else check("Gantt legacy resize-handle gevonden", false);
  await evaluate(`CWS.setState(st=>{const model=st.ganttV2.byProject[${JSON.stringify(corrupted.pid)}],row=model.rows.find(item=>item.id===${JSON.stringify(corrupted.id)}),sc=model.sched[${JSON.stringify(corrupted.id)}];row.duration=4;model.sched[${JSON.stringify(corrupted.id)}]={...sc,start:'2026-06-01',end:'2028-02-21',workdays:638,explicitRange:false};return st;})`);
  await delay(250);
  await evaluate("document.querySelector('#boardWrap').scrollTop=0;document.querySelector('#boardWrap').scrollLeft=0");
  const recoveredBefore = corrupted && await dragPointer(`(()=>{const bar=document.querySelector('.bar[data-id="${corrupted.id}"]');if(!bar)return null;const r=bar.getBoundingClientRect();return {x:r.left+Math.min(r.width/2,120),y:r.top+r.height/2,id:${JSON.stringify(corrupted.id)},pid:${JSON.stringify(corrupted.pid)}};})()`, 44);
  if(recoveredBefore) {
    const recovered = await evaluate(`(()=>{const st=CWS.getState(),model=st.ganttV2.byProject[${JSON.stringify(corrupted.pid)}],row=model.rows.find(item=>item.id===${JSON.stringify(corrupted.id)}),sc=model.sched[${JSON.stringify(corrupted.id)}];const span=(new Date(sc.end+'T00:00:00Z')-new Date(sc.start+'T00:00:00Z'))/86400000;return {ok:row.duration===4 && sc.workdays===4 && span<14,start:sc.start,end:sc.end,workdays:sc.workdays,duration:row.duration,span};})()`);
    check("Gantt slepen herstelt geen 600+ dagen uit legacy-einddatum", recovered.ok, JSON.stringify(recovered));
  } else check("Gantt legacy-duur regressiebalk gevonden", false);

  await openRoute("layers/laag5_capaciteit.html?fixture=restored-d1", 390, 844);
  await evaluate("CWS.rebuildGanttHoursByDay()");
  check("Capaciteit toont uren", await evaluate("Object.keys(CWS.getState().gantt.hoursByDay || {}).length > 0"));
  check("Capaciteit scrollbar aanwezig", await evaluate("!!document.querySelector('#matrixScrollProxy')"));

  await openRoute("layers/laag11_io.html?fixture=restored-d1", 390, 844);
  check("State Doctor runtime werkt", await evaluate("CWS.recovery.buildStateDoctorReport().checks.length >= 8"));
} catch (error) {
  console.error(error);
  failed = true;
} finally {
  try { await cdp("Browser.close"); } catch {}
  try { socket?.close(); } catch {}
  try { browser?.kill(); } catch {}
  try { server?.kill(); } catch {}
  try { fs.rmSync(profile, { recursive:true, force:true }); } catch {}
}

if(failed) process.exit(1);
console.log("V72 headless Chrome-smoketest geslaagd.");
