import fs from 'node:fs';
function read(path){ return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'); }
function check(label, pass){ console.log(`${pass ? 'OK' : 'FAIL'} - ${label}`); if(!pass) process.exitCode = 1; }
const store = read('js/core/store.js');
const gantt = read('layers/laag4_gantt.html');
const capacity = read('layers/laag5_capaciteit.html');
const pkg = read('package.json');
check('V58 store bevat harde urenbron helpers', store.includes('V58 — Gantt urenbron hard gemaakt') && store.includes('ganttTaskHoursMode') && store.includes('ganttTaskManualHours'));
check('V58 standaard Gantt taakurenbron is auto/projecturen', store.includes('row.hoursMode = mode') && store.includes('row.hoursSource = mode === "manual" ? "manual" : "project-dept-hours"') && store.includes('row.hours = 0'));
check('V58 rebuild gebruikt alleen handmatige override expliciet', store.includes('ganttTaskHoursMode(row) === "manual" ? ganttTaskManualHours(row) : 0') && store.includes('allocationMode = "manual-override"') && store.includes('allocationMode = "project-dept-hours-auto"'));
check('V58 capacity source bevat urenbron metadata', store.includes('projectDeptHoursTotal') && store.includes('manualOverrideHours') && store.includes('hoursSource: task.hoursMode === "manual" ? "manual-override" : "project-dept-hours"'));
check('V58 Gantt tabel heeft Auto/Handmatig urenbronkeuze', gantt.includes('data-v58-hours-source="1"') && gantt.includes('hours-source-select') && gantt.includes('data-k="hoursMode"'));
check('V58 Gantt popup legt SSOT uit', gantt.includes('Projecturen zijn SSOT') && gantt.includes('Automatisch uit projecturen per afdeling') && gantt.includes('Handmatige override'));
check('V58 Gantt save zet auto terug naar nul en manual naar override', gantt.includes('row.hoursSource=hMode==="manual" ? "manual" : "project-dept-hours"') && gantt.includes('row.manualHours=0') && gantt.includes('row.hours=0'));
check('V58 package preflight geregistreerd', pkg.includes('preflight:v58'));
check('V58 capaciteit blijft uit Gantt hoursByDay/sourcesByDay lezen', capacity.includes('state().gantt?.hoursByDay') && capacity.includes('state().gantt?.sourcesByDay'));
if(process.exitCode) process.exit(process.exitCode);
