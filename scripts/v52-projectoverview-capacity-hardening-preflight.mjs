import fs from 'node:fs';
const po = fs.readFileSync(new URL('../layers/laag6_projectoverzicht.html', import.meta.url), 'utf8');
const cap = fs.readFileSync(new URL('../layers/laag5_capaciteit.html', import.meta.url), 'utf8');
const checks = [
  ['project scroll proxy', po.includes('projectScrollProxy') && po.includes('const syncProjectScrollDock = initScrollDock();')],
  ['project A0 print', po.includes('paper:"A0 landscape"')],
  ['project task state classes', po.includes('taskStatusInfo') && po.includes('task-done') && po.includes('task-late') && po.includes('Te laat')],
  ['capacity scroll proxy', cap.includes('matrixScrollProxy') && cap.includes('function initMatrixScrollDock')],
  ['capacity color print', cap.includes('@page{size:A0 landscape') && cap.includes('print-color-adjust:exact')],
];
const failed = checks.filter(([,ok]) => !ok);
checks.forEach(([label, ok]) => console.log(`${ok ? 'OK' : 'FAIL'} - ${label}`));
if (failed.length) process.exit(1);
console.log('V52 preflight geslaagd.');
