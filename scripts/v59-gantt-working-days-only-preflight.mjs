import fs from 'node:fs';
function read(path){ return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'); }
function check(label, pass){ console.log(`${pass ? 'OK' : 'FAIL'} - ${label}`); if(!pass) process.exitCode = 1; }
const store = read('js/core/store.js');
const gantt = read('layers/laag4_gantt.html');
const settings = read('layers/laag10_instellingen.html');
const capacity = read('layers/laag5_capaciteit.html');
const pkg = read('package.json');
check('V59 store forceert weekend als niet-werkbaar', store.includes('if(wd === 6 || wd === 7) return true') && store.includes('cal.workweek = { 1:true,2:true,3:true,4:true,5:true,6:false,7:false }'));
check('V59 store normaliseert Gantt schedules naar werkbare dagen', store.includes('normalizeGanttScheduleRange') && store.includes('normalizeGanttModelSchedules') && store.includes('addGanttWorkdays'));
check('V59 saveProjectGantt corrigeert voor opslaan/capaciteit', store.includes('normalizeGanttModelSchedules(draft, deepClone(model))') && store.includes('v59-working-days-only'));
check('V59 Gantt heeft centrale werkdaghelpers', gantt.includes('function isWeekendIso') && gantt.includes('function isWorkingIso') && gantt.includes('function addWorkingDays') && gantt.includes('function normalizeSchedule'));
check('V59 Gantt corrigeert bestaande planning bij render', gantt.includes('normalizeModelSchedulesForWorkdays') && gantt.includes('taakdatum(s) naar werkbare dagen gecorrigeerd'));
check('V59 Gantt genereert en herberekent met werkbare dagen', gantt.includes('normalizeSchedule(st, explicitStart || cursor') && gantt.includes('Planning herberekend op werkbare dagen') && gantt.includes('nextWorkingIso(st,addDays(pred.end'));
check('V59 Gantt balken zijn werkdagsegmenten', gantt.includes('function workSegments') && gantt.includes('bar-segment') && gantt.includes('segment-first') && gantt.includes('segment-last'));
check('V59 drag/resize snapt naar werkbare dagen', gantt.includes('shiftScheduleByWorkdays') && gantt.includes('Balk bijgewerkt op werkbare dagen'));
check('V59 popup/duur meldt werkdagenregel', gantt.includes('Duur telt alleen werkbare dagen') && gantt.includes('Weekend/niet-werkbaar wordt automatisch overgeslagen'));
check('V59 instellingen default Ma-Vr werkbaar', settings.includes('6:false') && settings.includes('7:false'));
check('V59 capaciteit blijft vanuit Gantt sources/hours en dus werkdagverdeling rekenen', capacity.includes('state().gantt?.sourcesByDay') && capacity.includes('state().gantt?.hoursByDay'));
check('V59 package preflight geregistreerd', pkg.includes('preflight:v59'));
if(process.exitCode) process.exit(process.exitCode);
