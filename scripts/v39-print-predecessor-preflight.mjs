import fs from "node:fs";
const gantt = fs.readFileSync("layers/laag4_gantt.html", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
let ok = true;
const checks = [
  [pkg.scripts?.["preflight:v39"] === "node scripts/v39-print-predecessor-preflight.mjs", "V39 preflight script geregistreerd"],
  [gantt.includes("pred-select") && gantt.includes("multiple") && gantt.includes("predecessorOptionsHtml"), "Voorganger is multi-selectie/dropdown"],
  [gantt.includes("function encodePred") && gantt.includes("join(\";\")"), "Meerdere voorgangers worden intern opgeslagen"],
  [gantt.includes("predecessorDisplay(raw") && gantt.includes("rowNumberMap(model)"), "Voorgangers worden als regelnummers getoond"],
  [gantt.includes("openPredecessorPicker") && gantt.includes("Voorgangers kiezen"), "Contextmenu/knop opent voorgangerkeuze"],
  [gantt.includes("idx<0 || x.index<idx"), "Voorgangerselectie voorkomt keuze van latere/zelfde regel"],
  [gantt.includes(".mobile-toolbar,.v37-mobile-action-dock,.toolbar") && gantt.includes("display:none!important"), "Print verwijdert Boven/Compact/Menu/mobiele toolbar"],
  [gantt.includes(".print-header{display:flex!important") && gantt.includes("printProjectHeaderText"), "Printkop toont projectnaam-projectnummer-opdrachtgever"],
  [gantt.includes("repeating-linear-gradient(to right, rgba(17,24,39,.45)") && gantt.includes("calc(var(--dayW) * 7)"), "Print behoudt dunne dag- en weeklijnen"],
  [gantt.includes("printFileName(p)") && gantt.includes("document.title=printFileName(p)"), "Print/PDF documenttitel gebruikt project-bestandsnaam"],
  [gantt.includes("print-logo-placeholder") && gantt.includes("Bedrijfslogo"), "Logo/placeholder in printheader geborgd"],
  [gantt.includes("<th>Regel nr</th><th>Naam</th><th>Resource</th><th>Duur</th>"), "Printtaaktabel bevat Regel nr / Naam / Resource / Duur"],
];
for (const [pass, label] of checks) {
  console.log(`${pass ? "OK" : "FAIL"} - ${label}`);
  if (!pass) ok = false;
}
if (!ok) process.exit(1);
console.log("12/12 V39 print/voorganger controles OK.");
