// @ts-check
import { test, expect } from '@playwright/test';
import { gotoHome, guardConsole, selectAppAndExpect, layerFrame } from './helpers.js';

test('Instellingen: rechtenmatrix zichtbaar en aanpasbaar (best-effort)', async ({ page }) => {
  const g = guardConsole(page);
  await gotoHome(page);
  await selectAppAndExpect(page, 'Instellingen');

  const f = layerFrame(page);

  // Try open "Rechten" / "Toegangsbeheer" tile
  const tile = f.locator('text=/Rechten|Toegangsbeheer/i').first();
  if (await tile.count()) {
    await tile.click();
    await page.waitForTimeout(200);
  }

  // Expect a table-like matrix or modal
  const matrix = f.locator('table, [data-testid="rights-matrix"], .matrix').first();
  await expect(matrix).toBeVisible();

  // Toggle first checkbox if available
  const cb = f.locator('input[type="checkbox"]').first();
  if (await cb.count()) {
    const before = await cb.isChecked();
    await cb.click();
    await page.waitForTimeout(100);
    expect(await cb.isChecked()).toBe(!before);
  }

  await g.assertNoErrors();
});
