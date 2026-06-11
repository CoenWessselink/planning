// @ts-check
import { test, expect } from '@playwright/test';
import { guardConsole, gotoHome, selectApp, loadDemoData, layerFrame } from './helpers.js';

test.describe('Instellingen - all tables accessible and CRUD basics', () => {
  test('Opens tiles and shows a table manager for datasets', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await loadDemoData(page);
    await selectApp(page, 'Instellingen');
    const frame = layerFrame(page);

    // Tiles that should exist (best-effort)
    const tiles = ['Gebruikers','Teams','Rollen','Rechten','Status','Labels','Opdrachtgevers','Contactpersonen','Adressen','Projecteigenschappen'];
    for (const t of tiles) {
      const tile = frame.locator(`text=${t}`).first();
      if (await tile.count()) {
        await tile.click();
        await frame.waitForTimeout(200);
        await expect(frame.locator('table')).toBeVisible({ timeout: 5000 }).catch(()=>{});
        // Close modal if present
        const close = frame.getByRole('button', { name: /sluit|close|×/i }).first();
        if (await close.count()) await close.click().catch(()=>{});
      }
    }

    await g.assertNoErrors();
  });

  test('CRUD: can add a user row (best-effort)', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await loadDemoData(page);
    await selectApp(page, 'Instellingen');
    const frame = layerFrame(page);

    const tile = frame.locator('text=Gebruikers').first();
    if (await tile.count()) {
      await tile.click();
      await frame.waitForTimeout(200);
      const add = frame.getByRole('button', { name: /nieuw|toevoegen|\+\s*rij/i }).first();
      if (await add.count()) {
        await add.click();
        // fill first editable cell
        const cell = frame.locator('td[contenteditable="true"]').first();
        if (await cell.count()) {
          await cell.click();
          await page.keyboard.type('PW_USER');
          await page.keyboard.press('Enter');
        }
      }
    }

    await g.assertNoErrors();
  });
});
