import fs from 'node:fs';
const cap = fs.readFileSync(new URL('../layers/laag5_capaciteit.html', import.meta.url), 'utf8');
const pkg = fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const checks = [
  ['V54 marker aanwezig', cap.includes('V54 — Capaciteit horizontale scrollbar altijd zichtbaar/in beeld')],
  ['cap-shell blokkeert sticky scrollbar niet', cap.includes('overflow:visible')],
  ['matrix blijft breder dan viewport', cap.includes('width:max(2200px,calc(100vw + 420px))') && cap.includes('min-width:2200px')],
  ['matrixwrap laat ruimte voor zichtbare dock', cap.includes('max-height:calc(100vh - 470px)')],
  ['proxy-dock visueel gelijkwaardig aan Projectoverzicht', cap.includes('id="matrixScrollProxy"') && cap.includes('box-shadow:0 -8px 18px') && cap.includes('proxy.dataset.visible = "true"')],
  ['preflight script geregistreerd', pkg.includes('preflight:v54')]
];
let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'OK' : 'FAIL'} - ${name}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
