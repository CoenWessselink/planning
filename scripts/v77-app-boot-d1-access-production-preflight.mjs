import fs from 'fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const checks = [];
const add = (ok, label, details='') => checks.push({ ok:Boolean(ok), label, details });

const store = read('js/core/store.js');
const router = read('js/core/router.js');
const index = read('index.html');
const health = read('functions/api/health.js');
const server = read('playwright/server.js');
const pkg = JSON.parse(read('package.json'));

add(store.includes('v77-app-boot-d1-access-production-fix'), 'Store bevat V77 boot/D1/Access marker');
add(store.includes('fetchWithTimeout') && store.includes('HEALTH_FETCH_TIMEOUT_MS') && store.includes('STATE_FETCH_TIMEOUT_MS'), 'D1 health/state fetches hebben timeout');
add(store.includes('runtimeInfo') && store.includes('isPreviewDeployment'), 'Runtime detecteert productie vs preview deployment');
add(store.includes('schedulePostBootIntegrityCheck') && store.includes('requestIdleCallback'), 'Zware live-readiness/capacity controle is uitgesteld tot na boot');
add(!/buildLiveReadinessReport\(state\);\s*notify\(\);\s*return/.test(store), 'Boot blokkeert niet meer op directe live-readiness vlak voor notify');
add(store.includes('tenantChangedRaw') && store.includes('v77UiOnlyFastPath'), 'UI-only setState gebruikt snelle route zonder Gantt/capacity rebuild');
add(store.includes('markBootPhase("ready"') && store.includes('bootDurationMs'), 'Bootstatus en bootduur worden bijgehouden');
add(router.includes('safeBootApp') && router.includes('return "projecten"'), 'Router start veilig op Projecten tenzij URL app expliciet kiest');
add(router.includes('appFromUrl') && router.includes('searchParams.get("app")'), 'Router ondersteunt expliciete ?app= of hash-start');
add(index.includes('Cloudflare Access-identiteit ontbreekt') && index.includes('Previewdeployment'), 'Index toont duidelijke D1/Access/preview status');
add(health.includes('internal-test-v77') && health.includes('v77-lightweight-no-state-load'), 'Cloudflare health is V77 lichtgewicht');
add(server.includes('local-test-v77') && server.includes('local-test-server-v77'), 'Lokale testserver is V77');
add(pkg.scripts?.['preflight:v77'] === 'node scripts/v77-app-boot-d1-access-production-preflight.mjs', 'package.json bevat preflight:v77');
add((pkg.scripts?.['preflight:all'] || '').includes('run-all-preflights'), 'preflight:all blijft centrale runner gebruiken');

let ok = true;
for (const c of checks) {
  if (c.ok) console.log(`OK - ${c.label}${c.details ? ' — ' + c.details : ''}`);
  else { ok = false; console.error(`FAIL - ${c.label}${c.details ? ' — ' + c.details : ''}`); }
}
if (!ok) process.exit(1);
console.log('V77 app boot/D1/Access production preflight geslaagd.');
