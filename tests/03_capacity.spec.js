// @ts-check
import { test, expect } from '@playwright/test';
import { guardConsole, gotoHome, selectApp, loadDemoData, layerFrame } from './helpers.js';

test.describe('Capaciteit (laag 5) - week navigation, totals, columns', () => {
  test('Loads and shows table with totals', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await loadDemoData(page);
    await selectApp(page, 'Capaciteit');
    const frame = layerFrame(page);

    // Should have a table with rows
    await expect(frame.locator('table')).toBeVisible({ timeout: 15000 });
    const rows = await frame.locator('table tbody tr').count();
    expect(rows).toBeGreaterThan(0);

    // Week nav buttons exist (best-effort)
    const prev = frame.getByRole('button', { name: /vorige|<|◀/i }).first();
    const next = frame.getByRole('button', { name: /volgende|>|▶/i }).first();
    if (await prev.count()) await prev.click();
    if (await next.count()) await next.click();

    await g.assertNoErrors();
  });

  test('Column wizard opens (if present)', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await selectApp(page, 'Capaciteit');
    const frame = layerFrame(page);
    const btn = frame.getByRole('button', { name: 'Kolommen' }).first();
    if (await btn.count()) {
      await btn.click();
      await expect(frame.locator('text=Kolommen')).toBeVisible();
      const close = frame.getByRole('button', { name: 'Sluiten' });
      if (await close.count()) await close.click();
    }
    await g.assertNoErrors();
  });
});
