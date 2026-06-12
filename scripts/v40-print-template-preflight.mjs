import { readFileSync } from 'node:fs';
const files={g:'layers/laag4_gantt.html',s:'layers/laag10_instellingen.html',p:'package.json'};
const txt=Object.fromEntries(Object.entries(files).map(([k,v])=>[k,readFileSync(v,'utf8')]));
const checks=[
  ['Gantt heeft template-dropdown naast Genereer fasen', txt.g.includes('id="templateSel"') && txt.g.includes('Template voor Genereer fasen')],
  ['Gantt genereert gekozen template en bewaart project.templateId', txt.g.includes('project.templateId') || txt.g.includes('templateId=e.target.value')],
  ['Print verbergt Boven/Compact/Menu/mobile toolbar hard', txt.g.includes('.mobile-toolbar,.v37-mobile-action-dock,.toolbar') && txt.g.includes('visibility:hidden')],
  ['Print heeft compacte projectkop met logo/placeholder', txt.g.includes('printProjectHeaderText') && txt.g.includes('print-logo-placeholder')],
  ['Print gebruikt compleet dun dagraster per dag', txt.g.includes('repeating-linear-gradient(to right,#111827 0 .35px')],
  ['Print tabel en diagram delen rijhoogte variabele', txt.g.includes('--v40-print-row') && txt.g.includes('height:var(--v40-print-row)')],
  ['Printtaaktabel heeft Regel nr / Naam / Resource / Duur', txt.g.includes('<th>Regel nr</th><th>Naam</th><th>Resource</th><th>Duur</th>')],
  ['Templates hebben Nr-kolom', txt.s.includes('<th style="width:56px;">Nr</th>') && txt.s.includes('tpl-rowno')],
  ['Templates tonen voorgangers als regelnummers', txt.s.includes('tplPredNumbers') && txt.s.includes('tpl-pred-nos')],
  ['Templates hebben voorganger multiselect/picker', txt.s.includes('openTplPredPicker') && txt.s.includes('multiple')],
  ['Template voorgangers beperken tot eerdere regels', txt.s.includes('r.nr<cur.nr')],
  ['V40 preflight geregistreerd', txt.p.includes('preflight:v40')]
];
let ok=0; for(const [name,pass] of checks){ console.log(`${pass?'OK':'MIS'} - ${name}`); if(pass) ok++; }
if(ok!==checks.length){ console.error(`${ok}/${checks.length} controles OK.`); process.exit(1); }
console.log(`${ok}/${checks.length} controles OK.`);
