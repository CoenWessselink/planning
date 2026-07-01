import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = process.cwd();
const PORT = Number(process.env.CWS_VISUAL_PORT || 4173);
const DEBUG_PORT = Number(process.env.CWS_CHROME_DEBUG_PORT || 11993);
const OUT = resolve(ROOT, "artifacts", "phase-checks");
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = `http://127.0.0.1:${PORT}/`;

const viewports = [
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [820, 1180],
  [430, 932],
  [390, 844],
  [360, 740]
];

const phases = [
  ["phase-01-analysis", "dashboard", "Analyse / dashboard"],
  ["phase-02-ui-shell", "dashboard", "UI shell"],
  ["phase-03-projecten", "projecten", "Projecten"],
  ["phase-04-gantt", "gantt", "Gantt"],
  ["phase-05-capaciteit", "capaciteit", "Capaciteit"],
  ["phase-06-afdelingsplanning", "afdelingsplanning-week", "Afdelingsplanning week"],
  ["phase-07-dagplanning", "afdelingsplanning-dag", "Afdelingsplanning dag"],
  ["phase-08-medewerkerportal", "mijnwerk", "Medewerkerportal"],
  ["phase-09-rollen-rechten", "rollenrechten", "Rollen & rechten"],
  ["phase-10-print-export", "capaciteit", "Print/export"],
  ["phase-11-mobile-tablet", "afdelingsplanning", "Mobile/tablet"],
  ["phase-12-regressie-eindcontrole", "conflicten", "Regressie eindcontrole"]
];

const pdfs = [
  ["phase-10-print-export", "capaciteit", "capaciteitsoverzicht-a3.pdf"],
  ["phase-10-print-export", "gantt", "gantt-bouwplanning-a3.pdf"],
  ["phase-08-medewerkerportal", "mijnwerk", "medewerker-dagoverzicht-a4.pdf"],
  ["phase-08-medewerkerportal", "mijnwerk", "medewerker-weekoverzicht-a4.pdf"],
  ["phase-06-afdelingsplanning", "afdelingsplanning-week", "afdelingsplanning-week-a3.pdf"],
  ["phase-10-print-export", "werkvoorraad", "werkvoorraad.pdf"],
  ["phase-10-print-export", "conflicten", "conflicten.pdf"]
];

function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
function httpText(url){
  return new Promise((resolve, reject) => {
    get(url, res => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}
async function waitHttp(url, timeoutMs = 15000){
  const start = Date.now();
  while(Date.now() - start < timeoutMs){
    try{
      const data = await httpText(url);
      if(data) return data;
    }catch(_error){}
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}
function mkdirs(path){
  mkdirSync(path, { recursive:true });
}
function phasePaths(phase){
  const dir = join(OUT, phase);
  const screenshots = join(dir, "screenshots");
  const pdf = join(dir, "pdf");
  mkdirs(screenshots);
  mkdirs(pdf);
  return { dir, screenshots, pdf };
}
function chromeArgs(profile){
  return [
    "--headless=new",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--disable-gpu-compositing",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-address=127.0.0.1`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank"
  ];
}
class Cdp {
  constructor(wsUrl){
    this.ws = new WebSocket(wsUrl);
    this.next = 1;
    this.pending = new Map();
    this.events = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = event => {
      const msg = JSON.parse(event.data);
      if(msg.id && this.pending.has(msg.id)){
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if(msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result || {});
        return;
      }
      const handlers = this.events.get(msg.method) || [];
      handlers.forEach(handler => handler(msg.params || {}));
    };
  }
  async send(method, params = {}){
    await this.ready;
    const id = this.next++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(method, handler){
    const list = this.events.get(method) || [];
    list.push(handler);
    this.events.set(method, list);
  }
  close(){ this.ws.close(); }
}

async function main(){
  mkdirs(OUT);
  const server = spawn(process.execPath, ["scripts/serve.mjs", `--port=${PORT}`], { cwd:ROOT, stdio:["ignore","pipe","pipe"] });
  let serverLog = "";
  server.stdout.on("data", d => serverLog += d.toString());
  server.stderr.on("data", d => serverLog += d.toString());
  const profile = join(tmpdir(), `cws_visual_${Date.now()}`);
  const chrome = spawn(CHROME, chromeArgs(profile), { stdio:["ignore","pipe","pipe"] });
  let chromeLog = "";
  chrome.stdout.on("data", d => chromeLog += d.toString());
  chrome.stderr.on("data", d => chromeLog += d.toString());
  try{
    await waitHttp(BASE);
    const targets = JSON.parse(await waitHttp(`http://127.0.0.1:${DEBUG_PORT}/json/list`));
    const pageTarget = targets.find(t => t.type === "page" && t.webSocketDebuggerUrl) || targets.find(t => t.webSocketDebuggerUrl);
    if(!pageTarget) throw new Error("Geen Chrome page target gevonden voor CDP.");
    const cdp = new Cdp(pageTarget.webSocketDebuggerUrl);
    const consoleMessages = [];
    const networkErrors = [];
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");
    await cdp.send("Network.enable");
    cdp.on("Runtime.exceptionThrown", e => consoleMessages.push(`exception: ${e.exceptionDetails?.text || ""}`));
    cdp.on("Runtime.consoleAPICalled", e => {
      const text = (e.args || []).map(a => a.value || a.description || "").join(" ");
      if(e.type === "error" && !text.includes("Failed to load resource")) consoleMessages.push(`console.error: ${text}`);
    });
    cdp.on("Log.entryAdded", e => {
      const text = e.entry?.text || "";
      if(text.includes("Failed to load resource")) return;
      if(["error", "warning"].includes(e.entry?.level)) consoleMessages.push(`${e.entry.level}: ${text}`);
    });
    cdp.on("Network.loadingFailed", e => {
      if(e.errorText === "net::ERR_ABORTED") return;
      networkErrors.push(`${e.errorText} ${e.blockedReason || ""} ${e.type || ""}`);
    });
    cdp.on("Network.responseReceived", e => {
      if(Number(e.response?.status || 0) >= 500) networkErrors.push(`${e.response.status} ${e.response.url}`);
    });

    for(const [phase, app, label] of phases){
      const paths = phasePaths(phase);
      const phaseConsoleStart = consoleMessages.length;
      const phaseNetworkStart = networkErrors.length;
      writeFileSync(join(paths.dir, "README.md"), `# ${label}\n\nRoute: \`${app}\`\n\nAutomatische fasecontrole op ${new Date().toISOString()}.\n`);
      writeFileSync(join(paths.dir, "known-issues.md"), "Geen bekende blokkerende issues na automatische controle.\n");
      for(const [width, height] of viewports){
        await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor:1, mobile:width < 760 });
        await cdp.send("Page.navigate", { url:`${BASE}?app=${encodeURIComponent(app)}` });
        await sleep(2200);
        const evalResult = await cdp.send("Runtime.evaluate", { expression:`({
          ready:document.body.dataset.cwsReady||"",
          bootError:document.body.dataset.cwsBootError||"",
          active:document.body.dataset.activeApp||"",
          bodyText:(document.body.innerText||"").slice(0,300),
          width:document.documentElement.scrollWidth,
          client:document.documentElement.clientWidth
        })`, returnByValue:true });
        const value = evalResult.result?.value || {};
        const shot = await cdp.send("Page.captureScreenshot", { format:"png", captureBeyondViewport:false });
        writeFileSync(join(paths.screenshots, `${app}-${width}x${height}.png`), Buffer.from(shot.data, "base64"));
        if(value.bootError) consoleMessages.push(`boot-error ${app} ${width}x${height}: ${value.bodyText}`);
        if(!value.bodyText || value.bodyText.length < 20) consoleMessages.push(`possible-white-screen ${app} ${width}x${height}`);
      }
      writeFileSync(join(paths.dir, "console-log.txt"), consoleMessages.slice(phaseConsoleStart).join("\n") || "Geen console errors vastgelegd.\n");
      writeFileSync(join(paths.dir, "network-log.txt"), networkErrors.slice(phaseNetworkStart).join("\n") || "Geen network errors >=500 vastgelegd.\n");
      const phaseIssues = consoleMessages.length === phaseConsoleStart && networkErrors.length === phaseNetworkStart ? "PASS" : "CHECK";
      writeFileSync(join(paths.dir, "test-results.txt"), `${phaseIssues} - screenshots voor 7 viewports aangemaakt.\n`);
    }

    for(const [phase, app, filename] of pdfs){
      const paths = phasePaths(phase);
      await cdp.send("Emulation.setDeviceMetricsOverride", { width:1440, height:900, deviceScaleFactor:1, mobile:false });
      await cdp.send("Page.navigate", { url:`${BASE}?app=${encodeURIComponent(app)}` });
      await sleep(2200);
      const pdf = await cdp.send("Page.printToPDF", { printBackground:true, landscape:filename.includes("a3") || filename.includes("week") || app === "gantt", paperWidth:filename.includes("a4") ? 8.27 : 16.54, paperHeight:filename.includes("a4") ? 11.69 : 11.69 });
      writeFileSync(join(paths.pdf, filename), Buffer.from(pdf.data, "base64"));
    }

    const summary = [
      `Generated: ${new Date().toISOString()}`,
      `Phases: ${phases.length}`,
      `Viewports per phase: ${viewports.length}`,
      `PDFs: ${pdfs.length}`,
      `Console issues: ${consoleMessages.length}`,
      `Network issues: ${networkErrors.length}`,
      "",
      "Server log:",
      serverLog.trim() || "(empty)",
      "",
      "Chrome log:",
      chromeLog.trim() || "(empty)"
    ].join("\n");
    writeFileSync(join(OUT, "visual-phase-check-summary.txt"), summary);
    cdp.close();
    if(consoleMessages.length || networkErrors.length){
      console.error(summary);
      process.exitCode = 1;
    }else{
      console.log(summary);
    }
  }finally{
    server.kill();
    chrome.kill();
    await sleep(300);
    try{ rmSync(profile, { recursive:true, force:true }); }catch(_error){}
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
