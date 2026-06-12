import fs from 'node:fs';

const projects = fs.readFileSync(new URL('../layers/laag3_projecten.html', import.meta.url), 'utf8');
const pkg = fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8');

const checks = [
  ['V55 marker aanwezig', projects.includes('V55 — Projecten: alles op één pagina met infinite scroll')],
  ['Projecten-paneel heeft infinite-scroll mode', projects.includes('data-projects-mode="infinite-scroll"') && projects.includes('projects-infinite-panel')],
  ['Paginering is visueel uitgeschakeld', projects.includes('.projects-infinite-panel .pagination') && projects.includes('display:none!important')],
  ['Render gebruikt alle gefilterde projecten zonder slice', projects.includes('const ids = idsAll;') && projects.includes('tbody.dataset.mode = PROJECTS_INFINITE_SCROLL ? "infinite-scroll" : "paged"')],
  ['Footertekst toont alles op één pagina', projects.includes('Alles op 1 pagina • Infinite scroll')],
  ['Vorige/volgende knoppen zijn inert gemaakt', projects.includes('prevBtn.disabled = true') && projects.includes('nextBtn.disabled = true') && projects.includes('aria-hidden')],
  ['Tabel heeft eigen verticale scrollruimte', projects.includes('max-height:calc(100vh - 260px)') && projects.includes('overscroll-behavior:contain')],
  ['Preflight script geregistreerd', pkg.includes('preflight:v55')]
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'OK' : 'FAIL'} - ${name}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
