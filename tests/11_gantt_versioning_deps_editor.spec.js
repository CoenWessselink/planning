// @ts-check
import { test, expect } from '@playwright/test';
import { gotoHome, guardConsole, selectAppAndExpect, layerFrame } from './helpers.js';

test('Gantt: versioning + deps editor basics (best-effort)', async ({ page }) => {
  const g = guardConsole(page);
  await gotoHome(page);
  await selectAppAndExpect(page, 'Gantt');

  const f = layerFrame(page);
  await expect(f.locator('[data-testid="gantt-root"], .gantt-root, text=/Gantt/i').first()).toBeVisible();

  // Toggle baseline/deps/critical if buttons exist
  for (const name of ['Baseline', 'Afhankelijkheden', 'Kritiek pad']) {
    const btn = f.getByRole('button', { name });
    if (await btn.count()) {
      await btn.first().click();
      await page.waitForTimeout(150);
    }
  }

  // Version save/load if present
  const saveVer = f.getByRole('button', { name: /versie|version/i });
  if (await saveVer.count()) {
    await saveVer.first().click();
    await page.waitForTimeout(200);
  }

  // Deps editor if present
  const depsEdit = f.getByRole('button', { name: /deps|afhankelijk/i });
  if (await depsEdit.count()) {
    await depsEdit.first().click();
    await page.waitForTimeout(200);
    // Close modal if there is a close button
    const close = f.getByRole('button', { name: /sluiten|close|✕/i }).first();
    if (await close.count()) await close.click();
  }

  await g.assertNoErrors();
});
