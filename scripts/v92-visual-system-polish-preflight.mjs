import fs from "node:fs";

let failed = false;
function ok(label, pass, detail = "") {
  console.log(`${pass ? "OK" : "FAIL"} - ${label}${detail ? `: ${detail}` : ""}`);
  if (!pass) failed = true;
}

const read = file => fs.readFileSync(file, "utf8");

const index = read("index.html");
const visual = read("css/visual-system-v92.css");
const mobileAdapter = read("js/core/mobile_adapter.js");
const responsive = read("js/core/responsive.js");
const dashboard = read("layers/laag9_dashboard.html");
const gantt = read("layers/laag4_gantt.html");
const capacity = read("layers/laag5_capaciteit.html");
const pkg = read("package.json");

ok("V92 stylesheet wordt in shell geladen", index.includes('css/visual-system-v92.css') && index.includes('VISUAL_SYSTEM_MOCKUPS_V92'));
ok("V92 stylesheet wordt in iframe modules geinjecteerd", mobileAdapter.includes("RESPONSIVE_STYLESHEETS") && mobileAdapter.includes("css/visual-system-v92.css") && mobileAdapter.includes("cwsV92VisualSystem"));
ok("Mockup images worden niet als CSS background/import gebruikt", !visual.includes("url(") && !index.includes("cws-desktop-apps-menu-reference.jpeg") && !index.includes("cws-mobile-bottom-navigation-reference.jpeg"));
ok("Desktop apps menu is maximaal 5 tegels per rij", visual.includes("repeat(5,minmax(0,1fr))") && visual.includes(".apps-card-shell"));
ok("Donkerblauwe enterprise topbar is centraal gestyled", visual.includes("--cws-shell-navy:#071b34") && visual.includes(".headerbar") && visual.includes("linear-gradient(135deg,var(--cws-shell-navy)"));
ok("Mobile bottom navigation is fixed/elevated en bevat primaire Gantt", visual.includes(".mobile-bottom-nav") && visual.includes("position:fixed") && visual.includes(".mobile-nav-primary") && responsive.includes('id:"gantt", label:"Gantt"') && responsive.includes("primary:true"));
ok("Mobiele Meer-sheet blijft viewport-safe", visual.includes(".mobile-more-sheet") && visual.includes("calc(96px + env(safe-area-inset-bottom,0px))") && visual.includes("max-height:min(72dvh,620px)"));
ok("Touch targets blijven minimaal 44px geborgd", visual.includes("--cws-touch:44px") && visual.includes("min-height:44px") && mobileAdapter.includes("isTouchDevice"));
ok("Mobiel dashboard blijft echte data gebruiken", dashboard.includes("CWS.getState") && dashboard.includes("mobileCapacitySnapshot") && dashboard.includes("computePlannedWeekByDept"));
ok("Gantt blijft echte module met pointer drag/resize contract", gantt.includes("pointerdown") && gantt.includes("pointermove") && gantt.includes("pointerup") && gantt.includes("requestAnimationFrame") && gantt.includes("setPointerCapture"));
ok("Capaciteit blijft op Gantt SSOT gebaseerd", capacity.includes("gantt?.sourcesByDay") && capacity.includes("hoursByDay") && capacity.includes("matrix-wrap"));
ok("Print blijft niet door mobiele nav/sheet vervuild", visual.includes("@media print") && visual.includes(".mobile-bottom-nav") && visual.includes(".mobile-more-sheet"));
ok("V92 preflight is opgenomen als script", pkg.includes('"preflight:v92"'));

if (failed) process.exit(1);
