import fs from 'node:fs';

const middleware = fs.readFileSync('functions/api/_middleware.js', 'utf8');
const capacity = fs.readFileSync('layers/laag5_capaciteit.html', 'utf8');
const store = fs.readFileSync('js/core/store.js', 'utf8');

const checks = [
  ['marker', middleware.includes('v104-capacity-revision-isolation')],
  ['revision snapshot capacity stripper', middleware.includes('stripDerivedCapacityFromRevisionSnapshot')],
  ['revision sync sanitizes capacity', middleware.includes('syncRevisionsFromState') && middleware.includes('sanitizeRevisionObject')],
  ['revision merge sanitizes capacity', middleware.includes('mergeRevisionsIntoRaw') && middleware.includes('capacityExcludedFromRevision')],
  ['checkpoint strips revision capacity', middleware.includes('writeCheckpoint') && middleware.includes('sanitizeStateRevisionSnapshotsRaw')],
  ['journal strips revision capacity', middleware.includes('writeJournal') && middleware.includes('sanitizeStateRevisionSnapshotsRaw')],
  ['revisions API returns sanitized snapshots', middleware.includes('handleRevisions') && middleware.includes('stripDerivedCapacityFromRevisionSnapshot')],
  ['capacity uses only live gantt sources', capacity.includes('state().gantt?.sourcesByDay') && capacity.includes('state().gantt?.hoursByDay')],
  ['store rebuilds live gantt capacity from byProject', store.includes('getGanttTaskGroups') && store.includes('rebuildGanttHoursByDay')]
];

let failed = false;
for (const [label, ok] of checks) {
  if (!ok) {
    failed = true;
    console.error(`❌ ${label}`);
  } else {
    console.log(`✅ ${label}`);
  }
}

if (middleware.includes('snapshot:revisionSnapshot') || middleware.includes('snapshot.capacity')) {
  failed = true;
  console.error('❌ Middleware mag geen capacity snapshot als revisiebron terugschrijven.');
}

if (failed) {
  console.error('\nV104 preflight: NIET akkoord. Capaciteit kan nog door revisie-snapshots vervuild worden.');
  process.exit(1);
}

console.log('\nV104 preflight: akkoord. Revisies zijn geïsoleerd van live capaciteit.');
