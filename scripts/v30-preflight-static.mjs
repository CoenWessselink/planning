import fs from 'fs';

const files = {
  gantt: fs.readFileSync('layers/laag4_gantt.html','utf8'),
  cap: fs.readFileSync('layers/laag5_capaciteit.html','utf8'),
  store: fs.readFileSync('js/core/store.js','utf8'),
};

const checks = [
  ['Gantt contextmenu container aanwezig', files.gantt.includes('ganttContextMenu') && files.gantt.includes('gantt-context-menu')],
  ['Gantt rechtermuisknop op taakrij aanwezig', files.gantt.includes('tr.addEventListener("contextmenu"')],
  ['Gantt rechtermuisknop op taakbalk aanwezig', files.gantt.includes('bar.addEventListener("contextmenu"')],
  ['Gantt rechtermuisknop op lege ruimte aanwezig', files.gantt.includes('#boardWrap') && files.gantt.includes('showGanttContextMenu(e,null')],
  ['Contextmenu bevat taak/fase acties', files.gantt.includes('Taak toevoegen onder deze regel') && files.gantt.includes('Fasekleur toepassen op onderliggende taken')],
  ['Contextmenu kan taken toevoegen/dupliceren/verwijderen/gereed melden', files.gantt.includes('insertTaskAfter') && files.gantt.includes('duplicateRow') && files.gantt.includes('deleteRow') && files.gantt.includes('setTaskProgressFromMenu')],
  ['Capaciteit heeft beschikbare/benodigde/resterende afdelingsrijen', files.cap.includes('Beschikbare capaciteit') && files.cap.includes('Benodigde capaciteit') && files.cap.includes('Resterende capaciteit')],
  ['Capaciteit afdelingsrij opent dag-popup via dubbelklik', files.cap.includes('data-capedit="1"') && files.cap.includes('ondblclick') && files.cap.includes('openCapacityPopup')],
  ['Capaciteit dag-popup toont standaard/beschikbaar/benodigd/resterend', files.cap.includes('<th>Standaard</th>') && files.cap.includes('<th>Beschikbaar</th>') && files.cap.includes('<th>Benodigd</th>') && files.cap.includes('<th>Resterend</th>')],
  ['Beschikbare capaciteit is handmatig wijzigbaar', files.cap.includes('data-cap-hours') && files.cap.includes('cap-input')],
  ['Capaciteit bewaart overrides in state/D1-flow', files.cap.includes('s.capacity.availabilityOverrides') && files.store.includes('availabilityOverrides')],
  ['Benodigde capaciteit blijft Gantt SSOT', files.cap.includes('plannedByDeptDay') && files.cap.includes('state().gantt?.sourcesByDay') && !files.cap.includes('s.gantt.hoursByDay=')],
  ['Resterende capaciteit rekent beschikbaar - benodigd', files.cap.includes('available-needed') || files.cap.includes('availableByDeptDay(dept,d.iso)-plannedByDeptDay')],
  ['Capaciteit overrides worden gemarkeerd', files.cap.includes('override') && files.cap.includes('weekHasOverrides')],
  ['Store normaliseert capacity availabilityOverrides', files.store.includes('st.capacity.availabilityOverrides')],
  ['Store exposeert capacity override helpers', files.store.includes('setAvailabilityOverride') && files.store.includes('removeAvailabilityOverride')],
];

let ok = true;
for (const [name, pass] of checks) {
  if (pass) console.log(`OK - ${name}`);
  else { ok = false; console.error(`FAIL - ${name}`); }
}

if (!ok) process.exit(1);
console.log(`\nAlle ${checks.length} V30 statische preflight-controles geslaagd.`);
