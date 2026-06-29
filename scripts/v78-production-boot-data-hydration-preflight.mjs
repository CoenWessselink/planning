import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const store = read("js/core/store.js");
const router = read("js/core/router.js");
const index = read("index.html");
const io = read("layers/laag11_io.html");
const gantt = read("layers/laag4_gantt.html");
const capacity = read("layers/laag5_capaciteit.html");
const projects = read("layers/laag3_projecten.html");
const health = read("functions/api/health.js");
const stateApi = read("functions/api/state.js");
const identityApi = read("functions/api/identity.js");
const localServer = read("scripts/serve.mjs");

const checks = [];
const add = (ok, label) => checks.push({ ok:Boolean(ok), label });

add(pkg.scripts?.["preflight:v78"] === "node scripts/v78-production-boot-data-hydration-preflight.mjs", "package.json bevat preflight:v78");
add((pkg.scripts?.["preflight:all"] || "").includes("run-all-preflights"), "preflight:all ontdekt V78");
add(health.includes("internal-test-v78") && health.includes("v78-lightweight-no-state-load"), "health bevat internal-test-v78");
add(localServer.includes("local-test-v78"), "lokale server bevat local-test-v78");
add(store.includes("V78_PRODUCTION_BOOT_DATA_HYDRATION_FIX") && store.includes("BOOT_PHASES"), "centrale V78 boot state machine bestaat");
for (const phase of [
  "booting", "shell-ready", "identity-loading", "identity-ready", "identity-failed-nonblocking",
  "remote-state-loading", "remote-state-ready", "remote-state-failed", "local-fallback-considered",
  "state-normalized", "app-ready", "boot-error"
]) add(store.includes(`"${phase}"`), `bootfase ${phase} bestaat`);
add(store.includes("stateHasAuthoritativeBusinessData") && store.includes("projectOrder > 10") && store.includes("projectById > 10"), "D1 businessdata heeft harde prioriteit boven fallback");
add(store.includes("const healthPromise = storageAdapter.detect()") && store.includes("const remote = await storageAdapter.load()"), "health is geen gate meer voor D1 state-load");
add(store.includes("API_IDENTITY") && store.includes("identity-failed-nonblocking") && identityApi.includes("actorEmail"), "Access identity wordt non-blocking opgehaald");
add(store.includes("Save tijdens boot geblokkeerd") && store.includes("savesBlockedDuringBoot"), "save tijdens boot guard bestaat");
add(store.includes("stateSource !== \"remote-d1\"") && store.includes("fallback mag productie-D1 niet automatisch overschrijven"), "fallback kan productie-D1 niet automatisch overschrijven");
add(stateApi.includes("assertIncomingStateSafe") && stateApi.includes("projectCount <= 5") && stateApi.includes("v118-empty-state-guard"), "server blokkeert 0/1/5-project overwrite");
add(store.includes("STATE_FETCH_TIMEOUT_MS = 30000"), "D1 state-timeout is niet extreem kort");
add(store.includes("if(runtime.isLocal) currentUser = { email:\"local-dev@cws.test\""), "local-dev identiteit is beperkt tot lokale runtime");
add(router.includes("showLoading") && router.includes("CWS.isStateReady") && router.includes("markReady"), "router laadt modules pas na state-ready");
add(index.includes("cwsShellReady") && index.indexOf("Router.boot()") < index.indexOf("await CWS.init()"), "shell/menu start voor remote hydration");
add(index.includes("Router.markReady()") && index.includes('dataset.cwsReady = "true"'), "modules renderen opnieuw na app-ready");
add(projects.includes("CWS.subscribe") && capacity.includes("CWS.subscribe") && gantt.includes("scheduleRender"), "hoofdmodules ondersteunen state-rerender/scheduling");
add(!/function render\([^)]*\)\s*\{[\s\S]{0,600}?saveModel\(/.test(gantt), "Gantt render roept saveModel niet aan");
add(gantt.includes("v74DragResizeFreezeFix:true") && gantt.includes("v75PointerLifecycleFix:true"), "Gantt V74/V75 pointer lifecycle fixes blijven aanwezig");
add(io.includes("Boot &amp; Data Diagnose") && io.includes("getDiagnostics"), "Boot & Data Diagnose bestaat");
add(store.includes("setStateCallsDuringBoot") && store.includes("rendersDuringBoot") && store.includes("lastSuccessfulD1LoadAt"), "bootdiagnose bevat counters en D1-laadtijd");
add(!store.includes("state = normalizeState(state);\n    state.user = state.user || {};\n    state.user.email = currentUser.email;\n    state.ui"), "actieve V78 boot normaliseert gekozen state niet dubbel");

let failed = false;
for (const check of checks) {
  console.log(`${check.ok ? "OK" : "FAIL"} - ${check.label}`);
  if (!check.ok) failed = true;
}
if (failed) process.exit(1);
console.log(`V78 production boot/data hydration preflight geslaagd (${checks.length} controles).`);
