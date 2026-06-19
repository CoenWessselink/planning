import fs from "node:fs";

let failed = false;
const read = file => fs.readFileSync(file, "utf8");
const ok = (label, pass) => {
  console.log(`${pass ? "OK" : "FAIL"} - ${label}`);
  if (!pass) failed = true;
};

const index = read("index.html");
const css = read("css/cws-visual-system-v100.css");
const responsive = read("js/core/responsive.js");
const adapter = read("js/core/mobile_adapter.js");
const projectFilter = read("js/core/default_empty_project_filter.js");
const gantt = read("layers/laag4_gantt.html");
const capacity = read("layers/laag5_capaciteit.html");

ok("V100 consolidated stylesheet is loaded", index.includes("css/cws-visual-system-v100.css") && index.includes("CWS_VISUAL_SYSTEM_V100_CONSOLIDATED"));
ok("Temporary V92-V97 stylesheets are no longer loaded in shell", !/mobile-mockup-v9[3-7]\.css|visual-system-v92\.css|mobile-nav-v97\.css/.test(index));
ok("Legacy mobile mockup controller is no longer loaded", !index.includes("mobile_mockup_v93.js"));
ok("Responsive navigation uses inline SVG icons", responsive.includes("<svg viewBox") && responsive.includes("nav-icon") && !responsive.includes("icon:\"▦\"") && !responsive.includes("icon:\"☰\""));
ok("Old Boven/Compact/Menu dock creator removed", !responsive.includes("addMobileActionDock") && !responsive.includes("Boven</button><button") && css.includes("#cwsV37MobileActionDock"));
ok("Mobile adapter injects V100 only", adapter.includes("cws-visual-system-v100.css") && !adapter.includes("visual-system-v92.css"));
ok("Bottom navigation has required five app ids", ["dashboard","projecten","gantt","capaciteit","more"].every(id => responsive.includes(`id:\"${id}\"`)));
ok("More sheet has required secondary modules", ["projectoverzicht","planbord","rapporten","importexport","instellingen","audit"].every(id => responsive.includes(`id:\"${id}\"`)));
ok("Project filter default-empty enforcement exists", projectFilter.includes("Alle projecten") && projectFilter.includes("activeProjectId") && projectFilter.includes("selectedProjectId"));
ok("Gantt functional pointer lifecycle remains present", gantt.includes("pointerdown") && gantt.includes("pointermove") && gantt.includes("pointerup") && gantt.includes("setPointerCapture"));
ok("Capacity still references Gantt SSOT sources", capacity.includes("gantt?.sourcesByDay") && capacity.includes("hoursByDay"));
ok("Print hides mobile navigation", css.includes("@media print") && css.includes("mobile-bottom-nav"));

if (failed) process.exit(1);
