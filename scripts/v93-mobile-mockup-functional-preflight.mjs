import fs from "node:fs";

let failed = false;
function ok(label, pass, detail = "") {
  console.log(`${pass ? "OK" : "FAIL"} - ${label}${detail ? `: ${detail}` : ""}`);
  if (!pass) failed = true;
}
const read = file => fs.readFileSync(file, "utf8");

const index = read("index.html");
const uiFiles = [
  "css/ui/00-tokens.css",
  "css/ui/01-reset.css",
  "css/ui/02-shell-apps.css",
  "css/ui/03-components.css",
  "css/ui/04-mobile-nav.css",
  "css/ui/05-mobile-dashboard-projects.css",
  "css/ui/06-mobile-gantt-capacity.css",
  "css/ui/10-print.css"
];
const css = uiFiles.map(read).join("\n");
const controller = `${read("js/core/mobile_adapter.js")}\n${read("js/core/responsive.js")}`;
const dashboard = read("layers/laag9_dashboard.html");
const gantt = read("layers/laag4_gantt.html");
const capacity = read("layers/laag5_capaciteit.html");
const pkg = read("package.json");

ok("V93 build marker actief", index.includes("CWS_VISUAL_SYSTEM_V100_CONSOLIDATED") && index.includes("CWS_UI_REBUILD_V101_CLEAN_PRESENTATION"));
ok("V93 CSS in shell geladen", uiFiles.every(file => index.includes(file)));
ok("V93 controller in shell geladen en gebonden", index.includes("js/core/mobile_adapter.js") && index.includes("CWS_MobileAdapter.bind()"));
ok("V93 controller injecteert stylesheet in iframe", controller.includes("ensureStylesheet") && controller.includes("css/cws-visual-system-v100.css") && controller.includes("contentDocument"));
ok("Oude Boven/Compact/Menu dock wordt actief verwijderd", css.includes("#cwsV37MobileActionDock") && css.includes("#cwsMobileToolbar") && css.includes("display:none!important"));
ok("Bottom navigation is viewport-safe en niet meer links afgesneden", css.includes("left:12px!important") && css.includes("right:12px!important") && css.includes("transform:none!important") && css.includes("grid-template-columns:repeat(5"));
ok("Mobiel iframe krijgt berekende hoogte", css.includes("#appFrame") && css.includes("height:calc(100dvh - var(--cws-mobile-header-h))") && css.includes("max-height:calc(100dvh - var(--cws-mobile-header-h))"));
ok("Dashboard cockpit is echte mobiele layout", css.includes(".mobile-dashboard") && css.includes("grid-auto-flow:column") && dashboard.includes("mobileCapacitySnapshot") && dashboard.includes("CWS.getState"));
ok("Gantt blijft functioneel en wordt mobiel herverdeeld", css.includes(".gantt-shell .toolbar") && css.includes(".gantt-shell .board-wrap") && gantt.includes("pointerdown") && gantt.includes("setPointerCapture"));
ok("Capaciteit blijft functioneel en wordt mobiel herverdeeld", css.includes(".cap-shell .toolbar") && css.includes(".cap-shell .heatmap-wrap") && css.includes(".cap-shell .matrix-wrap") && capacity.includes("sourcesByDay"));
ok("Mockupreferenties zijn niet als UI geimporteerd", !css.includes("url(") && !index.includes("cws-mobile-bottom-navigation-reference.jpeg") && !index.includes("cws-gantt-responsive-reference.jpeg"));
ok("V93 preflight geregistreerd", pkg.includes('"preflight:v93"'));

if (failed) process.exit(1);
