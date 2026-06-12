import fs from 'fs';
const gantt = fs.readFileSync('layers/laag4_gantt.html','utf8');
const health = fs.readFileSync('functions/api/health.js','utf8');
const pkg = fs.readFileSync('package.json','utf8');
const checks = [
  ['health v64 marker', /internal-test-v64/.test(health) && /v64-lightweight-no-state-load/.test(health)],
  ['one draggable workday shell per task', /bar-workday-shell/.test(gantt) && /data-workday-shell="1"/.test(gantt)],
  ['visible work segments remain inside shell', /bar-work-segment/.test(gantt) && /segmentHtml=renderSegments\.map/.test(gantt)],
  ['legacy multi-bar task rendering removed', !/class="bar \$\{segCls\}/.test(gantt)],
  ['drag binding still targets .bar shells', /function wireBars/.test(gantt) && /\.bar"\)\.forEach/.test(gantt) && /pointerdown/.test(gantt)],
  ['v59 working day correction preserved', /normalizeSchedule/.test(gantt) && /workSegments/.test(gantt) && /planning: alleen werkbare dagen/.test(gantt)],
  ['package exposes preflight v64', /"preflight:v64"/.test(pkg)]
];
let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'OK' : 'FOUT'} - ${name}`);
  if (!pass) ok = false;
}
if (!ok) process.exit(1);
