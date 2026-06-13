import fs from "node:fs";

let ok = true;
function check(label, pass){
  console.log(`${pass ? "OK" : "FAIL"} - ${label}`);
  if(!pass) ok = false;
}

const read = (file) => fs.readFileSync(file, "utf8");
const pkg = read("package.json");
const playwright = read("playwright.config.js");
const server = read("playwright/server.js");
const store = read("js/core/store.js");
const health = read("functions/api/health.js");

check("V69 package script geregistreerd", /"preflight:v69"\s*:\s*"node scripts\/v69-test-runner-hardening-preflight\.mjs"/.test(pkg));
check("Playwright draait volledige tests-map", /testDir:\s*['"]\.\/tests['"]/.test(playwright));
check("Playwright draait niet meer alleen acceptance", !/testDir:\s*['"]\.\/tests\/acceptance['"]/.test(playwright));
check("Lokale Express health retourneert ok:true", /ok:\s*true/.test(server) && /healthMode:\s*['"]local-test-server['"]/.test(server));
check("Lokale Express health gebruikt herkenbare V69 testversie", /version:\s*['"]local-test-v69['"]/.test(server));
check("Store default ganttV2.ui is volledig", /ganttV2:\s*\{\s*expanded:\s*\{\}\s*,\s*byProject:\s*\{\}\s*,\s*ui:\s*\{\s*showCritical:\s*false\s*,\s*showDeps:\s*true\s*,\s*viewMode:\s*['"]both['"]\s*,\s*zoom:\s*['"]week['"]\s*\}\s*\}/.test(store));
check("Store herstelt ontbrekende ganttV2.ui keys met Object.assign", /Object\.assign\(\s*\{\s*showCritical:\s*false\s*,\s*showDeps:\s*true\s*,\s*viewMode:\s*['"]both['"]\s*,\s*zoom:\s*['"]week['"]\s*\}/.test(store));
check("V69 runtime marker aanwezig", /V69_TEST_RUNNER_HARDENING/.test(store));
check("V69 health marker aanwezig", /internal-test-v69/.test(health) && /v69-lightweight-no-state-load/.test(health));

if(!ok) process.exit(1);
