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
  console.log("SKIP - Chrome niet gevonden; V73 statische preflight blijft actief.");
  process.exit(0);
}

const port = 9730 + Math.floor(Math.random() * 120);
const debugPort = port + 1000;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cws-v73-responsive-"));
let server;
let browser;
let socket;
let sessionId;
let commandId = 0;
let failed = false;
let consoleErrors = [];
const pending = new Map();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function check(label, pass, detail="") {
  console.log(`${pass ? "OK" : "FAIL"} - ${label}${detail ? `: ${detail}` : ""}`);
  if (!pass) failed = true;
}

async function waitFor(fn, timeout=20_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const result = await fn();
      if (result) return result;
    } catch {}
    await delay(100);
  }
  throw new Error("Timeout tijdens V73 browsertest.");
}

function cdp(method, params={}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 15_000);
    pending.set(id, {
      resolve:value => { clearTimeout(timer); resolve(value); },
      reject:error => { clearTimeout(timer); reject(error); }
    });
  });
}

async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue:true, awaitPromise:true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser-evaluatie mislukt.");
  return result.result?.value;
}

async function openShell(width, height=900) {
  consoleErrors = [];
  await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor:1, mobile:width < 768 });
  await cdp("Page.navigate", { url:`http://127.0.0.1:${port}/index.html?fixture=restored-d1` });
  await waitFor(() => evaluate("document.readyState === 'complete' && document.body?.dataset.cwsReady === 'true'"));
  await delay(500);
}

async function loadModule(appId) {
  consoleErrors = [];
  const expectedPath = await evaluate(`Router.appFrames[${JSON.stringify(appId)}]`);
  await evaluate(`Router.loadApp(${JSON.stringify(appId)})`);
  await waitFor(() => evaluate(`(()=>{
    const frame=document.querySelector("#appFrame");
    if(!frame?.contentDocument?.body || frame.contentDocument.readyState!=="complete") return false;
    try{
      return frame.contentWindow.location.pathname.endsWith(${JSON.stringify(expectedPath)})
        && frame.contentDocument.body.innerText.length > 8;
    }catch(_error){ return false; }
  })()`));
  await delay(400);
}

async function frameEval(expression) {
  return evaluate(`(()=>{const frame=document.querySelector("#appFrame");return frame.contentWindow.eval(${JSON.stringify(expression)});})()`);
}

try {
  server = spawn(process.execPath, ["scripts/serve.mjs", `--port=${port}`], {
    cwd:process.cwd(),
    stdio:["ignore","pipe","pipe"],
    windowsHide:true
  });
  await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const data = await response.json();
    return response.ok && ["local-test-v73","local-test-v76","local-test-v77","local-test-v78","local-test-v86","local-test-v87"].includes(data.version);
  });
  check("lokale V73 health", true);

  browser = spawn(chrome, [
    "--headless=new",
    "--no-sandbox", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`, "about:blank"
  ], { stdio:["ignore","ignore","ignore"], windowsHide:true });

  const pageTarget = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    if (!response.ok) return null;
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
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message));
      else item.resolve(message.result || {});
      return;
    }
    if (message.sessionId !== sessionId) return;
    if (message.method === "Runtime.exceptionThrown") {
      consoleErrors.push(message.params?.exceptionDetails?.text || "Uncaught exception");
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
      consoleErrors.push((message.params.args || []).map(arg => arg.value || arg.description || "").join(" "));
    }
  };

  await cdp("Page.enable");
  await cdp("Runtime.enable");

  for (const [width, height, expected] of [[360,740,"mobile-small"], [390,844,"mobile-small"], [844,390,"tablet-portrait"], [768,1024,"tablet-portrait"], [1024,768,"tablet-landscape"], [1180,820,"tablet-landscape"], [1440,900,"desktop"]]) {
    await openShell(width, height);
    const shell = await evaluate(`(()=>({
      viewport:document.body.dataset.cwsV73Viewport,
      family:["is-mobile","is-tablet","is-desktop"].find(c=>document.body.classList.contains(c)),
      menuVisible:document.querySelector("#openApps")?.getBoundingClientRect().width>0,
      bodyOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
    }))()`);
    check(`shell classificeert ${width}x${height}`, shell.viewport === expected, JSON.stringify(shell));
    check(`menu bereikbaar op ${width}x${height}`, shell.menuVisible);
    check(`geen onbedoelde shell body-overflow op ${width}x${height}`, shell.bodyOverflow <= 2, `delta=${shell.bodyOverflow}`);
    check(`shell zonder kritieke consolefout op ${width}x${height}`, consoleErrors.length === 0, consoleErrors.slice(0,2).join(" | "));
  }

  const allModules = [
    "dashboard", "projecten", "gantt", "capaciteit", "projectoverzicht",
    "projectplanning", "planbord", "transport", "rapporten", "instellingen",
    "nietwerkbaredagen", "werknemerswerkweek", "importexport", "audit", "preflight"
  ];
  const keyModules = ["projecten","gantt","capaciteit","projectoverzicht","instellingen","importexport"];
  for (const width of [390,768,1024,1440]) {
    await openShell(width);
    const modules = width <= 768 ? allModules : keyModules;
    for (const appId of modules) {
      await loadModule(appId);
      const result = await frameEval(`(()=>({
        text:document.body.innerText.length,
        ready:document.documentElement.dataset.cwsV73Responsive==="true",
        viewport:document.body.dataset.cwsV73Viewport,
        overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
      }))()`);
      check(`${appId} rendert responsive op ${width}px`, result.text > 8 && result.ready, JSON.stringify(result));
      check(`${appId} zonder kritieke consolefout op ${width}px`, consoleErrors.length === 0, consoleErrors.slice(0,2).join(" | "));
    }
  }

  await openShell(390, 844);
  await loadModule("dashboard");
  const mobileDashboard = await frameEval(`(()=>{const el=document.querySelector('[data-testid="mobile-dashboard"]');return !!el && getComputedStyle(el).display!=="none";})()`);
  check("Mobiel dashboard/cockpit zichtbaar", mobileDashboard);

  await loadModule("projecten");
  const mobileProjects = await frameEval(`(()=>{
    const view=document.querySelector('[data-testid="mobile-projects"]');
    const forbidden=["Boven","Compact","Menu","Brondata","Uren per afdeling","Import Excel","Kolommen","Export CSV","Print A3"];
    const visibleButtons=Array.from(document.querySelectorAll('button')).filter(b=>getComputedStyle(b).display!=="none" && b.offsetParent!==null).map(b=>b.textContent.trim());
    return {
      visible:!!view && getComputedStyle(view).display!=="none",
      cards:document.querySelectorAll('.mobile-project-card').length,
      tableVisible:getComputedStyle(document.querySelector('.table-wrap')).display!=="none",
      forbiddenTop:forbidden.filter(label=>visibleButtons.includes(label))
    };
  })()`);
  check("Projecten mobiel kaartweergave zichtbaar", mobileProjects.visible && mobileProjects.cards > 0 && !mobileProjects.tableVisible, JSON.stringify(mobileProjects));
  check("Projecten mobiel toont geen verboden desktopknoppen bovenin", mobileProjects.forbiddenTop.length === 0, JSON.stringify(mobileProjects));
  const moreSheet = await evaluate(`(()=>{document.querySelector('[data-mobile-app="more"]')?.click(); const s=document.querySelector('#mobileMoreSheet'); return !!s && s.classList.contains('show') && s.textContent.includes('Projectoverzicht') && s.textContent.includes('Import / Export');})()`);
  check("Mobiele Meer-bottom-sheet opent", moreSheet);
  await frameEval(`(()=>{document.querySelector("#newProject")?.click();return true;})()`);
  await delay(150);
  const projectModal = await frameEval(`(()=>{const m=document.querySelector("#npBackdrop .modal");const r=m?.getBoundingClientRect();return {open:document.querySelector("#npBackdrop")?.classList.contains("show"),left:r?.left,top:r?.top,right:r?.right,bottom:r?.bottom,vw:innerWidth,vh:innerHeight,saveVisible:!!document.querySelector("#npSave")};})()`);
  check("Projectpopup past binnen 390px viewport", projectModal.open && projectModal.left >= -1 && projectModal.top >= -1 && projectModal.right <= projectModal.vw + 1 && projectModal.bottom <= projectModal.vh + 1, JSON.stringify(projectModal));
  check("Projectpopup opslaan bereikbaar", projectModal.saveVisible);

  await loadModule("gantt");
  const gantt = await frameEval(`(()=>({
    selector:document.querySelector("#mobileProjectSel")?.getBoundingClientRect().width>0,
    workbar:!!document.querySelector('[data-testid="mobile-gantt-workbar"]') && getComputedStyle(document.querySelector('[data-testid="mobile-gantt-workbar"]')).display!=="none",
    scroll:document.querySelector(".board-wrap")?.scrollWidth>document.querySelector(".board-wrap")?.clientWidth,
    hint:!!document.querySelector(".v73-gantt-mobile-hint") && getComputedStyle(document.querySelector(".v73-gantt-mobile-hint")).display!=="none"
  }))()`);
  check("Gantt mobiel selector/workbar/scroll/fallback", gantt.selector && gantt.workbar && gantt.scroll && gantt.hint, JSON.stringify(gantt));
  const taskPopup = await frameEval(`(()=>{const row=document.querySelector('#tableRows tr'); row?.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})); return document.querySelector('#modalBack')?.classList.contains('show');})()`);
  check("Gantt taakpopup opent mobiel", taskPopup);

  await loadModule("capaciteit");
  const capacity = await frameEval(`(()=>{const w=document.querySelector(".matrix-wrap");return {scroll:!!w && w.scrollWidth>w.clientWidth,proxy:!!document.querySelector("#matrixScrollProxy"),workbar:!!document.querySelector('[data-testid="mobile-capacity-workbar"]') && getComputedStyle(document.querySelector('[data-testid="mobile-capacity-workbar"]')).display!=="none"};})()`);
  check("Capaciteit mobiele matrix horizontaal scrollbaar", capacity.scroll && capacity.proxy && capacity.workbar, JSON.stringify(capacity));
  const whyPopup = await frameEval(`(()=>{const cell=document.querySelector('.hm-cell'); cell?.click(); return document.querySelector('#modalBack')?.classList.contains('show');})()`);
  check("Capaciteit WHY popup opent mobiel", whyPopup);

  await openShell(1440, 1000);
  await loadModule("gantt");
  const desktopGantt = await frameEval(`(()=>({
    both:document.querySelector(".board")?.children.length>=2,
    bars:Array.from(document.querySelectorAll(".bar:not(.summary)")).some(b=>b.getBoundingClientRect().width>60),
    handles:!!document.querySelector(".bar:not(.summary) .handle.right")
  }))()`);
  check("Desktop Gantt-layout en drag/resize-handles behouden", desktopGantt.both && desktopGantt.bars && desktopGantt.handles, JSON.stringify(desktopGantt));
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

if (failed) process.exit(1);
console.log("V73 responsive Chrome-smoketest geslaagd.");
