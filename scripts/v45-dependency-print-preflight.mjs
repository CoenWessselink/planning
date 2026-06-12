import fs from 'node:fs';
const gantt=fs.readFileSync('layers/laag4_gantt.html','utf8');
const checks=[
  ['V45 CSS marker aanwezig', gantt.includes('V45 — dependency visibility')],
  ['Dependency SVG boven raster/balken', gantt.includes('.dep-svg{z-index:9!important;}') && gantt.includes('.printing .dep-svg{z-index:10!important;}')],
  ['Schermlijnen dikker en zichtbaar', gantt.includes('stroke-width:1.65') && gantt.includes('markerWidth",UI.printMode?"4":"6"')],
  ['Print dependencylijnen iets dikker', gantt.includes('stroke-width",UI.printMode?"0.62":"1.65"') || gantt.includes('stroke-width:.62')],
  ['Routing via row gutters', gantt.includes('below the source bar') || gantt.includes('Keep the connector in row gutters')],
  ['Print diagram daglijnen dunner', gantt.includes('--v45-print-grid:.28px') && gantt.includes('.printing .day-grid-line')],
  ['Vrije dagen geen dikke border', gantt.includes('.printing .nonwork-shade') && gantt.includes('border:0!important')],
  ['Logo groter in print', gantt.includes('max-width:132px') && gantt.includes('max-height:46px')],
  ['PDF titel met spaties rond scheiding', gantt.includes('join(" - ")') && gantt.includes('document.title=printFileName(p)')],
];
let ok=true;
for(const [label,pass] of checks){ console.log(`${pass?'OK':'FAIL'} - ${label}`); if(!pass) ok=false; }
if(!ok) process.exit(1);
console.log(`${checks.length}/${checks.length} V45 dependency/print controles OK.`);
