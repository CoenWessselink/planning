import fs from "node:fs";

let failed = false;
const read = file => fs.readFileSync(file, "utf8");
const ok = (label, pass) => {
  console.log(`${pass ? "OK" : "FAIL"} - ${label}`);
  if (!pass) failed = true;
};

const index = read("index.html");
const wrapper = read("css/cws-visual-system-v100.css");
const responsive = read("js/core/responsive.js");
const adapter = read("js/core/mobile_adapter.js");
const projectFilter = read("js/core/default_empty_project_filter.js");
const gantt = read("layers/laag4_gantt.html");
const capacity = read("layers/laag5_capaciteit.html");
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
const ui = Object.fromEntries(uiFiles.map(file => [file, read(file)]));

ok("Clean UI stack is loaded in shell", uiFiles.every(file => index.includes(file)) && index.includes("CWS_UI_REBUILD_V101_CLEAN_PRESENTATION"));
ok("V100 wrapper imports clean UI stack for iframe compatibility", uiFiles.every(file => wrapper.includes(file.replace("css/", ""))));
ok("Temporary V92-V97 stylesheets are no longer loaded in shell", !/mobile-mockup-v9[3-7]\.css|visual-system-v92\.css|mobile-nav-v97\.css/.test(index));
ok("Legacy mobile mockup controller is no longer loaded", !index.includes("mobile_mockup_v93.js"));
ok("Responsive navigation uses inline SVG icons", responsive.includes("<svg viewBox") && responsive.includes("nav-icon") && !responsive.includes("icon:\"▦\"") && !responsive.includes("icon:\"☰\""));
ok("Old Boven/Compact/Menu dock creator removed", !responsive.includes("addMobileActionDock") && !responsive.includes("Boven</button><button") && ui["css/ui/01-reset.css"].includes("#cwsV37MobileActionDock"));
ok("Mobile adapter still injects V100 wrapper for modules", adapter.includes("cws-visual-system-v100.css") && !adapter.includes("visual-system-v92.css"));
ok("Bottom navigation has required five app ids", ["dashboard","projecten","gantt","capaciteit","more"].every(id => responsive.includes(`id:\"${id}\"`)));
ok("More sheet has required secondary modules", ["projectoverzicht","planbord","rapporten","importexport","instellingen","audit"].every(id => responsive.includes(`id:\"${id}\"`)));
ok("Project filter default-empty enforcement exists", projectFilter.includes("Alle projecten") && projectFilter.includes("activeProjectId") && projectFilter.includes("selectedProjectId"));
ok("Gantt functional pointer lifecycle remains present", gantt.includes("pointerdown") && gantt.includes("pointermove") && gantt.includes("pointerup") && gantt.includes("setPointerCapture"));
ok("Capacity still references Gantt SSOT sources", capacity.includes("gantt?.sourcesByDay") && capacity.includes("hoursByDay"));
ok("Print hides mobile navigation", ui["css/ui/10-print.css"].includes("@media print") && ui["css/ui/10-print.css"].includes("mobile-bottom-nav"));

if (failed) process.exit(1);
