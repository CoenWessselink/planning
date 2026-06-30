import fs from "node:fs";
const f=(p)=>fs.readFileSync(p,"utf8");
const cap=f("layers/laag5_capaciteit.html");
const capacityPrint=f("js/core/capacity_print_tasche_a3.js");
const pkg=f("package.json");
const checks=[
 ["Oude capaciteit A0-print CSS verwijderd",()=>!cap.includes("V43 capaciteit A0-print")&&!cap.includes("a0-day-print")&&!cap.includes("--v43-cap-line")],
 ["Tasche logo in nieuwe capaciteit print",()=>capacityPrint.includes("assets/tasche-logo.png")&&capacityPrint.includes("logo-box")],
 ["A0 print gebruikt Arial/Helvetica",()=>cap.includes("Arial,Helvetica,sans-serif")],
 ["Uniform dun raster rondom tabel/week/dag/afdeling",()=>capacityPrint.includes("border:0.45pt solid #9ca3af")&&capacityPrint.includes("capacity-table")],
 ["Lichtgrijze totalen aanwezig",()=>capacityPrint.includes("total-row")&&capacityPrint.includes("background:#f7f7f7")],
 ["Afdelingsregels in print aanwezig",()=>capacityPrint.includes("dept-cell")&&capacityPrint.includes("text-transform:uppercase")],
 ["Printbereik vanaf 3 weken voor huidige datum",()=>cap.includes("capacityPrintWeeks")&&cap.includes("addWeeks(tw.year,tw.week,-3)")],
 ["Printbereik tot 26 weken vooruit",()=>cap.includes("addWeeks(tw.year,tw.week,26)")&&cap.includes("3 weken terug t/m 26 weken vooruit")],
 ["PDF/documenttitel via nieuwe capaciteit-renderer",()=>capacityPrint.includes("<title>CAPACITEITSOVERZICHT</title>")&&capacityPrint.includes("PRINT_WINDOW_NAME")&&capacityPrint.includes("CWS_CAPACITY_TASCHE_A3_PRINT_V156")&&capacityPrint.includes("printCurrentDocument")&&cap.includes("capacityTaschePrint")],
 ["Print verbergt app/mobile toolbars via printroot",()=>cap.includes("body > :not(#cwsCapacityPrintRoot)")&&cap.includes("display:none!important")],
 ["Beschikbaar/Benodigd/Resterend in print",()=>cap.includes("Beschikbaar")&&cap.includes("Benodigd")&&cap.includes("Resterend")],
 ["V43 preflight geregistreerd",()=>pkg.includes("preflight:v43")]
];
let ok=0;
for(const [name,fn] of checks){ let pass=false; try{ pass=!!fn(); }catch{} console.log(`${pass?"OK":"FOUT"} - ${name}`); if(pass) ok++; }
if(ok!==checks.length){ console.error(`${ok}/${checks.length} controles OK.`); process.exit(1); }
console.log(`${ok}/${checks.length} controles OK.`);
