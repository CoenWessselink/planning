import fs from "node:fs";
const f=(p)=>fs.readFileSync(p,"utf8");
const cap=f("layers/laag5_capaciteit.html");
const pkg=f("package.json");
const checks=[
 ["V43 capaciteit A0-print CSS aanwezig",()=>cap.includes("V43 capaciteit A0-print")&&cap.includes("--v43-cap-line")&&cap.includes("--v43-cap-row")],
 ["Tasche logo fallback in capaciteit print",()=>cap.includes("../assets/tasche-logo.png")&&cap.includes("print-logo-fallback")],
 ["A0 print gebruikt Arial/Helvetica",()=>cap.includes("Arial,Helvetica,sans-serif")],
 ["Uniform dun raster rondom tabel/week/dag/afdeling",()=>cap.includes("border:0.45pt solid var(--v43-cap-line)")&&cap.includes("a0-section")],
 ["Lichtgrijze wisselregels aanwezig",()=>cap.includes("tbody tr:nth-child(even)")&&cap.includes("--v43-cap-alt")],
 ["Afdelingsregels in Tasche geel",()=>cap.includes("--v43-cap-yellow")&&cap.includes("text-transform:uppercase")],
 ["Printbereik vanaf 1 week voor huidige datum",()=>cap.includes("capacityPrintWeeks")&&cap.includes("addWeeks(tw.year,tw.week,-1)")],
 ["Printbereik tot 1 week na ingestelde weken vooruit",()=>cap.includes("(Number(UI.weeks)||6)+2")],
 ["PDF/documenttitel Bedrijfsnaam - Capaciteit - Datum",()=>cap.includes("capacityPrintTitle")&&cap.includes(" - Capaciteit - ")&&cap.includes("document.title=capacityPrintTitle()")],
 ["A0 print verbergt app/mobile toolbars",()=>cap.includes(".mobile-toolbar,.v37-mobile-action-dock")&&cap.includes("display:none!important")],
 ["Beschikbaar/Benodigd/Resterend in print",()=>cap.includes("Beschikbaar")&&cap.includes("Benodigd")&&cap.includes("Resterend")],
 ["V43 preflight geregistreerd",()=>pkg.includes("preflight:v43")]
];
let ok=0;
for(const [name,fn] of checks){ let pass=false; try{ pass=!!fn(); }catch{} console.log(`${pass?"OK":"FOUT"} - ${name}`); if(pass) ok++; }
if(ok!==checks.length){ console.error(`${ok}/${checks.length} controles OK.`); process.exit(1); }
console.log(`${ok}/${checks.length} controles OK.`);
