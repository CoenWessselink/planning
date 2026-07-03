import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const read = file => fs.readFileSync(file, "utf8");
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
const port = 10480 + Math.floor(Math.random() * 160);
const debugPort = port + 1200;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cws-v192-workability-"));
let server;
let browser;
let socket;
let commandId = 0;
let failed = false;
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
  throw new Error("Timeout tijdens V192 werkbaarheidstest.");
}

function cdp(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
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

async function openShell(appId, width = 1440, height = 900) {
  await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor:1, mobile:width < 768 });
  const started = Date.now();
  await cdp("Page.navigate", { url:`http://127.0.0.1:${port}/index.html?fixture=restored-d1&app=${encodeURIComponent(appId)}&v192=${Date.now()}` });
  await waitFor(() => evaluate(`document.body?.dataset.cwsReady === "true"`));
  await waitFor(() => frameEval(`document.readyState === "complete" && document.body.innerText.length > 20`));
  return Date.now() - started;
}

async function loadModule(appId) {
  const started = Date.now();
  await evaluate(`Router.loadApp(${JSON.stringify(appId)})`);
  await waitFor(() => frameEval(`document.readyState === "complete" && document.body.innerText.length > 20`));
  await delay(150);
  return Date.now() - started;
}

async function frameEval(expression) {
  return evaluate(`(()=> {
    const frame = document.querySelector("#appFrame");
    return frame.contentWindow.eval(${JSON.stringify(expression)});
  })()`);
}

function staticChecks() {
  const layers = read("js/core/complete_prompt_layers.js");
  const interaction = read("js/core/interactive_planning.js");
  const pkg = JSON.parse(read("package.json"));
  check("Afdelingsplanning heeft echte klikpopups", layers.includes("openDayDetail") && layers.includes("openAssignmentModal") && layers.includes("data-add-planning"));
  check("Afdelingsplanning toont Gantt V2 planning als fallback", interaction.includes("ganttV2") && interaction.includes("source:\"ganttV2\""));
  check("Werkbaarheid/snelheid/checks aanwezig", layers.includes("data-run-planning-check") && layers.includes("What-if scenario") && layers.includes("planningScenarios"));
  check("Rollenmatrix is wijzigbaar", layers.includes("data-role-permission") && layers.includes("updateRolePermission") && layers.includes("data-new-role"));
  check("V192 preflight geregistreerd", pkg.scripts?.["preflight:v192"] === "node scripts/v192-workability-regression.mjs");
}

try {
  staticChecks();
  if (!chrome) {
    console.log("SKIP - Chrome niet gevonden; V192 browserdeel overgeslagen.");
    process.exit(failed ? 1 : 0);
  }

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
      if (message.error) item.reject(new Error(message.error.message || "CDP fout"));
      else item.resolve(message.result || {});
    }
  };
  await cdp("Page.enable");
  await cdp("Runtime.enable");

  const weekReady = await openShell("afdelingsplanning-week", 1440, 900);
  const week = await frameEval(`(()=>({
    cells:document.querySelectorAll("[data-drop-date]").length,
    tasks:document.querySelectorAll("[data-assignment-id]").length,
    toolbar:Boolean(document.querySelector("[data-run-planning-check]")),
    add:Boolean(document.querySelector("[data-add-planning]")),
    text:document.body.innerText.slice(0, 140)
  }))()`);
  check("Afdelingsplanning week toont echte taken", week.tasks > 0 && week.cells >= 25, JSON.stringify(week));
  check("Afdelingsplanning werkbaarheid/nieuwe planning acties zichtbaar", week.toolbar && week.add, JSON.stringify(week));
  check("Afdelingsplanning week laadt snel", weekReady < 2500, `${weekReady}ms`);

  await loadModule("afdelingsplanning-maand");
  const dayModal = await frameEval(`(()=> {
    const day = Array.from(document.querySelectorAll("[data-day-date]")).find(node => /gepland/.test(node.innerText)) || document.querySelector("[data-day-date]");
    day?.click();
    return { overlays:document.querySelectorAll(".cws-modal-overlay").length, title:document.querySelector(".cws-modal-title")?.textContent || "" };
  })()`);
  check("Klik op dag opent zichtbare popup", dayModal.overlays === 1 && dayModal.title.includes("Dagplanning"), JSON.stringify(dayModal));
  await frameEval(`document.querySelector(".cws-modal-hdr [aria-label='Sluiten']")?.click()`);

  const addModal = await frameEval(`(()=> {
    document.querySelector("[data-add-planning]")?.click();
    return { overlays:document.querySelectorAll(".cws-modal-overlay").length, title:document.querySelector(".cws-modal-title")?.textContent || "", fields:document.querySelectorAll("[data-assignment-form] [data-field]").length };
  })()`);
  check("Nieuwe planning opent invoerpopup", addModal.overlays === 1 && addModal.fields >= 8, JSON.stringify(addModal));
  await frameEval(`document.querySelector(".cws-modal-hdr [aria-label='Sluiten']")?.click()`);

  const rolesReady = await loadModule("rollenrechten");
  const roles = await frameEval(`(()=>({
    checkboxes:document.querySelectorAll("[data-role-permission]").length,
    newRole:Boolean(document.querySelector("[data-new-role]")),
    security:Boolean(document.querySelector("[data-security-check]"))
  }))()`);
  check("Rollen en rechten toont bewerkbare matrix", roles.checkboxes >= 60 && roles.newRole && roles.security, JSON.stringify(roles));
  check("Rollen en rechten laadt snel", rolesReady < 2500, `${rolesReady}ms`);

  const roleToggle = await frameEval(`(()=> {
    const cb = document.querySelector('[data-role-id="viewer"][data-role-permission="print_export"]');
    if(!cb) return { found:false };
    const original = cb.checked;
    cb.click();
    const changed = (parent.CWS.getState().roles.viewer.permissions || []).includes("print_export");
    const again = document.querySelector('[data-role-id="viewer"][data-role-permission="print_export"]');
    if(again && again.checked !== original) again.click();
    const restored = (parent.CWS.getState().roles.viewer.permissions || []).includes("print_export");
    return { found:true, original, changed, restored };
  })()`);
  check("Rollen en rechten wijzigen en herstellen state", roleToggle.found && roleToggle.changed !== roleToggle.original && roleToggle.restored === roleToggle.original, JSON.stringify(roleToggle));

  const securityModal = await frameEval(`(()=> {
    document.querySelector("[data-security-check]")?.click();
    return { overlays:document.querySelectorAll(".cws-modal-overlay").length, title:document.querySelector(".cws-modal-title")?.textContent || "" };
  })()`);
  check("Security test opent popup", securityModal.overlays === 1 && securityModal.title.includes("Security"), JSON.stringify(securityModal));

} finally {
  try { socket?.close(); } catch {}
  try { browser?.kill(); } catch {}
  try { server?.kill(); } catch {}
  try { fs.rmSync(profile, { recursive:true, force:true }); } catch {}
}

if (failed) process.exit(1);
console.log("V192 werkbaarheidstest geslaagd.");
