import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const checks = [];
const add = (ok, label) => checks.push({ ok: !!ok, label });
const must = (p) => fs.existsSync(p) ? read(p) : '';

const pkg = JSON.parse(read('package.json'));
const project = must('layers/laag3_projecten.html');
const gantt = must('layers/laag4_gantt.html');
const cap = must('layers/laag5_capaciteit.html');
const settings = must('layers/laag10_instellingen.html');
const preflight = must('layers/laag13_preflight.html');
const store = must('js/core/store.js');
const index = must('index.html');

add(pkg.scripts?.['preflight:v34'] === 'node scripts/v34-functional-preflight.mjs', 'V34 preflight script geregistreerd');
add(project.includes('CWS_PARENT_BRIDGED') && project.includes('../js/core/store.js'), 'Projecten heeft standalone/file fallback voor CWS-store');
add(gantt.includes('CWS_PARENT_BRIDGED') && gantt.includes('../js/core/store.js'), 'Gantt heeft standalone/file fallback voor CWS-store');
add(cap.includes('CWS_PARENT_BRIDGED') && cap.includes('../js/core/store.js'), 'Capaciteit heeft standalone/file fallback voor CWS-store');
add(settings.includes('CWS_PARENT_BRIDGED') && settings.includes('../js/core/store.js'), 'Instellingen heeft standalone/file fallback voor CWS-store');
add(preflight.includes('CWS_PARENT_BRIDGED') && preflight.includes('../js/core/store.js'), 'Preflight heeft standalone/file fallback voor CWS-store');
add(project.includes('TABS.includes(st.ui.lastTab) ? st.ui.lastTab : "Alle"'), 'Projecten corrigeert ongeldige active tab naar Alle');
add(index.includes('CWS.resetDemo();') && index.includes('Router.loadApp("projecten")'), 'Demo-knop herlaadt Projecten na reset');
add(store.includes('localStorage.setItem(KEY_TENANT') && store.includes('localStorage.setItem(KEY_GLOBAL'), 'State save synchroniseert tenant en global localStorage');
add(store.includes('st.ganttV2.byProject["P-1001"]') && store.includes('st.projects.order.push(p.id)'), 'Demo seed bevat projecten en Gantt taken');
add(settings.includes('id="quickCompany"') && settings.includes('id="quickLogo"'), 'Instellingen Bedrijf/logo direct bereikbaar');
add(cap.includes('Beschikbare capaciteit') && cap.includes('Benodigde capaciteit') && cap.includes('Resterende capaciteit'), 'Capaciteit bevat afdelingsrijen beschikbaar/benodigd/resterend');

let passed = 0;
for (const c of checks) {
  if (c.ok) { passed += 1; console.log('OK - ' + c.label); }
  else console.error('FAIL - ' + c.label);
}
console.log(`${passed}/${checks.length} controles OK.`);
if (passed !== checks.length) process.exit(1);
