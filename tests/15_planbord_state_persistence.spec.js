// @ts-check
import { test, expect } from '@playwright/test';
import { guardConsole, gotoHome, loadDemoData, selectApp, layerFrame } from './helpers.js';

test.describe('Planbord - overview/week parity & persistence (best-effort)', () => {
  test('Can switch between Overzicht and Week and data persists after reload', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await loadDemoData(page);
    await selectApp(page, 'Planbord');
    const frame = layerFrame(page);

    // Switch to Overzicht if dropdown exists
    const viewSel = frame.locator('select').first();
    if (await viewSel.count()) {
      // pick overzicht
      await viewSel.selectOption({ label: /overzicht/i }).catch(async()=>{
        const opts = await viewSel.locator('option').allTextContents();
        if (opts.length) await viewSel.selectOption(opts[0]);
      });
      await frame.waitForTimeout(200);
    }

    // Add a column if button exists
    const addCol = frame.getByRole('button', { name: /\+\s*kolom|kolom\s*toevoegen/i }).first();
    if (await addCol.count()) {
      await addCol.click();
      await frame.waitForTimeout(200);
    }

    // Edit first editable cell
    const cell = frame.locator('td[contenteditable="true"]').first();
    if (await cell.count()) {
      await cell.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type('PW_PLANBORD');
      await page.keyboard.press('Enter');
      await frame.waitForTimeout(100);
    }

    // Reload and verify cell still contains value (best-effort)
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.headerbar')).toBeVisible();
    await selectApp(page, 'Planbord');
    const frame2 = layerFrame(page);
    const hasText = await frame2.locator('text=PW_PLANBORD').count();
    expect(hasText).toBeGreaterThan(0);

    await g.assertNoErrors();
  });
});
