import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const index = read("index.html");
const router = read("js/core/router.js");
const menu = read("js/core/apps_menu.js");
const interaction = read("js/core/interactive_planning.js");
const layers = read("js/core/complete_prompt_layers.js");
const css = read("css/complete-prompt-v190.css");
const capacityPrint = read("js/core/capacity_print_tasche_a3.js");
const store = read("js/core/store.js");

const expectedRoutes = [
  "dashboard","projecten","gantt","capaciteit","afdelingsplanning","afdelingsplanning-maand","afdelingsplanning-week","afdelingsplanning-dag","werkvoorraad","resources","conflicten","mijnwerk","rollenrechten","instellingen"
];
const expectedLayers = [
  "layers/laag14_afdelingsplanning.html",
  "layers/laag15_werkvoorraad.html",
  "layers/laag16_resources.html",
  "layers/laag17_conflicten.html",
  "layers/laag18_mijn_werk.html",
  "layers/laag19_rollen_rechten.html"
];

const checks = [];
const add = (name, pass) => checks.push([name, !!pass]);

add("Alle gevraagde routes bestaan", expectedRoutes.every(x => router.includes(x)));
add("Alle nieuwe layerbestanden bestaan", expectedLayers.every(fs.existsSync));
add("Apps menu toont alle prompttabs", ["Dashboard","Projecten","Gantt","Capaciteit","Afdelingsplanning","Werkvoorraad","Resources","Conflicten","Mijn werk","Rollen & rechten","Instellingen"].every(x => menu.includes(x)));
add("Contextmenu manager aanwezig", interaction.includes("showContextMenu") && layers.includes("oncontextmenu"));
add("Modal manager aanwezig", interaction.includes("openModal"));
add("Drag/drop aanwezig en viewer-gated", layers.includes("dragstart") && layers.includes("data-drop-date") && interaction.includes("canEdit"));
add("Afdelingsplanning tabs maand/week/dag aanwezig", layers.includes("Maand") && layers.includes("Week") && layers.includes("Dag") && layers.includes("monthPlanning") && layers.includes("weekPlanning") && layers.includes("dayPlanning"));
add("Afdelingsplanning subroutes worden doorgegeven", router.includes("frame.dataset.activeApp = app") && router.includes("app=${encodeURIComponent(app)}") && layers.includes("new URLSearchParams(location.search).get(\"app\")") && layers.includes("window.frameElement?.dataset?.activeApp"));
add("Werkvoorraad/resources/conflicten modules aanwezig", layers.includes("renderWorkload") && layers.includes("renderResources") && layers.includes("renderConflicts"));
add("Medewerkerportal read-only aanwezig", layers.includes("Medewerkerportaal read-only") || layers.includes("Read-only"));
add("Rollen en uitnodigingen aanwezig", store.includes("medewerker_viewer") && layers.includes("Medewerker uitnodigen") && layers.includes("Token intrekken"));
add("Capaciteit print voldoet aan kerncontract", ["CAPACITEITSOVERZICHT","Tasche Staalbouw","OVERZICHT PER AFDELING","WEEK_COUNT = 29","document.createElement(\"iframe\")"].every(x => capacityPrint.includes(x)));
add("Printmodules geen popupwindow", !/window\.open|opener\.open|window\.top\.open/.test(capacityPrint) && !index.includes('window.open("", "_blank")'));
add("Responsive breakpoints aanwezig", css.includes("@media(max-width:1180px)") && css.includes("@media(max-width:760px)") && css.includes("@media print"));
add("Geen destructieve calls in nieuwe promptcode", !/clearAll|resetDemo|fetch\s*\([^)]*(PUT|POST)/s.test(interaction + layers + capacityPrint));
add("Gantt bestaande layer blijft gekoppeld", router.includes("layers/laag4_gantt.html") && !layers.includes("saveProjectGantt("));
add("Package registreert complete preflight", pkg.scripts?.["preflight:complete-interactive-app"] === "node scripts/v190-complete-interactive-app-preflight.mjs");

let ok = 0;
for(const [name, pass] of checks){
  console.log(`${pass ? "OK" : "FOUT"} - ${name}`);
  if(pass) ok += 1;
}
if(ok !== checks.length){
  console.error(`${ok}/${checks.length} controles OK.`);
  process.exit(1);
}
console.log(`${ok}/${checks.length} controles OK.`);
