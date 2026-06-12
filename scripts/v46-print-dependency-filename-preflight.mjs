import fs from 'fs';
const file='layers/laag4_gantt.html';
const src=fs.readFileSync(file,'utf8');
const checks=[
  ['V46 CSS marker aanwezig', src.includes('V46 — Gantt print fine-tuning')],
  ['PDF-titel blijft 120 seconden actief', src.includes('setTimeout(()=>{ document.title=oldTitle; },120000)')],
  ['Print bestandsnaam gebruikt Project - Nummer - Opdrachtgever - Datum', src.includes('printFileName(p)') && src.includes('join(" - ")') && src.includes('${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()}')],
  ['Printtafel kolombreedtes worden uit inhoud berekend', src.includes('longestName') && src.includes('--v46-print-left-w')],
  ['Duurkolom krijgt eigen vaste breedte', src.includes('--v46-col-dur') && src.includes('Duur')],
  ['Print diagramlijnen zijn lichter en dunner', src.includes('--v46-print-grid:.20px') && src.includes('--v46-print-day:#9aa4b2')],
  ['Niet-werkbare dagen donkerder grijs', src.includes('rgba(100,116,139,.24)')],
  ['Dependency route sluit op balk-zijkant aan', src.includes('Better side-connection') && src.includes('barTop + barH/2')],
  ['Dependency lijn heeft witte halo voor zichtbaarheid', src.includes('const halo=') && src.includes('stroke","#fff')],
  ['Dependency lijn is iets dikker in schermweergave', src.includes('stroke-width",UI.printMode?"0.55":"2.05')],
];
let ok=0;
for(const [name,pass] of checks){
  if(pass){ ok++; console.log(`OK - ${name}`); }
  else { console.error(`FAIL - ${name}`); }
}
if(ok!==checks.length){ console.error(`${ok}/${checks.length} controles OK.`); process.exit(1); }
console.log(`${ok}/${checks.length} controles OK.`);
