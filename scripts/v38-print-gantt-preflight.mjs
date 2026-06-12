import fs from "node:fs";
const file = "layers/laag4_gantt.html";
const css = "css/theme.css";
const pkg = JSON.parse(fs.readFileSync("package.json","utf8"));
const s = fs.readFileSync(file,"utf8");
const theme = fs.existsSync(css) ? fs.readFileSync(css,"utf8") : "";
const checks = [
  [pkg.scripts?.["preflight:v38"] === "node scripts/v38-print-gantt-preflight.mjs", "V38 preflight script geregistreerd"],
  [s.includes('{id:"rowno",label:"Nr"') && s.includes('row._displayNo=i+1'), "Gantt heeft doorlopende regelnummerkolom"],
  [s.includes('function predecessorDisplay') && s.includes('rowNumberMap(model)') && s.includes('return predecessorDisplay(row.predecessor)'), "Voorganger wordt als regelnummer weergegeven"],
  [s.includes('showDeps:false') && s.includes('<button class="btn" id="depsBtn">Afhankelijkheden</button>'), "Afhankelijkheden standaard uit"],
  [s.includes('Regel nr') && s.includes('<th>Naam</th>') && s.includes('row._displayNo'), "Print-taaktabel heeft regelnummer en naam"],
  [s.includes('printFileName(p)') && s.includes('projectClient(p)') && s.includes('document.title=printFileName(p)'), "Print/PDF bestandsnaam gebruikt projectnaam-projectnummer-opdrachtgever-datum"],
  [s.includes('printProjectHeaderText') && s.includes('projectClient(p)') && !s.includes('Tabel: Taaknaam / Resource / Dagen'), "Printkop is compact en toont projectnaam-projectnummer-opdrachtgever"],
  [s.includes('.toolbar,.notice,.context,.mobile-toolbar,.v37-mobile-action-dock') && s.includes('display:none!important'), "Menu/compacte mobiele toolbar wordt uit print verwijderd"],
  [s.includes('border:.35px solid #111827') && s.includes('stroke-width",UI.printMode?"0.55"'), "Printlijnen zijn dunner geborgd"],
  [s.includes('print-logo-placeholder') && s.includes('function logoHtml'), "Logo/placeholder zichtbaar in printheader"],
];
let ok = true;
for (const [pass,label] of checks) {
  console.log(`${pass ? "OK" : "FAIL"} - ${label}`);
  if (!pass) ok = false;
}
if (!ok) process.exit(1);
console.log(`${checks.length}/${checks.length} controles OK.`);
