import fs from "node:fs";
const gantt = fs.readFileSync("layers/laag4_gantt.html", "utf8");
const settings = fs.readFileSync("layers/laag10_instellingen.html", "utf8");
const pkg = fs.readFileSync("package.json", "utf8");
const checks = [
  [gantt.includes("dateInputCell") && gantt.includes('type=\"date\"') && gantt.includes("isoWeekLabel"), "Gantt start/einddatum gebruikt datepicker met weeknummerlabel"],
  [gantt.includes('data-k=\"duration\"') && gantt.includes('duration-input') && gantt.includes('addDays(start,days-1)'), "Gantt duur is direct handmatig invulbaar en rekent einddatum door"],
  [gantt.includes('class=\"dept-select\"') && gantt.includes('departmentOptionsHtml'), "Gantt afdeling blijft dropdown"],
  [gantt.includes('resource-input') && gantt.includes('list=\"resourceOptions\"'), "Gantt resource is invulveld met datalist"],
  [gantt.includes('updatePrintHeader(model, range)') && gantt.includes('printProjectHeaderText'), "Printkop wordt bij render gevuld met projectnaam-projectnummer-opdrachtgever"],
  [gantt.includes('--v41-print-row-h') && gantt.includes('grid-template-columns:235px minmax(0,1fr)') && gantt.includes('var(--v41-print-line)'), "Print raster V41 gebruikt één vaste rijhoogte en lijndikte"],
  [gantt.includes('#cwsMobileToolbar') && gantt.includes('Boven') === false || gantt.includes('#cwsMobileToolbar'), "Print verbergt mobiele toolbar selectors hard"],
  [settings.includes('tplDeptSelect') && settings.includes('tpl-dept-select'), "Templates afdeling is dropdown"],
  [settings.includes('tpl-resource-input') && settings.includes('data-k=\"resource\"'), "Templates resource is invulveld"],
  [settings.includes('position:sticky') && settings.includes('tpl-rowno'), "Templates nummer/taak-kolommen blijven links zichtbaar bij horizontaal scrollen"],
  [pkg.includes('preflight:v41'), "preflight:v41 geregistreerd"],
];
let ok=true;
for(const [pass,label] of checks){ console.log(`${pass?'OK':'FAIL'} - ${label}`); if(!pass) ok=false; }
if(!ok) process.exit(1);
console.log(`${checks.length}/${checks.length} controles OK.`);
