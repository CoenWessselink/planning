import fs from 'node:fs';

const fail = (message) => {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
};
const pass = (message) => console.log(`✅ ${message}`);
const mustContain = (file, needle, label) => {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(needle)) fail(`${label}: ontbreekt ${needle}`);
  else pass(label);
};

const middleware = fs.readFileSync('functions/api/_middleware.js', 'utf8');
const store = fs.readFileSync('js/core/store.js', 'utf8');
const gantt = fs.readFileSync('layers/laag4_gantt.html', 'utf8');

mustContain('functions/api/_middleware.js', 'app_state_journal', 'D1 journal-tabel aanwezig');
mustContain('functions/api/_middleware.js', 'app_state_journal_chunks', 'D1 journal-chunks aanwezig');
mustContain('functions/api/_middleware.js', 'shouldUseJournal', 'Journal-recovery beslisfunctie aanwezig');
mustContain('functions/api/_middleware.js', 'jv>av', 'Journal alleen gebruiken als journal nieuwer is dan app_state');
mustContain('functions/api/_middleware.js', 'lj.status!=="checkpointed"', 'Gefaalde checkpoint journal blijft herstelbron');
mustContain('functions/api/_middleware.js', 'chunkManifestWanted', 'Chunked manifest-load blijft actief');
mustContain('functions/api/_middleware.js', 'X-CWS-Chunked-Manifest', 'Chunked manifest header wordt gezet');
mustContain('functions/api/_middleware.js', '/api/state-journal', 'State-journal inspectie endpoint aanwezig');
mustContain('functions/api/_middleware.js', 'state lijkt leeg/demo', 'Lege/demo overwrite guard aanwezig');
mustContain('functions/api/_middleware.js', 'app_revisions', 'Duurzame app_revisions-tabel aanwezig');
mustContain('functions/api/_middleware.js', 'syncRevisionsFromState', 'Revisies worden uit state naar D1 gesynchroniseerd');
mustContain('functions/api/_middleware.js', 'mergeRevisionsIntoRaw', 'Duurzame revisies worden bij state-load terug gemerged');
mustContain('functions/api/_middleware.js', '/api/revisions', 'Revisies inspectie endpoint aanwezig');
mustContain('functions/api/_middleware.js', 'JOURNAL_MAX', 'Journal size-guard aanwezig');
mustContain('functions/api/_middleware.js', 'X-CWS-Journal-Skipped', 'Journal size fallback-header aanwezig');
mustContain('functions/api/_middleware.js', 'stripDerivedCapacityFromRevisionSnapshot', 'Revisie-snapshots strippen afgeleide capaciteit');
mustContain('functions/api/_middleware.js', 'capacityRevisionIsolation', 'Capaciteit/revisie-isolatie marker aanwezig');
mustContain('functions/api/_middleware.js', 'delete clean.capacity', 'Revision snapshot capaciteit wordt verwijderd');
mustContain('functions/api/_middleware.js', 'delete clean.gantt', 'Revision snapshot Gantt-derived data wordt verwijderd');
mustContain('functions/api/_middleware.js', 'sanitizeStateRevisionSnapshotsRaw', 'State-save wordt gesaneerd tegen capaciteit in revisies');

if (/target_version\|\|0\)>=Number\(row\?\.version\|\|0\)/.test(middleware) || middleware.includes('target_version||0)>=Number(row?.version||0)')) {
  fail('Journal wordt nog met >= app_state gekozen; dit kan chunked load omzeilen. Gebruik stricte recovery-regel.');
} else {
  pass('Geen onveilige journal >= app_state recovery gevonden');
}

if (!store.includes('remoteSaveInFlight') || !store.includes('remoteSaveQueued')) fail('Client savequeue ontbreekt of is niet herkenbaar.');
else pass('Client savequeue aanwezig');

if (!store.includes('writeLocalSnapshot(state)') || !store.includes('rememberLastGoodSnapshot')) fail('Lokale snapshot/last-good bescherming ontbreekt.');
else pass('Lokale snapshot en last-good bescherming aanwezig');

if (!store.includes('scheduleRemoteSave') || !store.includes('stateSource !== "remote-d1"')) fail('D1 fallback/boot save guard ontbreekt.');
else pass('D1 save guards aanwezig');

if (!store.includes('rebuildGanttHoursByDay') || !store.includes('sourcesByDay')) fail('Capaciteit uit Gantt hoursByDay/sourcesByDay is niet herkenbaar.');
else pass('Capaciteit blijft gekoppeld aan live Gantt hoursByDay/sourcesByDay');

if (!gantt.includes('Planning opslaan als revisie') || !gantt.includes('revisionSnapshot') || !gantt.includes('saveModel(pid,model,`Revisie')) {
  fail('Revisie flow in Gantt is niet volledig herkenbaar.');
} else {
  pass('Revisie flow in Gantt aanwezig en via saveModel gekoppeld');
}

if (process.exitCode) {
  console.error('\nV102/V104 preflight: NIET akkoord. Los bovenstaande punten op voordat productie als stabiel wordt beschouwd.');
  process.exit(process.exitCode);
}
console.log('\nV102/V104 preflight: akkoord. Durable journal + revisies + capaciteit/revisie-isolatie zijn statisch geborgd.');
