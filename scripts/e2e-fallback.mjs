import fs from "node:fs";
const required = [
  "index.html",
  "layers/laag3_projecten.html",
  "layers/laag4_gantt.html",
  "layers/laag5_capaciteit.html",
  "layers/laag10_instellingen.html",
  "js/core/store.js",
  "js/core/responsive.js"
];
let ok = true;
for (const file of required) {
  if (!fs.existsSync(file)) { console.error(`E2E fallback FAIL - ontbreekt: ${file}`); ok = false; }
}
const index = fs.readFileSync("index.html", "utf8");
const projects = fs.readFileSync("layers/laag3_projecten.html", "utf8");
const gantt = fs.readFileSync("layers/laag4_gantt.html", "utf8");
const capacity = fs.readFileSync("layers/laag5_capaciteit.html", "utf8");
const settings = fs.readFileSync("layers/laag10_instellingen.html", "utf8");
const store = fs.readFileSync("js/core/store.js", "utf8");
const checks = [
  [index.includes("CWS.resetDemo()") && index.includes("setTimeout(()=>Router.loadApp"), "demo reset reloadt module"],
  [projects.includes("window.CWS_Projecten_OpenNew") && projects.includes("npBackdrop"), "nieuw project modal direct bereikbaar"],
  [store.includes("st.ganttV2.byProject[\"P-1001\"]") && store.includes("V33: seed full Gantt V2"), "demo bevat projecten + Gantt taken"],
  [gantt.includes("document.body.addEventListener(\"contextmenu\"") && gantt.includes("showGanttContextMenu(e,null,\"empty\")"), "Gantt rechtermuisknop lege ruimte afgevangen"],
  [capacity.includes("Beschikbare capaciteit") && capacity.includes("Benodigde capaciteit") && capacity.includes("Resterende capaciteit"), "Capaciteitsrijen aanwezig"],
  [settings.includes("quickCompany") && settings.includes("quickLogo") && settings.includes("Logo uploaden"), "Bedrijf/logo direct bereikbaar"],
  [projects.includes("CWS_PARENT_BRIDGED") && gantt.includes("CWS_PARENT_BRIDGED") && capacity.includes("CWS_PARENT_BRIDGED"), "V34 iframe/file fallback aanwezig"],
  [projects.includes("TABS.includes(st.ui.lastTab) ? st.ui.lastTab : \"Alle\""), "Projecten valt terug op tab Alle"],
  [settings.includes("bindV36QuickSettingsButtons") && settings.includes("quickCompany") && settings.includes('openModule("bedrijf")'), "V36 Bedrijf snelknop opent bedrijfsmodal"],
  [settings.includes('file.type === SVG_MIME || ext === "svg"') && settings.includes("data:image/png"), "V36 logo-upload blokkeert SVG op mime én extensie"],
  [gantt.includes('tr.addEventListener("dragstart"') && gantt.includes('th.addEventListener("dragstart"') && gantt.includes("Rijvolgorde opgeslagen"), "V36 Gantt rij- en kolomdrag statisch geborgd"],
  [gantt.includes("function logoHtml") && capacity.includes("function logoHtml") && fs.readFileSync("js/core/ui.js", "utf8").includes("print-logo"), "V36 printheaders gebruiken bedrijfslogo"],
  [fs.readFileSync("js/core/responsive.js", "utf8").includes("cwsV37MobileActionDock") && fs.readFileSync("css/theme.css", "utf8").includes("v37-mobile-action-dock"), "V37 mobiele action dock aanwezig"],
  [fs.readFileSync("css/theme.css", "utf8").includes("border-radius:20px 20px 0 0") && fs.readFileSync("css/theme.css", "utf8").includes("max-height:92dvh"), "V37 mobiele bottom sheet modals geborgd"],
  [fs.readFileSync("js/core/responsive.js", "utf8").includes("#addTaskBtn") && fs.readFileSync("js/core/responsive.js", "utf8").includes("#quickLogo") && fs.readFileSync("js/core/responsive.js", "utf8").includes("#todayBtn"), "V37 mobiele snelacties per module aanwezig"],
  [gantt.includes('{id:"rowno",label:"Nr"') && gantt.includes('row._displayNo=i+1'), "V38 Gantt regelnummerkolom aanwezig"],
  [gantt.includes('function predecessorDisplay') && gantt.includes('return predecessorDisplay(row.predecessor)'), "V38 voorganger wordt als regelnummer getoond"],
  [gantt.includes('showDeps:false') && gantt.includes('<button class="btn" id="depsBtn">Afhankelijkheden</button>'), "V38 afhankelijkheden standaard uit"],
  [gantt.includes('printFileName(p)') && gantt.includes('printProjectHeaderText') && gantt.includes('Regel nr'), "V38 printkop/bestandsnaam/regelnummer geborgd"],
  [gantt.includes('pred-select') && gantt.includes('multiple') && gantt.includes('openPredecessorPicker'), "V39 voorganger multi-select aanwezig"],
  [gantt.includes('function encodePred') && gantt.includes('predecessorOptionsHtml') && gantt.includes('Voorgangers kiezen'), "V39 meerdere voorgangers selecteerbaar"],
  [gantt.includes('.mobile-toolbar,.v37-mobile-action-dock,.toolbar') && gantt.includes('display:none!important'), "V39 print verwijdert app/mobiele toolbar"],
  [gantt.includes('repeating-linear-gradient(to right, rgba(17,24,39,.45)') && gantt.includes('calc(var(--dayW) * 7)'), "V39 dunne daglijnen blijven zichtbaar in print"],
  [gantt.includes('id="templateSel"') && settings.includes('openTplPredPicker') && gantt.includes('--v40-print-row'), "V40 print/template hardening aanwezig"],
  [gantt.includes("dateInputCell") && gantt.includes("duration-input") && gantt.includes("isoWeekLabel"), "V41 Gantt datumpicker/weeknummer en duurinvoer aanwezig"],
  [gantt.includes("resource-input") && gantt.includes("departmentOptionsHtml"), "V41 Gantt afdeling dropdown en resource invulveld aanwezig"],
  [gantt.includes("--v41-print-row-h") && gantt.includes("var(--v41-print-line)") && gantt.includes("updatePrintHeader(model, range)"), "V41 print raster/header hard geborgd"],
  [settings.includes("tplDeptSelect") && settings.includes("tpl-resource-input") && settings.includes("position:sticky"), "V41 templates afdeling/resource/vaste kolommen geborgd"],
];
for (const [pass, label] of checks) {
  console.log(`${pass ? "OK" : "FAIL"} - ${label}`);
  if (!pass) ok = false;
}
if (!ok) process.exit(1);
const v42pass = gantt.includes("--v42-line") && gantt.includes("depArrow") && gantt.includes("summary-lane");
console.log(`${v42pass ? "OK" : "FAIL"} - V42 print raster + dependency arrows`);
if(!v42pass) ok = false;

const v43pass = capacity.includes("V43 capaciteit A0-print") && capacity.includes("capacityPrintWeeks") && capacity.includes(" - Capaciteit - ") && capacity.includes("../assets/tasche-logo.png") && capacity.includes("border:0.45pt solid var(--v43-cap-line)");
console.log(`${v43pass ? "OK" : "FAIL"} - V43 capaciteit A0 printstijl en PDF-naam`);
if(!v43pass) ok = false;


const v44pass = gantt.includes('V44 — definitive Gantt print raster') && gantt.includes('dayGridLineHtml') && gantt.includes('--v44-print-row-h') && gantt.includes('--v44-print-head-h') && gantt.includes('UI.printMode ? 1760');
console.log(`${v44pass ? "OK" : "FAIL"} - V44 Gantt print daglijnen, uitlijning en kalenderbreedte`);
if(!v44pass) ok = false;


const v45pass = gantt.includes('V45 — dependency visibility') && gantt.includes('stroke-width:1.65') && gantt.includes('--v45-print-grid:.28px') && gantt.includes('join(" - ")');
console.log(`${v45pass ? "OK" : "FAIL"} - V45 dependencylijnen zichtbaarer en printlijnen dunner/PDF-titel`);
if(!v45pass) ok = false;

if (!ok) process.exit(1);
console.log("E2E fallback geslaagd. Voor echte browservalidatie: installeer Playwright lokaal en run de Playwright suite.");
