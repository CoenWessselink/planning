import fs from "node:fs";

let failed = false;
function ok(label, pass, detail = "") {
  console.log(`${pass ? "OK" : "FAIL"} - ${label}${detail ? `: ${detail}` : ""}`);
  if (!pass) failed = true;
}

const read = file => fs.readFileSync(file, "utf8");
const idsFromBlock = (source, name) => {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!match) return [];
  return Array.from(match[1].matchAll(/id:"([^"]+)"/g)).map(item => item[1]);
};

const refs = [
  "docs/ui-references/cws-desktop-apps-menu-reference.jpeg",
  "docs/ui-references/cws-mobile-bottom-navigation-reference.jpeg",
  "docs/ui-references/cws-gantt-responsive-reference.jpeg",
  "docs/ui-references/cws-capacity-responsive-reference.jpeg",
];
refs.forEach(file => ok(`Mockup-reference aanwezig: ${file}`, fs.existsSync(file)));

const index = read("index.html");
const appsMenu = read("js/core/apps_menu.js");
const responsive = read("js/core/responsive.js");
const dashboard = read("layers/laag9_dashboard.html");
const gantt = read("layers/laag4_gantt.html");
const capacity = read("layers/laag5_capaciteit.html");
const e2e = read("tests/e2e/premium-responsive-ui.mjs");
const report = read("docs/visual-system-mockups-report.md");

const mainIds = idsFromBlock(appsMenu, "items");
const utilityIds = idsFromBlock(appsMenu, "utilityItems");
const expectedMain = ["dashboard","projecten","gantt","capaciteit","projectoverzicht","planbord","rapporten","importexport","instellingen","audit"];
ok("Apps Menu hoofdgrid heeft exact 10 mockup-modules", mainIds.length === 10 && expectedMain.every(id => mainIds.includes(id)), JSON.stringify(mainIds));
ok("Technische routes blijven compact bereikbaar", ["preflight","projectplanning","transport"].every(id => utilityIds.includes(id)) && index.includes("appsUtility"));
ok("Mobiele Meer-sheet behoudt extra routes", ["preflight","projectplanning","transport"].every(id => responsive.includes(`id:"${id}"`)));

ok("Mobiele bottom navigation bevat referentie-items", ["Dashboard","Projecten","Gantt","Capaciteit","Meer"].every(label => responsive.includes(`label:"${label}"`)) && responsive.includes("primary:true"));
ok("Dashboard mobile gebruikt echte capaciteithelpers", dashboard.includes("mobileCapacitySnapshot") && dashboard.includes("computePlannedWeekByDept") && dashboard.includes("computeDeptCapacityForWeek"));
ok("Gantt responsive blijft echte module met drag/resize", gantt.includes("pointerdown") && gantt.includes("setPointerCapture") && gantt.includes("data-testid=\"gantt-root\""));
ok("Capaciteit responsive blijft echte module met SSOT Gantt-bron", capacity.includes("gantt?.sourcesByDay") && capacity.includes("matrix-wrap") && capacity.includes("heatmap-wrap"));

ok("E2E dekt desktop 1920 en mobiele referentiebreedtes", ["[1920, 1080]","[375, 812]","[414, 896]","[430, 932]"].every(token => e2e.includes(token)));
ok("E2E bewaakt Apps Menu 10-tegelcontract", e2e.includes("Desktop Apps Menu toont exact 10 hoofdmodules") && e2e.includes("beheer-extra"));
ok("E2E bewaakt mobiel dashboard", e2e.includes("Mobiel dashboard toont cockpit volgens referentie") && e2e.includes("mobileCapacityPct"));

const appCode = [
  index,
  read("css/theme.css"),
  responsive,
  appsMenu,
  dashboard,
  gantt,
  capacity,
].join("\n");
const importedRefs = refs.map(file => file.split("/").pop()).filter(name => appCode.includes(name));
ok("Referentiebeelden worden niet als app-UI geimporteerd", importedRefs.length === 0, importedRefs.join(", "));

ok("Implementatierapport legt scope/tests/risico's vast", report.includes("Visual System Mockups") && report.includes("Tests") && report.includes("Risico"));

if (failed) process.exit(1);
