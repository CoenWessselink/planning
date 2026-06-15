import fs from "node:fs";

const fail = (msg) => { console.error(`V76 preflight faalt: ${msg}`); process.exit(1); };
const read = (file) => fs.readFileSync(file, "utf8");
const gantt = read("layers/laag4_gantt.html");
const pkg = JSON.parse(read("package.json"));
const health = fs.existsSync("functions/api/health.js") ? read("functions/api/health.js") : "";
const server = fs.existsSync("playwright/server.js") ? read("playwright/server.js") : "";

if(!pkg.scripts?.["preflight:v76"]) fail("package.json mist preflight:v76");
if(!gantt.includes("function selectableProjects")) fail("selectableProjects ontbreekt");
if(!gantt.includes("function currentProjectId(st=state())")) fail("currentProjectId gebruikt nog geen stabiele state-parameter");
if(!gantt.includes("function modelForRender")) fail("render-only modelForRender ontbreekt");
if(!gantt.includes("renderen mag nooit saveModel")) fail("V76 render-zonder-save marker ontbreekt");
const ensureMatch = gantt.match(/function ensureModel\(projectId\)\{([\s\S]*?)\n    \}/);
if(!ensureMatch) fail("ensureModel ontbreekt");
if(ensureMatch[1].includes("saveModel(")) fail("ensureModel mag tijdens render geen saveModel meer aanroepen");
if(/function render\(\)\{[^]*?const liveModel=ensureModel\(/.test(gantt)) fail("render gebruikt nog ensureModel in plaats van modelForRender");
if(!/function render\(\)\{[^]*?const st=state\(\);[^]*?renderFilters\(st\);[^]*?const pid=currentProjectId\(st\);/.test(gantt)) fail("render gebruikt geen eenduidige state/projectselectie");
if(!gantt.includes("function scheduleRender")) fail("coalesced scheduleRender ontbreekt");
if(!gantt.includes("scheduleRender(\"store-subscribe\")")) fail("subscriber rendert nog direct in plaats van coalesced");
if(!gantt.includes("UI._renderScheduled")) fail("render scheduling guard ontbreekt");
if(!gantt.includes("v76BootRenderLoopFix:true")) fail("drag/resize metadata mist v76BootRenderLoopFix");
if(health && !health.includes("internal-test-v76")) fail("health mist internal-test-v76");
if(server && !server.includes("local-test-v76")) fail("playwright server mist local-test-v76");
console.log("V76 boot/render-loop preflight geslaagd.");
