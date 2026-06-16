import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');
const fail = (msg) => { throw new Error(`[preflight:v82] ${msg}`); };

const [pkgRaw, stateFn, shared, store, health, server] = await Promise.all([
  read('package.json'),
  read('functions/api/state.js'),
  read('functions/api/_shared.js'),
  read('js/core/store.js'),
  read('functions/api/health.js'),
  read('playwright/server.js')
]);
const pkg = JSON.parse(pkgRaw);
if(!pkg.scripts?.['preflight:v82']) fail('package.json mist preflight:v82');
if(!stateFn.includes('V82_CHUNK_TABLE') || !stateFn.includes('app_state_chunks')) fail('state.js mist chunk table');
if(!stateFn.includes('readFullStateJson') || !stateFn.includes('writeFullStateJson')) fail('state.js mist chunk read/write helpers');
if(!stateFn.includes('__cwsChunkedState') || !stateFn.includes('v82-d1-chunked-state-save-fix')) fail('state.js mist chunk manifest marker');
if(!stateFn.includes('db.batch(statements)')) fail('state.js schrijft chunked state niet via batch');
if(!stateFn.includes('X-CWS-Chunked') || !stateFn.includes('X-CWS-Chunk-Count')) fail('state.js mist chunk headers');
if(!shared.includes('X-CWS-Chunked') || !shared.includes('X-CWS-Chunk-Count')) fail('_shared.js expose headers mist chunk headers');
if(!store.includes('createRemoteSaveSnapshot') || !store.includes('v82D1StateSizeAndSaveFix')) fail('store.js mist remote save projection');
if(!store.includes('delete snapshot.meta.liveReadiness') || !store.includes('delete snapshot.ui.printPreview')) fail('store.js prune transient UI/diagnostic data niet');
if(!store.includes('Grote D1-state') || !store.includes('lastRemoteChunked')) fail('store.js mist chunked save UI/status');
if(!health.includes('internal-test-v82')) fail('health.js mist internal-test-v82');
if(!server.includes('local-test-v82')) fail('playwright server mist local-test-v82');
console.log('[preflight:v82] D1 state-size/chunked-save controle geslaagd.');
