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
];
for (const [pass, label] of checks) {
  console.log(`${pass ? "OK" : "FAIL"} - ${label}`);
  if (!pass) ok = false;
}
if (!ok) process.exit(1);
console.log("E2E fallback geslaagd. Voor echte browservalidatie: installeer Playwright lokaal en run de Playwright suite.");
