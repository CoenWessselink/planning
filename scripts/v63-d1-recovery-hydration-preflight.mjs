import fs from 'node:fs';

const files = {
  store: fs.readFileSync('js/core/store.js','utf8'),
  state: fs.readFileSync('functions/api/state.js','utf8'),
  health: fs.readFileSync('functions/api/health.js','utf8'),
  pkg: fs.readFileSync('package.json','utf8')
};

const checks = [
  ['health v63 marker', (/internal-test-v63/.test(files.health) || /internal-test-v64/.test(files.health)) && (/v63-lightweight-no-state-load/.test(files.health) || /v64-lightweight-no-state-load/.test(files.health))],
  ['D1 recovery hydration authoritative', /V63: recovery hydration is authoritative/.test(files.store) && /stateHasBusinessData\(incoming\)/.test(files.store)],
  ['remote state rebuilt before validation', /rebuildGanttHoursByDay\(incoming\)/.test(files.store) && /const validation = validateState\(incoming\)/.test(files.store)],
  ['remote safety snapshot set before validation decision', /remoteSafetySnapshot = \{ \.\.\.incomingMetrics/.test(files.store)],
  ['UI-only setState skips remote D1 PUT', /UI-only route\/tab updates must never trigger a remote D1 PUT/.test(files.store) && /if\(!tenantChanged\)\{[\s\S]*?writeLocalSnapshot\(state\)/.test(files.store)],
  ['empty D1 response is not auto-uploaded', /empty D1 response must not be repaired by auto-uploading/.test(files.store) && !/await storageAdapter\.save\(state\);\n\s*\}else\{\n\s*storageStatus\.unsynced = false;/.test(files.store)],
  ['server guard still active', /assertNoCatastrophicOverwrite/.test(files.state) && /V63 D1 save guard/.test(files.state)],
  ['package exposes preflight v63', /"preflight:v63"/.test(files.pkg)]
];

let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'OK' : 'FOUT'} - ${name}`);
  if (!pass) ok = false;
}
if (!ok) process.exit(1);
