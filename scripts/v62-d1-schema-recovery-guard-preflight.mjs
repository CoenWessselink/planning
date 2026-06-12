import fs from 'node:fs';

const files = {
  store: fs.readFileSync('js/core/store.js','utf8'),
  state: fs.readFileSync('functions/api/state.js','utf8'),
  health: fs.readFileSync('functions/api/health.js','utf8'),
  preflight: fs.readFileSync('layers/laag13_preflight.html','utf8'),
  index: fs.readFileSync('index.html','utf8')
};

const checks = [
  ['store stateMetrics exported', /getStateMetrics:\s*\(\)\s*=>\s*stateMetrics\(state\)/.test(files.store)],
  ['store remote safety exported', /getRemoteSafetyMetrics:\s*\(\)\s*=>\s*\(\{\s*\.\.\.remoteSafetySnapshot/.test(files.store)],
  ['store rich object schema preserved', /projects\.order\/byId/.test(files.store) && /hasLegacyObjectSchema/.test(files.store)],
  ['store catastrophic overwrite guard', /protectAgainstCatastrophicOverwrite/.test(files.store) && /(v62-catastrophic-overwrite|v63-catastrophic-overwrite)/.test(files.store)],
  ['server D1 save guard', /assertNoCatastrophicOverwrite/.test(files.state) && /(V62 D1 save guard|V63 D1 save guard)/.test(files.state)],
  ['server compares current state_json', /SELECT version, state_json FROM app_state/.test(files.state)],
  ['health v62 marker', /internal-test-v62/.test(files.health) && /v62-lightweight-no-state-load/.test(files.health)],
  ['preflight v62 metrics', /(V62 state metrics|V63 state metrics)/.test(files.preflight) && /(V62 D1 overwrite guard actief|V63 D1 overwrite guard actief)/.test(files.preflight)],
  ['demo clear guarded', /DEMO OVERSCHRIJVEN/.test(files.index) && /DATA LEEGMAKEN/.test(files.index)]
];

let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'OK' : 'FOUT'} - ${name}`);
  if (!pass) ok = false;
}
if (!ok) process.exit(1);
