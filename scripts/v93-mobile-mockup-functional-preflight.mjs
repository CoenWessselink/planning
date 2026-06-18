import fs from "node:fs";

let failed = false;
function ok(label, pass, detail = "") {
  console.log(`${pass ? "OK" : "FAIL"} - ${label}${detail ? `: ${detail}` : ""}`);
  if (!pass) failed = true;
}
const read = file => fs.readFileSync(file, "utf8");

const index = read("index.html");
const css = read("css/mobile-mockup-v93.css");
const controller = read("js/core/mobile_mockup_v93.js");
const dashboard = read("layers/laag9_dashboard.html");
const gantt = read("layers/laag4_gantt.html");
const capacity = read("layers/laag5_capaciteit.html");
const pkg = read("package.json");

ok("V93 build marker actief", index.includes("MOBILE_MOCKUP_FUNCTIONAL_V93"));
ok("V93 CSS in shell geladen", index.includes('css/mobile-mockup-v93.css'));
ok("V93 controller in shell geladen en gebonden", index.includes('js/core/mobile_mockup_v93.js') && index.includes("CWS_MobileMockupV93.bind()"));
ok("V93 controller injecteert stylesheet in iframe", controller.includes("injectStylesheet") && controller.includes("mobile-mockup-v93.css") && controller.includes("contentDocument"));
ok("Oude Boven/Compact/Menu dock wordt actief verwijderd", controller.includes("removeLegacyDocks") && css.includes("#cwsV37MobileActionDock") && css.includes("#cwsMobileToolbar") && css.includes("display:none!important"));
ok("Bottom navigation is viewport-safe en niet meer links afgesneden", css.includes("left:10px!important") && css.includes("right:10px!important") && css.includes("transform:none!important") && css.includes("grid-template-columns:repeat(5"));
ok("Mobiel iframe krijgt berekende hoogte", controller.includes("fixIframeHeight") && controller.includes("window.innerHeight - header - nav") && controller.includes("frame.style.height"));
ok("Dashboard cockpit is echte mobiele layout", css.includes(".mobile-dashboard") && css.includes("grid-auto-flow:column") && dashboard.includes("mobileCapacitySnapshot") && dashboard.includes("CWS.getState"));
ok("Gantt blijft functioneel en wordt mobiel herverdeeld", css.includes(".gantt-shell .toolbar") && css.includes(".gantt-shell .board-wrap") && gantt.includes("pointerdown") && gantt.includes("setPointerCapture"));
ok("Capaciteit blijft functioneel en wordt mobiel herverdeeld", css.includes(".cap-shell .toolbar") && css.includes(".cap-shell :where(.heatmap-wrap,.matrix-wrap") && capacity.includes("gantt?.sourcesByDay"));
ok("Mockupreferenties zijn niet als UI geimporteerd", !css.includes("url(") && !index.includes("cws-mobile-bottom-navigation-reference.jpeg") && !index.includes("cws-gantt-responsive-reference.jpeg"));
ok("V93 preflight geregistreerd", pkg.includes('"preflight:v93"'));

if (failed) process.exit(1);
