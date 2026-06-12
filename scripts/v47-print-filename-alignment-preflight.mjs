#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const html = readFileSync('layers/laag4_gantt.html','utf8');
const checks = [
  ['Parent document title for PDF filename', 'window.parent.document.title=wantedTitle'],
  ['Long title retention for PDF driver', '300000'],
  ['V47 content-fit column variable', '--v47-print-left-w'],
  ['V47 content-fit no/name/resource/dur columns', '--v47-col-res'],
  ['V47 lighter grid line variable', '--v47-print-grid:.18px'],
  ['V47 darker non-work days', '--v47-print-nonwork:#dfe4ea'],
  ['V47 uniform row height', '--v47-print-row-h:24px'],
  ['V47 uniform header height', '--v47-print-head-h:58px'],
  ['V47 dependency halo class', 'class","dep-halo'],
  ['V47 dependency line class', 'class","dep-line'],
  ['V47 side landing connector', 'targetLeft - targetGap*.25'],
  ['V47 PDF filename composition still project number client date', 'Projectnaam - Projectnummer - Opdrachtgever - Datum']
];
let ok = 0;
for (const [name, needle] of checks) {
  if (html.includes(needle)) { console.log(`OK - ${name}`); ok++; }
  else { console.error(`FAIL - ${name}`); process.exitCode = 1; }
}
if (process.exitCode) process.exit(1);
console.log(`${ok}/${checks.length} controles OK.`);
