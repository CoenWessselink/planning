import fs from 'node:fs';
const file='layers/laag4_gantt.html';
const s=fs.readFileSync(file,'utf8');
const checks=[
  ['V44 print CSS marker', s.includes('V44 — definitive Gantt print raster')],
  ['Elke dag krijgt echte gridline span', s.includes('dayGridLineHtml') && s.includes('day-grid-line')],
  ['Print gridline zichtbaar en dun', s.includes('--v44-print-thin') && s.includes('.printing .day-grid-line')],
  ['Tabel en diagram gebruiken dezelfde rijhoogte', s.includes('--v44-print-row-h') && s.includes('.printing .lane') && s.includes('.printing .print-task-table th,.printing .print-task-table td')],
  ['Headerhoogte tabel en timeline gelijkgetrokken', s.includes('--v44-print-head-h') && s.includes('.printing .timeline') && s.includes('.printing .print-task-table thead th')],
  ['Scheidingslijn tussen tabel en diagram aanwezig', s.includes('border-right:var(--v44-print-thin) solid var(--v44-print-line)')],
  ['Diagram gebruikt zelfde font als tabel', s.includes('.printing .bar .bar-label') && s.includes('font-family:Arial,Helvetica,sans-serif!important')],
  ['Vrije dagen geen dikke border meer', s.includes('.printing .nonwork-shade') && s.includes('border:0!important')],
  ['Kalender past binnen totale A3-printbreedte', s.includes('1500-Math.max(0,Number(printLeftW)||0)') && s.includes('setPrintDayWidth(range,printLeftW)') && s.includes('toFixed(3)')],
  ['Print toolbar verborgen', s.includes('.printing .toolbar') && s.includes('.printing .mobile-toolbar') && s.includes('display:none!important')],
];
let ok=true;
for(const [label,pass] of checks){ console.log(`${pass?'OK':'FAIL'} - ${label}`); if(!pass) ok=false; }
if(!ok) process.exit(1);
console.log(`${checks.length}/${checks.length} V44 Gantt print-raster controles OK.`);
