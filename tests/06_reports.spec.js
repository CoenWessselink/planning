// @ts-check
import { test, expect } from '@playwright/test';
import { guardConsole, gotoHome, selectApp, loadDemoData, layerFrame } from './helpers.js';

test.describe('Rapporten - templates, filters, export/print buttons', () => {
  test('Templates render non-empty preview', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await loadDemoData(page);
    await selectApp(page, 'Rapporten');
    const frame = layerFrame(page);

    await expect(frame.locator('table')).toBeVisible({ timeout: 15000 });
    const rows = await frame.locator('table tbody tr').count();
    expect(rows).toBeGreaterThan(0);

    // switch template if selector exists
    const sel = frame.locator('select').first();
    if (await sel.count()) {
      const opts = await sel.locator('option').allTextContents();
      if (opts.length > 1) {
        await sel.selectOption({ label: opts[1] });
      }
    }

    await g.assertNoErrors();
  });

  test('Toolbar buttons exist (best-effort)', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await selectApp(page, 'Rapporten');
    const frame = layerFrame(page);
    const btns = ['Filters','Kolommen','Export CSV','Print A3'];
    for (const b of btns) {
      const btn = frame.getByRole('button', { name: b }).first();
      if (await btn.count()) await expect(btn).toBeVisible();
    }
    await g.assertNoErrors();
  });
});