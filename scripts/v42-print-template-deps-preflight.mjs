import fs from "node:fs";
const f=(p)=>fs.readFileSync(p,"utf8");
const checks=[
 ["Tasche logo asset aanwezig",()=>fs.existsSync("assets/tasche-logo.png")],
 ["Print fallback gebruikt Tasche logo asset",()=>f("layers/laag4_gantt.html").includes("../assets/tasche-logo.png")],
 ["V42 print raster CSS aanwezig",()=>f("layers/laag4_gantt.html").includes("--v42-line")&&f("layers/laag4_gantt.html").includes("repeating-linear-gradient(to right,#1f2937")],
 ["Print rijen wisselend lichtgrijs",()=>f("layers/laag4_gantt.html").includes("nth-child(even)")&&f("layers/laag4_gantt.html").includes("--v42-alt")],
 ["Hoofdtaak/summary Tasche geel",()=>f("layers/laag4_gantt.html").includes("--v42-yellow")&&f("layers/laag4_gantt.html").includes("summary-row")],
 ["Tabel/diagram delen vaste rijhoogte",()=>f("layers/laag4_gantt.html").includes("--v42-row")&&f("layers/laag4_gantt.html").includes("height:var(--v42-row)")],
 ["Afhankelijkheden hebben pijlmarker",()=>f("layers/laag4_gantt.html").includes("depArrow")&&f("layers/laag4_gantt.html").includes("marker-end")],
 ["Afhankelijkheden orthogonaal gerouteerd",()=>f("layers/laag4_gantt.html").includes(" H ${elbow} V ${y2} H ${x2}")],
 ["Template sticky Nr/Fase/Taak/Voorgangers",()=>f("layers/laag4_gantt.html").includes("#tplBackdrop th:nth-child(4)")],
 ["V42 preflight geregistreerd",()=>f("package.json").includes("preflight:v42")]
];
let ok=0;
for(const [name,fn] of checks){ let pass=false; try{pass=!!fn()}catch{} console.log(`${pass?"OK":"FOUT"} - ${name}`); if(pass) ok++; }
if(ok!==checks.length){ console.error(`${ok}/${checks.length} controles OK.`); process.exit(1);}
console.log(`${ok}/${checks.length} controles OK.`);
