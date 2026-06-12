import fs from 'node:fs';

const checks=[];
const read=p=>fs.readFileSync(p,'utf8');
function ok(name, pass, detail='') { checks.push({name, pass, detail}); }

const index=read('index.html');
const theme=read('css/theme.css');
const router=read('js/core/router.js');
const responsive=read('js/core/responsive.js');
const gantt=read('layers/laag4_gantt.html');
const cap=read('layers/laag5_capaciteit.html');
const dash=read('layers/laag9_dashboard.html');

ok('responsive.js gekoppeld in index', index.includes('js/core/responsive.js'));
ok('responsive bind start mee bij boot', index.includes('CWS_Responsive.bind()'));
ok('router expose active app', router.includes('getActiveApp') && router.includes('cws:appchange'));
ok('mobiele bottom nav aanwezig', responsive.includes('mobile-bottom-nav') && responsive.includes('navItems'));
ok('iframe enhancement aanwezig', responsive.includes('enhanceFrame') && responsive.includes('labelTables'));
ok('touch/card table labels aanwezig', responsive.includes('data-label') && theme.includes('mobile-card-table'));
ok('tablet breakpoint aanwezig', theme.includes('@media (max-width:1180px)'));
ok('mobiel breakpoint aanwezig', theme.includes('@media (max-width:760px)'));
ok('print niet verstoord', theme.includes('@media print') && theme.includes('mobile-bottom-nav'));
ok('Gantt responsive hardening aanwezig', gantt.includes('V32 responsive module hardening') && gantt.includes('cws-compact-mode'));
ok('Gantt mobiel behoudt tabel + diagram scroll', gantt.includes('.table-pane') && gantt.includes('.chart-pane') && gantt.includes('min-width:980px'));
ok('Capaciteit responsive hardening aanwezig', cap.includes('V32 responsive module hardening') && cap.includes('matrix-wrap'));
ok('Capaciteit mobiel behoudt matrix/heatmap', cap.includes('heatmap-wrap') && cap.includes('max-height:62dvh'));
ok('Dashboard mobiele kaartweergave aanwezig', dash.includes('health-table thead{display:none}') && dash.includes('grid-template-columns:1fr'));
ok('Touch targets verhoogd', theme.includes('--touch:44px') && theme.includes('min-height:var(--touch)'));
ok('Apps menu responsive grid behouden', theme.includes('.apps-grid{grid-template-columns:1fr 1fr}') || theme.includes('apps-grid{grid-template-columns:1fr 1fr'));

const failed=checks.filter(c=>!c.pass);
console.log('V32 responsive preflight');
checks.forEach(c=>console.log(`${c.pass?'OK':'FAIL'} - ${c.name}${c.detail?' - '+c.detail:''}`));
if(failed.length){
  console.error(`\n${failed.length}/${checks.length} controles gefaald.`);
  process.exit(1);
}
console.log(`\n${checks.length}/${checks.length} controles OK.`);
