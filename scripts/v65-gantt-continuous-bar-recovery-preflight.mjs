import fs from 'fs';
const gantt = fs.readFileSync('layers/laag4_gantt.html','utf8');
const health = fs.readFileSync('functions/api/health.js','utf8');
const pkg = fs.readFileSync('package.json','utf8');
const checks = [
  ['health v65 marker', /internal-test-v65/.test(health) && /v65-lightweight-no-state-load/.test(health)],
  ['V65 structural marker present', /V65 — structurele Gantt-balkfix/.test(gantt)],
  ['continuous PDF-like task bar renderer present', /bar-continuous-task/.test(gantt) && /data-v65-continuous-task="1"/.test(gantt)],
  ['fragmented workday segment renderer disabled', !/segmentHtml=renderSegments\.map/.test(gantt) && !/data-workday-shell="1"/.test(gantt)],
  ['render uses effective schedule map', /function effectiveScheduleMap/.test(gantt) && /const scheduleMap=effectiveScheduleMap\(model,st\)/.test(gantt)],
  ['render no longer auto-saves schedule corrections', !/taakdatum\(s\) naar werkbare dagen gecorrigeerd/.test(gantt)],
  ['drag starts from effective data-start/data-end when legacy sched is short', /bar\.dataset\.start/.test(gantt) && /bar\.dataset\.end/.test(gantt)],
  ['package exposes preflight v65', /"preflight:v65"/.test(pkg)]
];
let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'OK' : 'FOUT'} - ${name}`);
  if (!pass) ok = false;
}
if (!ok) process.exit(1);
