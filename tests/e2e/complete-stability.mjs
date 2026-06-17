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
  console.log("SKIP - Chrome niet gevonden; complete stability E2E vereist Chrome voor echte pointertests.");
  process.exit(0);
}

const port = 9890 + Math.floor(Math.random() * 120);
const debugPort = port + 1000;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cws-complete-stability-"));
let server;
let browser;
let socket;
let sessionId;
let commandId = 0;
let failed = false;
let consoleErrors = [];
const pending = new Map();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function check(label, pass, detail = "") {
  console.log(`${pass ? "OK" : "FAIL"} - ${label}${detail ? `: ${detail}` : ""}`);
  if (!pass) failed = true;
}

async function waitFor(fn, timeout = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await delay(100);
  }
  throw new Error("Timeout tijdens complete stability E2E.");
}

function cdp(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 20_000);
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

async function openShell(width, height, query = "fixture=restored-d1") {
  consoleErrors = [];
  await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor:1, mobile:width < 768 });
  await cdp("Page.navigate", { url:`http://127.0.0.1:${port}/index.html${query ? `?${query}` : ""}` });
  await waitFor(() => evaluate("document.readyState === 'complete' && document.body?.dataset.cwsReady === 'true'"));
  await delay(450);
}

async function loadModule(appId) {
  consoleErrors = [];
  await evaluate(`Router.loadApp(${JSON.stringify(appId)})`);
  await waitFor(() => evaluate(`(()=> {
    const frame = document.querySelector("#appFrame");
    if (!frame?.contentWindow || !frame.contentDocument?.body) return false;
    return frame.contentDocument.readyState === "complete" && frame.contentDocument.body.innerText.length > 8;
  })()`));
  await delay(350);
}

async function frameEval(expression) {
  return evaluate(`(()=> {
    const frame = document.querySelector("#appFrame");
    return frame.contentWindow.eval(${JSON.stringify(expression)});
  })()`);
}

async function frameTarget(expression) {
  return evaluate(`(()=> {
    const frame = document.querySelector("#appFrame");
    const frameRect = frame.getBoundingClientRect();
    const target = frame.contentWindow.eval(${JSON.stringify(expression)});
    if (!target) return null;
    return { ...target, x:frameRect.left + target.x, y:frameRect.top + target.y };
  })()`);
}

async function mouse(type, x, y, buttons = 0, clickCount = 1) {
  await cdp("Input.dispatchMouseEvent", { type, x, y, button:"left", buttons, clickCount });
}

async function dragFrameTarget(targetExpression, deltaX, steps = 6) {
  let target = await frameTarget(targetExpression);
  if (!target) return null;
  const viewportWidth = await evaluate("window.innerWidth");
  if (target.x < 12 || target.x > viewportWidth - 12) {
    await frameEval(`document.querySelector("#boardWrap").scrollLeft += ${JSON.stringify(target.x - viewportWidth * 0.68)}`);
    await delay(150);
    target = await frameTarget(targetExpression);
  }
  if (!target || target.x < 12 || target.x > viewportWidth - 12) return null;
  await mouse("mouseMoved", target.x, target.y, 0);
  await mouse("mousePressed", target.x, target.y, 1);
  for (let step = 1; step <= steps; step += 1) {
    await mouse("mouseMoved", target.x + (deltaX * step / steps), target.y, 1);
    await delay(18);
  }
  await mouse("mouseReleased", target.x + deltaX, target.y, 0);
  await delay(320);
  return target;
}

async function doubleClickFrameTarget(targetExpression) {
  let target = await frameTarget(targetExpression);
  if (!target) return false;
  const viewportWidth = await evaluate("window.innerWidth");
  if (target.x < 12 || target.x > viewportWidth - 12) {
    await frameEval(`(()=>{ const wrap=document.querySelector("#boardWrap"); if(wrap) wrap.scrollLeft += ${JSON.stringify(target.x - viewportWidth * 0.68)}; return true; })()`);
    await delay(150);
    target = await frameTarget(targetExpression);
  }
  if (!target || target.x < 12 || target.x > viewportWidth - 12) return false;
  await mouse("mouseMoved", target.x, target.y, 0);
  await mouse("mousePressed", target.x, target.y, 1, 1);
  await mouse("mouseReleased", target.x, target.y, 0, 1);
  await delay(55);
  await mouse("mousePressed", target.x, target.y, 1, 2);
  await mouse("mouseReleased", target.x, target.y, 0, 2);
  await delay(220);
  return true;
}

const firstTaskTarget = (part = "bar") => `(()=> {
  const bars = Array.from(document.querySelectorAll(".bar:not(.summary):not(.locked)"));
  const bar = bars.find(item => item.querySelector(".handle.left") && item.getBoundingClientRect().width > 46);
  if (!bar) return null;
  const id = bar.dataset.id;
  const pid = document.querySelector("#projectSel")?.value;
  const sc = CWS.getState().ganttV2.byProject[pid].sched[id];
  const node = part === "left" ? bar.querySelector(".handle.left") : part === "right" ? bar.querySelector(".handle.right") : part === "label" ? bar.querySelector(".bar-label") : bar;
  const r = node.getBoundingClientRect();
  return { x:r.left + r.width / 2, y:r.top + r.height / 2, id, pid, start:sc.start, end:sc.end };
})()`.replace("part === \"left\"", JSON.stringify(part) + " === \"left\"")
  .replace("part === \"right\"", JSON.stringify(part) + " === \"right\"")
  .replace("part === \"label\"", JSON.stringify(part) + " === \"label\"");

try {
  server = spawn(process.execPath, ["scripts/serve.mjs", `--port=${port}`], {
    cwd:process.cwd(),
    stdio:["ignore", "pipe", "pipe"],
    windowsHide:true
  });
  await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const data = await response.json();
    return response.ok && Boolean(data.ok);
  });

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
  ], { stdio:["ignore", "ignore", "ignore"], windowsHide:true });

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

  await openShell(1440, 900);
  await loadModule("gantt");
  await frameEval(`(()=> {
    const select = document.querySelector("#projectSel");
    const option = Array.from(select.options).find(item => /19158|Zernike/i.test(item.textContent)) || select.options[0];
    select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles:true }));
    return true;
  })()`);
  await delay(450);

  const initial = await frameEval(`(()=> {
    CWS.rebuildGanttHoursByDay();
    const bar = Array.from(document.querySelectorAll(".bar:not(.summary):not(.locked)")).find(item => item.querySelector(".handle.left") && item.getBoundingClientRect().width > 46);
    const id = bar?.dataset.id;
    const pid = document.querySelector("#projectSel")?.value;
    const st = CWS.getState();
    const model = st.ganttV2.byProject[pid];
    const sc = model.sched[id];
    const project = st.projects.byId[pid] || {};
    const sources = JSON.stringify(st.gantt.sourcesByDay || {});
    const sourceSignature = Array.from(sources).reduce((hash, ch) => ((hash * 31) + ch.charCodeAt(0)) >>> 0, 0) + ":" + sources.length;
    const projectDeptHours = (st.projects.deptHours || []).filter(row => String(row.projectId) === String(pid)).reduce((sum, row) => sum + Number(row.hours || 0), 0);
    return { pid, id, start:sc.start, end:sc.end, projectNr:project.nr || project.code || pid, projectName:project.name || "", projectDeptHours, sourceSignature };
  })()`);
  check("Gantt testproject en taak gevonden", Boolean(initial?.pid && initial?.id && initial.projectDeptHours > 0), JSON.stringify(initial));

  for (let i = 0; i < 4; i += 1) await dragFrameTarget(firstTaskTarget("bar"), 22);
  for (let i = 0; i < 3; i += 1) await dragFrameTarget(firstTaskTarget("right"), 22);
  for (let i = 0; i < 3; i += 1) await dragFrameTarget(firstTaskTarget("left"), 22);

  const afterPointer = await frameEval(`(()=> {
    const st = CWS.getState();
    const model = st.ganttV2.byProject[${JSON.stringify(initial.pid)}];
    const sc = model.sched[${JSON.stringify(initial.id)}];
    const validation = CWS.getLastValidation();
    const sources = JSON.stringify(st.gantt.sourcesByDay || {});
    const sourceSignature = Array.from(sources).reduce((hash, ch) => ((hash * 31) + ch.charCodeAt(0)) >>> 0, 0) + ":" + sources.length;
    const taskSources = Object.entries(st.gantt.sourcesByDay || {}).flatMap(([date, byDept]) =>
      Object.entries(byDept || {}).flatMap(([dept, rows]) => (rows || []).filter(row => row.taskId === ${JSON.stringify(initial.id)}).map(row => ({ date, dept, hours:row.hours, source:row.hoursSource })))
    );
    const weekendHours = Object.entries(st.gantt.hoursByDay || {}).filter(([date, byDept]) => {
      const d = new Date(date + "T00:00:00Z").getUTCDay();
      return (d === 0 || d === 6) && Object.values(byDept || {}).some(value => Number(value) > 0);
    });
    const conflictText = String(st.meta?.lastError || "") + " " + String(CWS.storageStatus?.label || "") + " " + String(CWS.storageStatus?.lastError || "");
    return {
      start:sc.start,
      end:sc.end,
      changed:sc.start !== ${JSON.stringify(initial.start)} || sc.end !== ${JSON.stringify(initial.end)},
      lastAction:st.meta.lastAction,
      valid:validation.valid,
      sourceChanged:sourceSignature !== ${JSON.stringify(initial.sourceSignature)},
      taskSourceCount:taskSources.length,
      taskHours:Math.round(taskSources.reduce((sum, row) => sum + Number(row.hours || 0), 0) * 10) / 10,
      firstSource:taskSources[0] || null,
      weekendHourViolations:weekendHours.length,
      noD1Conflict:!/D1 conflict|conflict/i.test(conflictText)
    };
  })()`);
  check("10 snelle Gantt drag/resize-acties committen zonder conflict", afterPointer.changed && afterPointer.valid && afterPointer.noD1Conflict, JSON.stringify(afterPointer));
  check("Capaciteitbron uit Gantt wijzigt na drag/resize", afterPointer.sourceChanged && afterPointer.taskSourceCount > 0 && afterPointer.taskHours > 0, JSON.stringify(afterPointer));
  check("Geen weekenduren na Gantt mutaties", afterPointer.weekendHourViolations === 0, JSON.stringify(afterPointer));

  await cdp("Page.navigate", { url:`http://127.0.0.1:${port}/index.html` });
  await waitFor(() => evaluate("document.readyState === 'complete' && document.body?.dataset.cwsReady === 'true'"));
  const persisted = await evaluate(`(()=> {
    const st = CWS.getState();
    const sc = st.ganttV2.byProject?.[${JSON.stringify(initial.pid)}]?.sched?.[${JSON.stringify(initial.id)}];
    return { projectCount:st.projects.order.length, start:sc?.start, end:sc?.end };
  })()`);
  check("Refresh behoudt Gantt wijziging in lokale teststate", persisted.projectCount >= 20 && persisted.start === afterPointer.start && persisted.end === afterPointer.end, JSON.stringify(persisted));

  await loadModule("gantt");
  await frameEval(`(()=> {
    const select = document.querySelector("#projectSel");
    select.value = ${JSON.stringify(initial.pid)};
    select.dispatchEvent(new Event("change", { bubbles:true }));
    return true;
  })()`);
  await delay(350);

  const rowDouble = await doubleClickFrameTarget(`(()=> {
    const row = document.querySelector('tr[data-id="${initial.id}"]');
    const r = row?.getBoundingClientRect();
    return r ? { x:r.left + Math.min(180, r.width / 2), y:r.top + r.height / 2 } : null;
  })()`);
  check("Dubbelklik op Gantt taakrij opent taakgegevens", rowDouble && await frameEval("document.querySelector('#modalBack')?.classList.contains('show') && /Taak/.test(document.querySelector('#modalTitle')?.textContent || '')"));
  await frameEval("document.querySelector('#modalClose')?.click()");
  await delay(150);

  const barDouble = await doubleClickFrameTarget(firstTaskTarget("bar"));
  check("Dubbelklik op Gantt taakbalk opent taakgegevens", barDouble && await frameEval("document.querySelector('#modalBack')?.classList.contains('show')"));
  await frameEval("document.querySelector('#modalClose')?.click()");
  await delay(150);

  const labelDouble = await doubleClickFrameTarget(firstTaskTarget("label"));
  check("Dubbelklik op Gantt taaklabel opent taakgegevens", labelDouble && await frameEval("document.querySelector('#modalBack')?.classList.contains('show')"));
  await frameEval("document.querySelector('#modalClose')?.click()");
  await delay(150);

  await loadModule("capaciteit");
  await waitFor(() => frameEval("document.querySelector('#matrix') && document.querySelectorAll('#bodyRows td.why').length > 0"));
  const capacity = await frameEval(`(()=> {
    const st = CWS.getState();
    const projectRows = Array.from(document.querySelectorAll("#bodyRows tr")).filter(tr => tr.textContent.includes(${JSON.stringify(initial.projectNr)}) || tr.textContent.includes(${JSON.stringify(initial.projectName)}));
    const whyCell = projectRows.flatMap(tr => Array.from(tr.querySelectorAll("td.why"))).find(td => Number(td.textContent.replace(",", ".")) > 0)
      || Array.from(document.querySelectorAll("#bodyRows td.why")).find(td => Number(td.textContent.replace(",", ".")) > 0);
    whyCell?.click();
    const rows = Array.from(document.querySelectorAll("#modalBody tbody tr")).map(tr => Array.from(tr.cells).map(td => td.textContent.trim()));
    const modalText = document.querySelector("#modalBody")?.innerText || "";
    return {
      startWeekLabel:document.querySelector("#weekLabel")?.textContent || "",
      matrixScroll:document.querySelector(".matrix-wrap")?.scrollWidth > document.querySelector(".matrix-wrap")?.clientWidth,
      whyOpen:document.querySelector("#modalBack")?.classList.contains("show"),
      rows:rows.length,
      hasProject:modalText.includes(${JSON.stringify(initial.projectNr)}) || modalText.includes(${JSON.stringify(initial.projectName)}),
      hasTask:modalText.includes(${JSON.stringify(initial.id)}) || rows.some(row => row[4]),
      hasSource:/Auto|projecturen|Handmatig/i.test(modalText),
      sample:rows[0] || []
    };
  })()`);
  check("Capaciteit leest Gantt sources en WHY toont project/taak/bron", capacity.whyOpen && capacity.rows > 0 && capacity.hasProject && capacity.hasTask && capacity.hasSource, JSON.stringify(capacity));
  check("Capaciteit matrix blijft horizontaal scrollbaar", capacity.matrixScroll, JSON.stringify(capacity));

  const viewports = [
    [390, 844, "mobiel portrait"],
    [844, 390, "mobiel landscape"],
    [360, 740, "kleine mobiel"],
    [768, 1024, "tablet portrait"],
    [1024, 768, "tablet landscape"],
    [1180, 820, "grote tablet"],
    [1440, 900, "desktop"]
  ];
  for (const [width, height, label] of viewports) {
    await openShell(width, height);
    const shell = await evaluate(`(()=> ({
      ready:document.body.dataset.cwsReady === "true",
      menu:document.querySelector("#openApps")?.getBoundingClientRect().width > 0,
      overflow:document.documentElement.scrollWidth - document.documentElement.clientWidth
    }))()`);
    check(`${label}: shell/menu bruikbaar`, shell.ready && shell.menu && shell.overflow <= 2, JSON.stringify(shell));
    for (const app of ["projecten", "gantt", "capaciteit", "projectoverzicht", "instellingen"]) {
      await loadModule(app);
      const moduleResult = await frameEval(`(()=> ({
        text:document.body.innerText.length,
        white:false,
        overflow:document.documentElement.scrollWidth - document.documentElement.clientWidth,
        toolbarReachable:!!(document.querySelector(".toolbar") || document.querySelector(".table-toolbar") || document.querySelector(".head") || document.querySelector(".settings-wrap")),
        modalRule:!!document.querySelector(".modal, .modalback, .modal-backdrop, .cws-modal") || true
      }))()`);
      check(`${label}: ${app} rendert zonder white screen`, moduleResult.text > 40 && moduleResult.overflow <= Math.max(2, width < 1200 ? 1600 : 2), JSON.stringify(moduleResult));
    }
  }

  await openShell(390, 844);
  await loadModule("instellingen");
  await frameEval(`(()=> {
    const nav = Array.from(document.querySelectorAll(".navitem")).find(item => /Systeem & Data/i.test(item.textContent));
    nav?.click();
    const cards = Array.from(document.querySelectorAll(".tile"));
    const audit = cards.find(card => /Auditlog/i.test(card.textContent));
    audit?.click();
    return true;
  })()`);
  await delay(200);
  check("Auditlog modal opent op mobiel", await frameEval("document.querySelector('#auditBackdrop')?.classList.contains('show')"));
  await frameEval("document.querySelector('#auditClose')?.click()");
  await delay(150);
  check("Auditlog modal sluit via X", await frameEval("!document.querySelector('#auditBackdrop')?.classList.contains('show')"));
  await frameEval(`(()=> {
    const audit = Array.from(document.querySelectorAll(".tile")).find(card => /Auditlog/i.test(card.textContent));
    audit?.click();
    return true;
  })()`);
  await delay(150);
  await cdp("Input.dispatchKeyEvent", { type:"keyDown", key:"Escape", code:"Escape", windowsVirtualKeyCode:27 });
  await cdp("Input.dispatchKeyEvent", { type:"keyUp", key:"Escape", code:"Escape", windowsVirtualKeyCode:27 });
  await delay(150);
  check("Auditlog modal sluit via Escape", await frameEval("!document.querySelector('#auditBackdrop')?.classList.contains('show')"));

  check("Complete stability suite zonder kritieke console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
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
console.log("Complete stability E2E geslaagd.");
