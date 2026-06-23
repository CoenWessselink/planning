import fs from "node:fs";
const read = p => fs.existsSync(p) ? fs.readFileSync(p,"utf8") : "";
const files = {
  packageJson: read("package.json"),
  responsive: read("js/core/responsive.js"),
  theme: read("css/theme.css"),
  cssReset: read("css/ui/01-reset.css"),
  projects: read("layers/laag3_projecten.html"),
  gantt: read("layers/laag4_gantt.html"),
  capacity: read("layers/laag5_capaciteit.html"),
  settings: read("layers/laag10_instellingen.html"),
  dashboard: read("layers/laag9_dashboard.html"),
  fallback: read("scripts/e2e-fallback.mjs")
};
let failed = 0;
function ok(label, pass){ console.log(`${pass ? "OK" : "FAIL"} - ${label}`); if(!pass) failed++; }
ok("V37 preflight script geregistreerd", files.packageJson.includes('"preflight:v37"'));
ok("Responsive zet actuele mobiele viewport marker", files.responsive.includes("dataset.cwsViewport") && files.responsive.includes("mobileBottomNav"));
ok("Mobiele viewport hoogte wordt gestabiliseerd", files.responsive.includes("viewportHeightFix") && files.theme.includes("--cws-vh"));
ok("Legacy bottom action dock wordt onderdrukt", files.cssReset.includes("#cwsV37MobileActionDock") && !files.responsive.includes("cwsV37MobileActionDock"));
ok("Projecten mobiele kaartweergave en Nieuw beschikbaar", files.projects.includes('data-testid="mobile-projects"') && files.projects.includes('id="mobileNewProject"'));
ok("Gantt mobiele werkbalk met projectkeuze en taakactie beschikbaar", files.gantt.includes('data-testid="mobile-gantt-workbar"') && files.gantt.includes('id="mobileProjectSel"') && files.gantt.includes('id="mobileAddTask"'));
ok("Capaciteit mobiele snelacties Vandaag/6 weken/A0 beschikbaar", files.capacity.includes('data-testid="mobile-capacity-workbar"') && files.capacity.includes('id="mobileCapToday"') && files.capacity.includes('data-mobile-cap-weeks="6"') && files.capacity.includes('id="mobileCapMore"'));
ok("Instellingen mobiele kernacties Bedrijf/Logo/Nieuw beschikbaar", files.settings.includes('id="quickCompany"') && files.settings.includes('id="quickLogo"') && files.settings.includes('id="addBtn"'));
ok("Mobiele modals als bottom sheet geborgd", files.theme.includes("border-radius:20px 20px 0 0") && files.theme.includes("max-height:92dvh"));
ok("Gantt mobiel behoudt tabel én diagram met touch-scroll", files.theme.includes(".chart-pane{min-width:1020px") && files.theme.includes(".table-pane{max-height:38dvh"));
ok("Capaciteit mobiel heatmap/matrix touch-scroll geborgd", files.theme.includes(".matrix{min-width:940px") && files.theme.includes(".heatmap{min-width:720px"));
ok("Fallback-E2E bevat actuele mobiele regressiechecks", files.fallback.includes("V37 legacy mobiele action dock onderdrukt") && files.fallback.includes("V37 mobiele bottom sheet"));
if(failed){ console.error(`${failed} V37-controle(s) gefaald.`); process.exit(1); }
console.log("12/12 V37/V100 mobiele controles OK.");
