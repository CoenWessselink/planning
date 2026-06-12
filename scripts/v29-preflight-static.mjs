import fs from 'node:fs';
const checks=[];
const read=p=>fs.readFileSync(p,'utf8');
const has=(file,needle,label)=>{ const ok=read(file).includes(needle); checks.push({ok,label}); };
const exists=(file,label)=>checks.push({ok:fs.existsSync(file),label});
exists('layers/laag6_projectoverzicht.html','Projectoverzicht aanwezig');
exists('layers/laag4_gantt.html','Gantt aanwezig');
exists('js/core/store.js','Store aanwezig');
exists('layers/laag13_preflight.html','Preflight aanwezig');
has('layers/laag6_projectoverzicht.html','Voortgang Gantt-taken bijwerken','Projectoverzicht heeft Gantt-voortgangspopup');
has('layers/laag6_projectoverzicht.html','projectoverview_gantt_task_progress','Popup schrijft terug naar state/D1-flow');
has('layers/laag6_projectoverzicht.html','progressSummary','Projectpercentage wordt uit Gantt-taken berekend');
has('layers/laag6_projectoverzicht.html','taskProgressHistory','Voortgangshistorie wordt opgeslagen');
has('layers/laag6_projectoverzicht.html','Terugkoppeling','Terugkoppeling zichtbaar in Projectoverzicht-popup');
has('layers/laag4_gantt.html','bar-progress','Gantt toont lichte voortgangs-overlay');
has('layers/laag4_gantt.html','bar-feedback-dot','Gantt toont terugkoppelingsindicator op balk');
has('layers/laag4_gantt.html','taskStatus','Gantt-tabel heeft statuskolom');
has('layers/laag4_gantt.html','feedback','Gantt-tabel/popup heeft terugkoppelingveld');
has('layers/laag4_gantt.html','progressUpdatedAt','Gantt taakvoortgang krijgt update-timestamp');
has('js/core/store.js','progressByProject','Store normaliseert projectvoortgang');
has('js/core/store.js','taskProgressHistory','Store normaliseert taakvoortgangshistorie');
has('layers/laag13_preflight.html','Preflight V29','Preflight is bijgewerkt naar V29');
let failed=0;
for(const c of checks){ console.log(`${c.ok?'OK':'FOUT'} - ${c.label}`); if(!c.ok) failed++; }
if(failed){ console.error(`\n${failed} V29 preflight-controles gefaald.`); process.exit(1); }
console.log(`\nAlle ${checks.length} V29 statische preflight-controles geslaagd.`);
