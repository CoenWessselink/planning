import { readFileSync } from 'node:fs';

const html = readFileSync('layers/laag4_gantt.html','utf8');
const pkg = JSON.parse(readFileSync('package.json','utf8'));

function assert(cond,msg){ if(!cond){ throw new Error(`[V84 preflight] ${msg}`); } }

assert(pkg.scripts?.['preflight:v84'] === 'node scripts/v84-gantt-screen-bar-header-isolation-preflight.mjs','package.json mist preflight:v84');
assert(html.includes('V84 — screen Gantt header/calendar isolation fix'),'V84 CSS-marker ontbreekt');
assert(html.includes('body:not(.printing) #timeline') && html.includes('z-index:80'),'screen timeline/header krijgt geen hoge z-index');
assert(html.includes('body:not(.printing) .lane') && html.includes('overflow:hidden!important'),'screen lanes knippen overflow niet af');
assert(html.includes('body:not(.printing) .bar,') && html.includes('z-index:6!important'),'screen balken zijn niet onder timeline gehouden');
assert(html.includes('body:not(.printing) .today-line') && html.includes('z-index:85'),'vandaaglijn blijft niet boven kalender/balken');
assert(html.includes('V81 — print label/calendar isolation fix'),'V81 print-isolatie moet behouden blijven');
assert(html.includes('@media print') && html.includes('body.printing .print-calendar'),'printregels moeten behouden blijven');
console.log('[V84 preflight] Gantt screen header/calendar isolation OK');
