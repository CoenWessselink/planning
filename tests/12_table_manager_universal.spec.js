// @ts-check
import { test, expect } from '@playwright/test';
import { gotoHome, guardConsole, selectAppAndExpect, layerFrame } from './helpers.js';

test('Universele Table Manager: CRUD + zoeken + export (best-effort)', async ({ page }) => {
  const g = guardConsole(page);
  await gotoHome(page);
  await selectAppAndExpect(page, 'Instellingen');

  const f = layerFrame(page);
  const target = f.locator('text=/Opdrachtgevers|Contactpersonen|Projecteigenschappen/i').first();
  if (await target.count()) {
    await target.click();
    await page.waitForTimeout(200);
  }

  // Add row
  const addBtn = f.getByRole('button', { name: /nieuw|toevoegen|add/i }).first();
  if (await addBtn.count()) {
    await addBtn.click();
    await page.waitForTimeout(200);
  }

  // Edit first editable cell if present
  const editable = f.locator('[contenteditable="true"]').first();
  if (await editable.count()) {
    await editable.click();
    await editable.fill?.('Test');
    // Some contenteditable elements do not support fill
    await page.keyboard.type('Test');
  }

  // Search if field present
  const search = f.locator('input[type="search"], input[placeholder*="Zoek"], input[placeholder*="search"]').first();
  if (await search.count()) {
    await search.fill('Test');
    await page.waitForTimeout(150);
  }

  // Export
  const exportBtn = f.getByRole('button', { name: /export/i }).first();
  if (await exportBtn.count()) {
    const [dl] = await Promise.all([
      page.waitForEvent('download').catch(() => null),
      exportBtn.click()
    ]);
    if (dl) await dl.path().catch(() => {});
  }

  await g.assertNoErrors();
});
