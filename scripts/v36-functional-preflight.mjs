import fs from "node:fs";
const read = (p) => fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
const files = {
  packageJson: read("package.json"),
  settings: read("layers/laag10_instellingen.html"),
  gantt: read("layers/laag4_gantt.html"),
  capacity: read("layers/laag5_capaciteit.html"),
  ui: read("js/core/ui.js"),
  fallback: read("scripts/e2e-fallback.mjs")
};
let failed = 0;
function ok(label, pass){ console.log(`${pass ? "OK" : "FAIL"} - ${label}`); if(!pass) failed += 1; }
ok("V36 preflight script geregistreerd", files.packageJson.includes('"preflight:v36"'));
ok("Instellingen Bedrijf-snelknop heeft echte eventbinding", files.settings.includes("bindV36QuickSettingsButtons") && files.settings.includes('openModule("bedrijf")'));
ok("Instellingen Logo-snelknop opent logo-modal", files.settings.includes("bindV36QuickSettingsButtons") && files.settings.includes("openLogoModal()"));
ok("Logo-upload blokkeert SVG op MIME én bestandsextensie", files.settings.includes('file.type === SVG_MIME || ext === "svg"'));
ok("Logo-upload accepteert uitsluitend PNG/JPG/JPEG data-url", files.settings.includes('data:image/png') && files.settings.includes('data:image/jpeg'));
ok("Gantt rijvolgorde drag/drop blijft aanwezig", files.gantt.includes('tr.addEventListener("dragstart"') && files.gantt.includes('Rijvolgorde opgeslagen'));
ok("Gantt kolomvolgorde drag/drop blijft aanwezig", files.gantt.includes('th.addEventListener("dragstart"') && files.gantt.includes('Kolomvolgorde opgeslagen'));
ok("Gantt contextmenu actiepad bevat dupliceren/verwijderen/gereed", files.gantt.includes('action==="duplicate"') && files.gantt.includes('action==="delete"') && files.gantt.includes('action==="done"'));
ok("Gantt A3-print heeft bedrijfslogo helper", files.gantt.includes("function logoHtml") && files.gantt.includes("print-logo"));
ok("Capaciteit A0-print heeft bedrijfslogo helper", files.capacity.includes("function logoHtml") && files.capacity.includes("print-logo"));
ok("Centrale printhelper heeft logo-fallback", files.ui.includes("companyPrintInfo") && files.ui.includes("print-logo-placeholder"));
ok("Fallback-E2E bevat V36 regressiechecks", files.fallback.includes("V36 Bedrijf snelknop") && files.fallback.includes("V36 logo-upload blokkeert SVG"));
if(failed){ console.error(`${failed} V36-controle(s) gefaald.`); process.exit(1); }
console.log("12/12 V36 controles OK.");
