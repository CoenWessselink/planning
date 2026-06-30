import fs from 'node:fs';

const files = [
  'layers/laag4_gantt.html',
  'layers/laag5_capaciteit.html',
  'layers/laag10_instellingen.html',
  'layers/laag13_preflight.html',
  'js/core/ui.js',
  'js/core/store.js',
  'tests/acceptance/cws.acceptance.spec.js'
];
const read = f => fs.readFileSync(f, 'utf8');
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok, detail });
for (const f of files) add(`bestand aanwezig: ${f}`, fs.existsSync(f));
const gantt = read('layers/laag4_gantt.html');
const cap = read('layers/laag5_capaciteit.html');
const settings = read('layers/laag10_instellingen.html');
const preflight = read('layers/laag13_preflight.html');
const ui = read('js/core/ui.js');
const store = read('js/core/store.js');
const tests = read('tests/acceptance/cws.acceptance.spec.js');

add('centrale printhelper heeft logo', ui.includes('companyPrintInfo') && ui.includes('print-logo'));
add('store bedrijfsnaam gebruikt Instellingen als SSOT', store.includes('settings.tables.company[0]?.name) || st.company.name'));
add('logo-upload blokkeert SVG veilig', !settings.includes('image/svg+xml') && settings.includes('SVG is uitgeschakeld'));
add('Capaciteit gebruikt nieuwe printroot zonder A0 dagmatrix', cap.includes('cwsCapacityPrintRoot') && !cap.includes('a0-day-table') && !cap.includes('renderA0DayPrint'));
add('Capaciteit gebruikt ISO-correcte weekverschuiving', cap.includes('isoWeekFromDate') && !cap.includes('while(ww>52)'));
add('Capaciteitsperiode wordt in state opgeslagen', cap.includes('st.ui.capacity.period'));
add('Gantt taakbalk dubbelklik opent popup', gantt.includes('bar.addEventListener("dblclick"') && gantt.includes('openEdit(id)'));
add('Gantt kolommen zijn sleepbaar', gantt.includes('wireColumnDrag') && gantt.includes('COL_ORDER_KEY'));
add('Gantt rijen zijn sleepbaar', gantt.includes('tr.addEventListener("dragstart"') && gantt.includes('Rijvolgorde opgeslagen'));
add('Gantt dropdowns worden niet direct hard her-renderd', gantt.includes('scheduleRenderAfterInput') && gantt.includes('saveModelNoRender'));
add('Preflight V28 heeft vereiste metrics', preflight.includes('V28 metrics') && preflight.includes('Capaciteit A0 dagmatrix voorbereid'));
add('Acceptatietest gebruikt huidige Gantt-selectors', tests.includes("#tableRows") && tests.includes(".bar") && tests.includes('baseVersion: initialBody.version'));

const failed = checks.filter(c => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'OK' : 'FAIL'} - ${c.name}${c.detail ? `: ${c.detail}` : ''}`);
if (failed.length) {
  console.error(`\n${failed.length} V28 statische preflight-controles gefaald.`);
  process.exit(1);
}
console.log(`\nAlle ${checks.length} V28 statische preflight-controles geslaagd.`);
