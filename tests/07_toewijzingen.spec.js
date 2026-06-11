// @ts-check
import { test, expect } from '@playwright/test';
import { guardConsole, gotoHome, selectApp, loadDemoData, layerFrame } from './helpers.js';

test.describe('Toewijzingen - scenario, week, columns', () => {
  test('Loads and shows table, scenario switch does not error', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await loadDemoData(page);
    await selectApp(page, 'Toewijzingen');
    const frame = layerFrame(page);

    await expect(frame.locator('table')).toBeVisible({ timeout: 15000 });

    // scenario selector best-effort
    const sel = frame.locator('select').first();
    if (await sel.count()) {
      const opts = await sel.locator('option').allTextContents();
      if (opts.length > 1) {
        await sel.selectOption({ label: opts[1] });
        await frame.waitForTimeout(150);
      }
    }

    await g.assertNoErrors();
  });

  test('Column wizard opens (if present)', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await selectApp(page, 'Toewijzingen');
    const frame = layerFrame(page);
    const btn = frame.getByRole('button', { name: 'Kolommen' }).first();
    if (await btn.count()) {
      await btn.click();
      await expect(page.locator('text=Kolommen')).toBeVisible();
      const close = page.getByRole('button', { name: 'Sluiten' });
      if (await close.count()) await close.click();
    }
    await g.assertNoErrors();
  });
});
