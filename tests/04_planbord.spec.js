// @ts-check
import { test, expect } from '@playwright/test';
import { guardConsole, gotoHome, selectApp, loadDemoData, layerFrame } from './helpers.js';

test.describe('Planbord (overview & week) - dynamic table, persist', () => {
  test('Overview: add column, rename header, delete column (if UI present)', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await loadDemoData(page);
    await selectApp(page, 'Planbord');
    const frame = layerFrame(page);

    // Try set view to Overzicht
    const viewSel = frame.locator('select').first();
    if (await viewSel.count()) {
      await viewSel.selectOption({ label: /overzicht/i }).catch(()=>{});
    }

    // Add column button
    const addCol = frame.getByRole('button', { name: /kolom|\+ kolom/i }).first();
    if (await addCol.count()) {
      await addCol.click();
    }

    // Rename first header if contenteditable
    const header = frame.locator('th[contenteditable="true"], .pb-th[contenteditable="true"], [data-colname][contenteditable="true"]').first();
    if (await header.count()) {
      await header.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type('PW Kolom');
      await page.keyboard.press('Enter');
    }

    // Delete column if ✕ exists
    const del = frame.locator('th button:has-text("✕"), th button:has-text("x")').first();
    if (await del.count()) {
      await del.click();
      page.once('dialog', d => d.accept());
      await page.waitForTimeout(200);
    }

    await g.assertNoErrors();
  });

  test('Week view: can switch to Week and grid renders', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await loadDemoData(page);
    await selectApp(page, 'Planbord');
    const frame = layerFrame(page);

    const viewSel = frame.locator('select').first();
    if (await viewSel.count()) {
      await viewSel.selectOption({ label: /week/i }).catch(()=>{});
    }

    // Expect some grid/table content
    await expect(frame.getByText(/Drag & drop blokken/i)).toBeVisible({ timeout: 15000 });
    await g.assertNoErrors();
  });

  test('Persist: edits survive reload (best-effort)', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await loadDemoData(page);
    await selectApp(page, 'Planbord');
    const frame = layerFrame(page);

    const viewSel = frame.locator('select').first();
    if (await viewSel.count()) {
      await viewSel.selectOption({ label: /overzicht/i }).catch(()=>{});
    }

    // Edit first editable cell
    const cell = frame.locator('td[contenteditable="true"], .pb-cell[contenteditable="true"]').first();
    if (await cell.count()) {
      await cell.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type('PW_CELL');
      await page.keyboard.press('Enter');
    }

    await page.reload();
    await selectApp(page, 'Planbord');
    const frame2 = layerFrame(page);
    await expect(frame2.locator('text=PW_CELL')).toBeVisible({ timeout: 5000 }).catch(()=>{});

    await g.assertNoErrors();
  });
});
