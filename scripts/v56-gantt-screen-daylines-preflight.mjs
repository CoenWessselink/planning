import fs from 'node:fs';

const gantt = fs.readFileSync(new URL('../layers/laag4_gantt.html', import.meta.url), 'utf8');
const pkg = fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8');

const checks = [
  ['V56 marker aanwezig', gantt.includes('V56 — Gantt schermdiagram: dunne daglijnen altijd zichtbaar')],
  ['Dagdelen worden ook op scherm gerenderd', gantt.includes('const dayGridLineHtml=days.map') && !gantt.includes('const dayGridLineHtml=UI.printMode?')],
  ['Screen day-grid-line zichtbaar', gantt.includes('.day-grid-line{') && gantt.includes('display:block!important') && gantt.includes('--v56-screen-day-line-width:.5px')],
  ['Daglijnen boven nonwork-shade maar onder taakbalken', gantt.includes('z-index:2!important') && gantt.includes('.nonwork-shade') && gantt.includes('z-index:1!important') && gantt.includes('.lane .bar{z-index:8!important;}')],
  ['Niet-werkbare dagen blijven herkenbaar', gantt.includes('--v56-screen-nonwork-fill:#e6eaef') && gantt.includes('opacity:.82!important')],
  ['Printgedrag blijft geborgd', gantt.includes('.printing .day-grid-line') && gantt.includes('var(--v50-day-line-width-print')],
  ['Preflight script geregistreerd', pkg.includes('preflight:v56')]
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'OK' : 'FAIL'} - ${name}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
