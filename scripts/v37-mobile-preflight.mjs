import fs from "node:fs";
const read = p => fs.existsSync(p) ? fs.readFileSync(p,"utf8") : "";
const files = {
  packageJson: read("package.json"),
  responsive: read("js/core/responsive.js"),
  theme: read("css/theme.css"),
  gantt: read("layers/laag4_gantt.html"),
  capacity: read("layers/laag5_capaciteit.html"),
  settings: read("layers/laag10_instellingen.html"),
  dashboard: read("layers/laag9_dashboard.html"),
  fallback: read("scripts/e2e-fallback.mjs")
};
let failed = 0;
function ok(label, pass){ console.log(`${pass ? "OK" : "FAIL"} - ${label}`); if(!pass) failed++; }
ok("V37 preflight script geregistreerd", files.packageJson.includes('"preflight:v37"'));
ok("Responsive zet v37-mobile-optimized marker", files.responsive.includes("v37-mobile-optimized") && files.responsive.includes("dataset.v37MobileOptimized"));
ok("Mobiele viewport hoogte wordt gestabiliseerd", files.responsive.includes("viewportHeightFix") && files.theme.includes("--cws-vh"));
ok("Mobiele bottom action dock aanwezig", files.responsive.includes("cwsV37MobileActionDock") && files.theme.includes("v37-mobile-action-dock"));
ok("Projecten mobiele snelactie Nieuw beschikbaar", files.responsive.includes("CWS_Projecten_OpenNew") && files.responsive.includes("#newProjectBtn"));
ok("Gantt mobiele snelacties Taak/Diagram/Beide beschikbaar", files.responsive.includes("#addTaskBtn") && files.responsive.includes("#viewDiagram") && files.responsive.includes("#viewBoth"));
ok("Capaciteit mobiele snelacties Vandaag/6 weken/A0 beschikbaar", files.responsive.includes("#todayBtn") && files.responsive.includes("[data-weeks='6']") && files.responsive.includes("#printBtn"));
ok("Instellingen mobiele snelacties Bedrijf/Logo/Nieuw beschikbaar", files.responsive.includes("#quickCompany") && files.responsive.includes("#quickLogo") && files.responsive.includes("#newItemBtn"));
ok("Mobiele modals als bottom sheet geborgd", files.theme.includes("border-radius:20px 20px 0 0") && files.theme.includes("max-height:92dvh"));
ok("Gantt mobiel behoudt tabel én diagram met touch-scroll", files.theme.includes(".chart-pane{min-width:1020px") && files.theme.includes(".table-pane{max-height:38dvh"));
ok("Capaciteit mobiel heatmap/matrix touch-scroll geborgd", files.theme.includes(".matrix{min-width:940px") && files.theme.includes(".heatmap{min-width:720px"));
ok("Fallback-E2E bevat V37 mobiele regressiechecks", files.fallback.includes("V37 mobiele action dock") && files.fallback.includes("V37 mobiele bottom sheet"));
if(failed){ console.error(`${failed} V37-controle(s) gefaald.`); process.exit(1); }
console.log("12/12 V37 mobiele controles OK.");
