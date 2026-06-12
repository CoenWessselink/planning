import fs from 'node:fs';
function read(path){ return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'); }
function check(label, pass){ console.log(`${pass ? 'OK' : 'FAIL'} - ${label}`); if(!pass) process.exitCode = 1; }
const store = read('js/core/store.js');
const stateApi = read('functions/api/state.js');
const shared = read('functions/api/_shared.js');
const health = read('functions/api/health.js');
const pkg = read('package.json');
check('V60 health versie herkenbaar en lichtgewicht', health.includes('internal-test-v60') && health.includes('v60-lightweight-no-state-load') && !health.includes('ensureSchema'));
check('V60 state GET ondersteunt raw response zonder JSON wrapper', stateApi.includes('wantsRawStateResponse') && stateApi.includes('rawStateResponse(row?.state_json || ""') && stateApi.includes('X-CWS-State-Exists') && stateApi.includes('X-CWS-Version'));
check('V60 shared headers exposen raw-state metadata', shared.includes('Access-Control-Expose-Headers') && shared.includes('X-CWS-State-Response') && shared.includes('rawStateResponse'));
check('V60 browser vraagt raw-state body aan', store.includes('X-CWS-State-Response') && store.includes('payload=raw-state') && store.includes('await response.text()') && store.includes('remoteState = JSON.parse(raw)'));
check('V60 lokale recovery-backup voorkomt leeg fallbackverlies', store.includes('KEY_BACKUP') && store.includes('LEGACY_STATE_KEYS') && store.includes('writeLocalSnapshot(state)') && store.includes('stateHasBusinessData(state)'));
check('V60 package preflight geregistreerd', pkg.includes('preflight:v60'));
if(process.exitCode) process.exit(process.exitCode);
