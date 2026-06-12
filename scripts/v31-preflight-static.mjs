import fs from 'fs';

const files = {
  index: fs.readFileSync('index.html','utf8'),
  attention: fs.readFileSync('js/core/attention.js','utf8'),
  dashboard: fs.readFileSync('layers/laag9_dashboard.html','utf8'),
  projectOverview: fs.readFileSync('layers/laag6_projectoverzicht.html','utf8'),
  capacity: fs.readFileSync('layers/laag5_capaciteit.html','utf8'),
  reports: fs.readFileSync('layers/laag8_rapporten.html','utf8'),
  preflight: fs.readFileSync('layers/laag13_preflight.html','utf8'),
};

const checks = [
  ['Centrale attention-engine toegevoegd', files.attention.includes('CWS.attention') && files.attention.includes('attentionItems') && files.attention.includes('healthForProject')],
  ['Attention-engine wordt in shell geladen', files.index.includes('js/core/attention.js')],
  ['Dashboard heeft Vandaag aandacht nodig cockpit', files.dashboard.includes('Vandaag aandacht nodig') && files.dashboard.includes('Projectgezondheid')],
  ['Dashboard toont rode/oranje/capaciteit/projectplanning counters', files.dashboard.includes('redProjects') && files.dashboard.includes('capacityShortages') && files.dashboard.includes('noPlanning')],
  ['Projectoverzicht toont gezondheid en waarom aandacht', files.projectOverview.includes('Gezondheid') && files.projectOverview.includes('Waarom aandacht?') && files.projectOverview.includes('openWhy')],
  ['Projectoverzicht gebruikt centrale healthForProject', files.projectOverview.includes('CWS.attention.healthForProject')],
  ['Capaciteit heeft heatmap', files.capacity.includes('Capaciteitsheatmap') && files.capacity.includes('renderHeatmap') && files.capacity.includes('hm-red')],
  ['Heatmap klikt door naar capaciteit dag-popup', files.capacity.includes('data-hm-dept') && files.capacity.includes('openCapacityPopup(td.dataset.hmDept)')],
  ['Rapporten bevat aandachtspuntenrapport', files.reports.includes('Aandachtspuntenrapport') && files.reports.includes('t.id==="attention"')],
  ['Preflight bevat functionele aandachtspuntenchecks', files.preflight.includes('Attention-engine actief') && files.preflight.includes('Capaciteitstekorten gecontroleerd') && files.preflight.includes('Projecten zonder planning gecontroleerd')],
  ['Engine signaleert projecten zonder planning', files.attention.includes('project_no_gantt')],
  ['Engine signaleert verlopen en geblokkeerde taken', files.attention.includes('task_overdue') && files.attention.includes('task_blocked')],
  ['Engine signaleert capaciteitstekorten', files.attention.includes('capacity_shortage')],
  ['Engine signaleert ontbrekende afdeling/resource', files.attention.includes('task_no_dept') && files.attention.includes('task_no_resource')],
  ['Engine exposeert doorklik naar modules', files.attention.includes('openModule')],
  ['V31 volledig zonder prototype-placeholders', !Object.values(files).join('\n').match(/TODO V31|NIET_GEBOUWD|STUB_ONLY/i)],
];

let ok = true;
for (const [name, pass] of checks) {
  if (pass) console.log(`OK - ${name}`);
  else { ok = false; console.error(`FAIL - ${name}`); }
}
if (!ok) process.exit(1);
console.log(`\nAlle ${checks.length} V31 statische preflight-controles geslaagd.`);
