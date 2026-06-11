// @ts-check
import { test, expect } from '@playwright/test';
import { guardConsole, gotoHome, loadDemoData, selectApp, layerFrame } from './helpers.js';

async function tryDownload(page, clickFn, timeout=15000){
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout }).catch(()=>null),
    clickFn(),
  ]);
  return download;
}

test.describe('Exports & downloads (best-effort)', () => {
  test('Projecten export CSV triggers a download if available', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await loadDemoData(page);
    await selectApp(page, 'Projecten');
    const frame = layerFrame(page);

    const btn = frame.getByRole('button', { name: /export\s*csv/i }).first();
    if (await btn.count()) {
      const dl = await tryDownload(page, async()=>{ await btn.click(); }, 20000);
      expect(dl, 'Expected a download from Export CSV').not.toBeNull();
      if (dl) {
        const fn = dl.suggestedFilename();
        expect(fn.toLowerCase()).toContain('csv');
      }
    }
    await g.assertNoErrors();
  });

  test('Capaciteit export CSV triggers a download if available', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await loadDemoData(page);
    await selectApp(page, 'Capaciteit');
    const frame = layerFrame(page);

    const btn = frame.getByRole('button', { name: /export\s*csv/i }).first();
    if (await btn.count()) {
      const dl = await tryDownload(page, async()=>{ await btn.click(); }, 20000);
      expect(dl, 'Expected a download from Export CSV').not.toBeNull();
    }
    await g.assertNoErrors();
  });

  test('Gantt export PNG triggers a download if available', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await loadDemoData(page);
    await selectApp(page, 'Gantt');
    const frame = layerFrame(page);

    const btn = frame.getByRole('button', { name: /export\s*png|export\s*afbeelding/i }).first();
    if (await btn.count()) {
      const dl = await tryDownload(page, async()=>{ await btn.click(); }, 20000);
      expect(dl, 'Expected a download from Export PNG').not.toBeNull();
    }
    await g.assertNoErrors();
  });
});
