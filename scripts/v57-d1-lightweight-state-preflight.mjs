import fs from 'node:fs';

function read(path){ return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'); }
function check(label, pass){ console.log(`${pass ? 'OK' : 'FAIL'} - ${label}`); if(!pass) process.exitCode = 1; }

const health = read('functions/api/health.js');
const state = read('functions/api/state.js');
const store = read('js/core/store.js');
const audit = read('functions/api/audit.js');
const users = read('functions/api/users.js');
const pkg = read('package.json');

check('V57 health is lichtgewicht zonder state-load', health.includes('v57-lightweight-no-state-load') && !health.includes('ensureSchema') && !health.includes('app_state'));
check('V57/V60 state GET ondersteunt raw-state zonder health state-load', state.includes('rawStateResponse') && state.includes('readFullStateJson') && state.includes('wantsRawStateResponse'));
check('V57 state PUT ondersteunt raw-state payload', state.includes('X-CWS-State-Payload') && state.includes('url.searchParams.get("payload") === "raw-state"') && state.includes('extractSchemaVersionFromRawState'));
check('V57/V82 state PUT bewaart raw-state via checkpoint/chunks', state.includes('incoming.stateJson') && state.includes('writeCheckpoint') && state.includes('rawMode:incoming.rawMode'));
check('V57 client parseert stateJson in browser', store.includes('if(data.stateJson && typeof data.stateJson === "string")') && store.includes('data.state = JSON.parse(data.stateJson)'));
check('V57 client verzendt raw state met baseVersion header', store.includes('X-CWS-State-Payload') && store.includes('raw-state') && store.includes('X-CWS-Base-Version') && store.includes('body:stateJson'));
check('V57 schema repair alleen wanneer nodig bij state', state.includes('let schema = await verifyRequiredSchema(db);') && state.includes('if (!schema.ok) schema = await ensureSchema(db);'));
check('V57 audit/users schema repair alleen wanneer nodig', audit.includes('if (!schema.ok) schema = await ensureSchema(db);') && users.includes('if (!schema.ok) schema = await ensureSchema(db);'));
check('V57 preflight script geregistreerd', pkg.includes('preflight:v57'));

if(process.exitCode) process.exit(process.exitCode);
