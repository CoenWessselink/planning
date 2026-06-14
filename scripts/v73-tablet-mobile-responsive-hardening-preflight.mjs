import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const exists = file => fs.existsSync(path.join(root, file));
let failed = false;

function check(label, pass) {
  console.log(`${pass ? "OK" : "FAIL"} - ${label}`);
  if (!pass) failed = true;
}

const pkg = JSON.parse(read("package.json"));
const index = read("index.html");
const css = read("css/responsive-v73.css");
const adapter = read("js/core/mobile_adapter.js");
const responsive = read("js/core/responsive.js");
const gantt = read("layers/laag4_gantt.html");
const projects = read("layers/laag3_projecten.html");
const capacity = read("layers/laag5_capaciteit.html");
const overview = read("layers/laag6_projectoverzicht.html");
const settings = read("layers/laag10_instellingen.html");
const io = read("layers/laag11_io.html");
const health = read("functions/api/health.js");
const localServer = read("scripts/serve.mjs") + read("playwright/server.js");

check("package bevat preflight:v73", pkg.scripts?.["preflight:v73"] === "node scripts/v73-tablet-mobile-responsive-hardening-preflight.mjs");
check("preflight:all ontdekt versie-scripts", /run-all-preflights\.mjs/.test(pkg.scripts?.["preflight:all"] || ""));
check("V73 responsive CSS bestaat", exists("css/responsive-v73.css"));
check("V73 mobile adapter bestaat", exists("js/core/mobile_adapter.js"));
check("responsive CSS wordt geladen", /css\/responsive-v73\.css/.test(index));
check("mobile adapter wordt geladen en gebonden", /js\/core\/mobile_adapter\.js/.test(index) && /CWS_MobileAdapter\.bind\(\)/.test(index));
check("body device classes aanwezig", ["is-mobile","is-tablet","is-desktop","is-touch"].every(value => adapter.includes(value)));
check("viewportwijzigingen zonder reload", /addEventListener\("resize"/.test(adapter) && /requestAnimationFrame/.test(adapter));
check("breakpoints 430, 768, 900 en 1200 equivalent", /max-width:\s*430px/.test(css) && /min-width:\s*768px/.test(css) && /min-width:\s*900px/.test(css) && /max-width:\s*1199px/.test(css));
check("Projecten table/modal responsive", /projects-infinite-panel/.test(css) && /#npBackdrop/.test(css) && /infinite-scroll/.test(projects));
check("Gantt shell/toolbar/touch fallback", /gantt-shell/.test(css) && /v73-gantt-mobile-hint/.test(css + adapter) && /pointerType===["']touch["']/.test(gantt));
check("Capaciteit matrix/scroll responsive", /cap-shell \.matrix/.test(css) && /matrix-wrap/.test(capacity));
check("Projectoverzicht table/popup responsive", /tabs360/.test(css) && /Project 360/.test(overview));
check("Instellingen tabs/form/calendar responsive", /settings-wrap/.test(css) && /cws-yearcal-grid/.test(css) && /settings-wrap/.test(settings));
check("Import/Export rapport/dialog responsive", /io-recovery-grid/.test(css) && /v68DoctorBtn/.test(io) && /buildStateDoctorReport/.test(io));
check("printregels en kleurbehoud aanwezig", /@media print/.test(css) && /print-color-adjust:\s*exact/.test(css));
check("geen mobiele body overflow hidden in V73 CSS", !/body[^{]*\{[^}]*overflow-x:\s*hidden/i.test(css));
check("geen globale transform scale", !/transform\s*:\s*scale\(/i.test(css));
check("desktop functionaliteit niet verwijderd", !/display:\s*none[^}]*gantt-shell|pointer-events:\s*none[^}]*toolbar/i.test(css));
check("Cloudflare health internal-test-v73", /internal-test-v73/.test(health));
check("lokale server local-test-v73", /local-test-v73/.test(localServer));
check("responsive regressietest bestaat", exists("tests/responsive/v73-responsive-smoke.mjs"));
check("V72 D1/Gantt/save guard blijft aanwezig", /preflight:v72/.test(JSON.stringify(pkg.scripts)) && /CWS\.gantt\.saveProjectGantt/.test(gantt) && /CWS_MobileAdapter/.test(responsive));

if (failed) process.exit(1);
console.log("V73 tablet/mobile responsive preflight geslaagd.");
