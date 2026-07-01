import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const index = read("index.html");
const router = read("js/core/router.js");
const menu = read("js/core/apps_menu.js");
const css = read("css/complete-prompt-v190.css");
const shellCss = read("css/ui/02-shell-apps.css");
const ui = read("js/core/ui.js");

const layers = [
  "layers/laag3_projecten.html",
  "layers/laag4_gantt.html",
  "layers/laag5_capaciteit.html",
  "layers/laag14_afdelingsplanning.html",
  "layers/laag15_werkvoorraad.html",
  "layers/laag16_resources.html",
  "layers/laag17_conflicten.html",
  "layers/laag18_mijn_werk.html",
  "layers/laag19_rollen_rechten.html"
];
const allLayerText = layers.map(read).join("\n");

const checks = [];
const add = (name, pass) => checks.push([name, !!pass]);

add("Shell laadt interactieve promptlaag", index.includes("interactive_planning.js?v=190"));
add("Router bevat nieuwe promptmodules", ["afdelingsplanning","afdelingsplanning-week","afdelingsplanning-dag","werkvoorraad","resources","conflicten","mijnwerk","rollenrechten"].every(x => router.includes(x)));
add("Apps menu bevat alle hoofdtablabels", ["Dashboard","Projecten","Gantt","Capaciteit","Afdelingsplanning","Werkvoorraad","Resources","Conflicten","Mijn werk","Rollen & rechten","Instellingen"].every(x => menu.includes(x)));
add("Nieuwe layers bestaan", layers.every(path => fs.existsSync(path)));
add("Nieuwe layers laden responsive CSS", layers.slice(3).every(path => read(path).includes("complete-prompt-v190.css")));
add("Desktop/tablet/mobile breakpoints aanwezig", css.includes("@media(max-width:1180px)") && css.includes("@media(max-width:760px)") && css.includes("@media print"));
add("Horizontale scrollcontainers aanwezig", css.includes("overflow:auto") && css.includes("-webkit-overflow-scrolling:touch") && css.includes("cp-scroll-hint"));
add("Touch targets minimaal 40px", css.includes("min-height:40px") && css.includes("min-height:44px"));
add("Mobiele modal bottom-sheet styling aanwezig", css.includes("align-items:flex-end") && css.includes("border-radius:22px 22px 0 0"));
add("Mobiel iframe blijft vrij van bottom-nav overlap", shellCss.includes("var(--cws-mobile-nav-h)") && shellCss.includes("display:flex!important;flex-direction:column!important") && shellCss.includes("#appFrame{width:100%!important;height:100%!important"));
add("Gantt en capaciteit bestaande layers blijven gekoppeld", router.includes("layers/laag4_gantt.html") && router.includes("layers/laag5_capaciteit.html"));
add("Printknoppen bereikbaar in nieuwe modules", allLayerText.includes("data-print-current") || read("js/core/complete_prompt_layers.js").includes("data-print-current"));
add("Generieke UI print gebruikt hidden iframe", ui.includes('document.createElement("iframe")') && ui.includes("frame.contentWindow.print()") && !ui.includes('window.open("", "_blank")'));
add("Geen destructieve calls in nieuwe promptcode", !/clearAll|resetDemo|fetch\s*\([^)]*(PUT|POST)/s.test(read("js/core/interactive_planning.js") + read("js/core/complete_prompt_layers.js")));
add("Package registreert preflight:responsive", pkg.scripts?.["preflight:responsive"] === "node scripts/v160-full-app-responsive-preflight.mjs");

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
