import fs from "node:fs";
import path from "node:path";

let failed = false;
function ok(label, pass, detail = "") {
  console.log(`${pass ? "OK" : "FAIL"} - ${label}${detail ? `: ${detail}` : ""}`);
  if (!pass) failed = true;
}

const read = file => fs.readFileSync(file, "utf8");
const exists = file => fs.existsSync(file);

const refs = [
  "docs/ui-references/cws-mobile-bottom-navigation-reference.jpeg",
  "docs/ui-references/cws-desktop-apps-menu-reference.jpeg",
  "docs/ui-references/cws-capacity-responsive-reference.jpeg",
  "docs/ui-references/cws-gantt-responsive-reference.jpeg",
  "docs/ui-references/README.md",
];
refs.forEach(file => ok(`UI-referentie bestaat: ${file}`, exists(file)));

const pkg = read("package.json");
const index = read("index.html");
const theme = read("css/theme.css");
const appsMenu = read("js/core/apps_menu.js");
const responsive = read("js/core/responsive.js");
const globalSearch = read("js/core/global_search.js");
const projectsLayer = read("layers/laag3_projecten.html");
const gantt = read("layers/laag4_gantt.html");
const capacity = read("layers/laag5_capaciteit.html");
const projectOverview = read("layers/laag6_projectoverzicht.html");

ok("package.json bevat preflight:v90", pkg.includes('"preflight:v90"'));
ok("package.json voert premium UI E2E uit", pkg.includes("tests/e2e/premium-responsive-ui.mjs"));

ok("Desktop Apps Menu heeft premium hero", index.includes("Welkom bij CWS Planning") && index.includes("Kies een applicatie om aan de slag te gaan"));
ok("Desktop Apps Menu gebruikt echte route-tegels", appsMenu.includes("Router.loadApp(it.id)") && appsMenu.includes('document.createElement("button")') && appsMenu.includes("dataAppId") === false);
ok("Apps Menu bevat vereiste modules", ["dashboard","projecten","gantt","capaciteit","projectoverzicht","planbord","rapporten","importexport","instellingen","audit","preflight"].every(id => appsMenu.includes(`id:"${id}"`)));
ok("Apps Menu footer is premium en D1-bewust", appsMenu.includes("Veilig. Betrouwbaar. Gebouwd voor planning") && appsMenu.includes("D1-state blijft leidend"));

ok("Mobiele bottom nav bevat Dashboard/Projecten/Gantt/Capaciteit/Meer", ["Dashboard","Projecten","Gantt","Capaciteit","Meer"].every(label => responsive.includes(`label:"${label}"`)));
ok("Mobiele Gantt primaire actie aanwezig", responsive.includes("primary:true") && theme.includes("mobile-nav-primary"));
ok("Mobiele Meer-bottomsheet aanwezig", responsive.includes("mobileMoreSheet") && responsive.includes("showMobileMore") && theme.includes(".mobile-more-sheet"));
ok("Meer-menu sluit via Escape/backdrop/X", responsive.includes('event.key === "Escape"') && responsive.includes("mobile-more-close") && responsive.includes("event.target === sheet"));
ok("Actieve bottom-nav state gebruikt aria-current", responsive.includes("aria-current"));

ok("Globale Ctrl+K zoekmodule wordt geladen en gebonden", index.includes("js/core/global_search.js") && index.includes("CWS_GlobalSearch.bind"));
ok("Globale zoekactie leest echte planningdata", globalSearch.includes("buildResults") && globalSearch.includes("projects") && globalSearch.includes("ganttV2") && globalSearch.includes("sourcesByDay"));
ok("Globale zoekactie ondersteunt directe routes", ["projecten","gantt","capaciteit","project360"].every(id => globalSearch.includes(id)) && globalSearch.includes("router?.loadApp"));
ok("Globale zoekactie bewaart target voor modules", globalSearch.includes("globalSearchTarget") && globalSearch.includes("sessionStorage.setItem"));
ok("Globale zoek-overlay is responsive gestyled", theme.includes(".global-search-backdrop") && theme.includes(".global-search-result") && theme.includes("global-search-actions"));
ok("Projecten consumeert globale projectzoek-target", projectsLayer.includes("applyGlobalSearchProjectTarget") && projectsLayer.includes('target.module !== "projecten"'));
ok("Gantt consumeert globale projectzoek-target", gantt.includes("globalSearchTarget") && gantt.includes("searchId && ids.has(searchId)"));
ok(
  "Capaciteit consumeert globale afdeling/week-target",
  capacity.includes("applyGlobalSearchTarget") &&
    capacity.includes("readGlobalSearchTarget") &&
    capacity.includes('target?.module==="capaciteit"') &&
    capacity.includes("isFreshGlobalSearchTarget") &&
    capacity.includes("isoWeekFromDate")
);
ok("Projectoverzicht opent Project 360 vanuit globale zoek-target", projectOverview.includes("openGlobalSearchTarget360") && projectOverview.includes('target.module !== "project360"'));

ok("Premium design tokens aanwezig", ["--cws-navy", "--cws-blue", "--cws-bg", "--cws-card", "--cws-line"].every(token => theme.includes(token)));
ok("Header/topbar premium navy aanwezig", theme.includes(".headerbar") && theme.includes("var(--cws-navy)"));
ok("Apps menu tegelstijl aanwezig", theme.includes(".apps-card-shell") && theme.includes(".app-arrow") && theme.includes(".apps-hero"));
ok("Mobiele safe-area bottom nav aanwezig", theme.includes("env(safe-area-inset-bottom)") && theme.includes("--mobileNavH"));

ok("Gantt responsive styling blijft pointer-safe", theme.includes(".gantt-shell .bar-label") && theme.includes("pointer-events:none!important") && theme.includes(".gantt-shell .handle"));
ok("Gantt bestaande drag/resize pointer lifecycle blijft aanwezig", gantt.includes("pointerdown") && gantt.includes("pointermove") && gantt.includes("pointerup") && gantt.includes("setPointerCapture"));
ok("Gantt printregels blijven aanwezig", gantt.includes("@media print") && gantt.includes("printCalendarTop") && gantt.includes("printCalendarBottom"));

ok("Capaciteit blijft Gantt sources/hours gebruiken", capacity.includes("gantt?.sourcesByDay") && capacity.includes("gantt?.hoursByDay"));
ok("Capaciteit responsive heatmap/matrix scrollbars blijven aanwezig", capacity.includes("heatmap-wrap") && capacity.includes("matrix-wrap") && capacity.includes("scrollbar-dock"));
ok("Capaciteit printroot vervangt oude A0-print", capacity.includes("cwsCapacityPrintRoot") && !capacity.includes("@page{size:A0 landscape") && !capacity.includes("@page { size:A0 landscape"));

const appCodeFiles = [
  "index.html",
  "css/theme.css",
  "css/responsive-v73.css",
  "js/core/apps_menu.js",
  "js/core/responsive.js",
  "js/core/mobile_adapter.js",
  "layers/laag4_gantt.html",
  "layers/laag5_capaciteit.html",
];
const forbidden = refs.filter(file => file.endsWith(".jpeg")).map(file => path.basename(file));
const offenders = [];
for (const file of appCodeFiles) {
  const text = read(file);
  forbidden.forEach(name => {
    if (text.includes(name)) offenders.push(`${file}:${name}`);
  });
}
ok("Referentieafbeeldingen worden niet als app-UI geïmporteerd/getoond", offenders.length === 0, offenders.join(", "));

if (failed) process.exit(1);
