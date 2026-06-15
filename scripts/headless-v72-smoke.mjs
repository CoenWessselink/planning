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
    const resized = await evaluate(`(()=>{const st=CWS.getState(),sc=st.ganttV2.byProject[${JSON.stringify(resizeBefore.pid)}].sched[${JSON.stringify(resizeBefore.id)}];return {ok:sc.start===${JSON.stringify(resizeBefore.start)} && sc.end!==${JSON.stringify(resizeBefore.end)} && st.meta.lastAction==='gantt_task_resized',start:sc.start,end:sc.end,lastAction:st.meta.lastAction,audit:st.auditLog?.at(-1)?.meta,before:${JSON.stringify(resizeBefore)},validation:CWS.getLastValidation()};})()`);
    check("Gantt rechter-resize houdt start vast", resized.ok, JSON.stringify(resized));
  } else check("Gantt resize-handle gevonden", false);

  const leftResizeBefore = await dragPointer(`(()=>{const bar=document.querySelector('.bar:not(.summary):not(.locked)');const h=bar?.querySelector('.handle.left');if(!bar||!h)return null;const r=h.getBoundingClientRect();const id=bar.dataset.id;const pid=document.querySelector('#projectSel')?.value;const sc=CWS.getState().ganttV2.byProject[pid].sched[id];return {x:r.left+r.width/2,y:r.top+r.height/2,id,pid,start:sc.start,end:sc.end};})()`, 44);
  if(leftResizeBefore) {
    const resized = await evaluate(`(()=>{const st=CWS.getState(),sc=st.ganttV2.byProject[${JSON.stringify(leftResizeBefore.pid)}].sched[${JSON.stringify(leftResizeBefore.id)}];return {ok:sc.start!==${JSON.stringify(leftResizeBefore.start)} && sc.end===${JSON.stringify(leftResizeBefore.end)} && st.meta.lastAction==='gantt_task_resized',start:sc.start,end:sc.end,lastAction:st.meta.lastAction,audit:st.auditLog?.at(-1)?.meta,before:${JSON.stringify(leftResizeBefore)},validation:CWS.getLastValidation()};})()`);
    check("Gantt linker-resize houdt einde vast", resized.ok, JSON.stringify(resized));
  } else check("Gantt linker resize-handle gevonden", false);

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
