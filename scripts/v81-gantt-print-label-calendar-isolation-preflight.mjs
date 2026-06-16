import { readFileSync } from 'node:fs';

const html = readFileSync('layers/laag4_gantt.html', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const required = [
  'V81 — print label/calendar isolation fix',
  'body.printing .print-calendar',
  'z-index:50',
  'body.printing .lane',
  'overflow:hidden!important',
  'body.printing .bar-text-before',
  'body.printing .bar-text-after',
  'contain:paint',
  'print label/calendar isolation'
];
const missing = required.filter(x => !html.includes(x));
if (missing.length) {
  console.error('V81 preflight failed. Missing markers:', missing.join(', '));
  process.exit(1);
}
if (pkg.scripts?.['preflight:v81'] !== 'node scripts/v81-gantt-print-label-calendar-isolation-preflight.mjs') {
  console.error('V81 preflight script missing from package.json');
  process.exit(1);
}
if (!String(pkg.scripts?.['preflight:all'] || '').includes('run-all-preflights')) {
  console.error('preflight:all should keep using run-all-preflights.mjs');
  process.exit(1);
}
console.log('V81 Gantt print label/calendar isolation preflight OK');
