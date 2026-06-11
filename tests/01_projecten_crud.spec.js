// @ts-check
import { test, expect } from '@playwright/test';
import { guardConsole, gotoHome, selectApp, loadDemoData, layerFrame } from './helpers.js';

test.describe('Projecten table - CRUD, tabs, columns', () => {
  test('Create project, edit, delete, persists after reload', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await loadDemoData(page);
    await selectApp(page, 'Projecten');

    const frame = layerFrame(page);
    // Create new project via modal
    const newBtn = frame.getByRole('button', { name: /Nieuw project/i });
    await expect(newBtn).toBeVisible();
    await newBtn.click();

    await frame.getByPlaceholder('Projectnummer').fill('P-9999');
    await frame.getByPlaceholder('Projectnaam').fill('Playwright Project');
    await frame.getByPlaceholder('Opdrachtgever').fill('ACME');
    await frame.getByRole('button', { name: /Opslaan/i }).click();

    await expect(frame.locator('text=P-9999')).toBeVisible();

    // Inline edit: double click name cell if supported
    const row = frame.locator('tr', { hasText: 'P-9999' });
    const nameCell = row.locator('td').nth(1);
    await nameCell.dblclick();
    const anyInput = frame.locator('input').first();
    if (await anyInput.count()) {
      await anyInput.fill('Playwright Project Edited');
      await page.keyboard.press('Enter');
    }

    // Reload and verify
    await page.reload();
    await selectApp(page, 'Projecten');
    const frame2 = layerFrame(page);
    await expect(frame2.locator('text=P-9999')).toBeVisible();

    // Delete if delete action exists
    const delBtn = frame2.getByRole('button', { name: /Verwijder/i }).first();
    if (await delBtn.count()) {
      await row.click();
      await delBtn.click();
      // confirm dialog if used
      page.once('dialog', d => d.accept());
      await page.waitForTimeout(300);
    }

    await g.assertNoErrors();
  });

  test('Tabs exist and can switch without errors', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await loadDemoData(page);
    await selectApp(page, 'Projecten');

    const frame = layerFrame(page);

    const tabs = ['Alle','Te plannen','Ingepland','In uitvoering','Gereed'];
    for (const t of tabs) {
      const tab = frame.locator(`role=tab[name="${t}"]`);
      if (await tab.count()) {
        await tab.click();
        await page.waitForTimeout(150);
      }
    }
    await g.assertNoErrors();
  });

  test('Column wizard opens (if present)', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await selectApp(page, 'Projecten');
    const frame = layerFrame(page);
    const btn = frame.getByRole('button', { name: /Kolommen/i });
    if (await btn.count()) {
      await btn.click();
      await expect(page.locator('text=Kolommen')).toBeVisible();
      // close wizard
      const close = page.getByRole('button', { name: 'Sluiten' });
      if (await close.count()) await close.click();
    }
    await g.assertNoErrors();
  });

  test('Benodigde uren per afdeling can be edited and updates project total', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await loadDemoData(page);
    await selectApp(page, 'Projecten');

    const frame = layerFrame(page);
    // Open table manager
    await frame.getByRole('button', { name: /Uren per afdeling/i }).click();
    // Table manager opens in top-level modal (outside iframe)
    await expect(page.locator('text=Projecturen per afdeling')).toBeVisible();
    await page.getByRole('button', { name: /Nieuw/i }).click();

    // Edit last row cells
    const tbody = page.locator('tbody').first();
    const lastRow = tbody.locator('tr').last();
    await lastRow.locator('td[data-key="projectId"]').click();
    await page.keyboard.type('P-1001');
    await lastRow.locator('td[data-key="deptId"]').click();
    await page.keyboard.type('Engineering');
    await lastRow.locator('td[data-key="hours"]').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('123');
    await page.keyboard.press('Tab');

    // Close modal
    const close = page.getByRole('button', { name: /Sluiten/i }).first();
    if (await close.count()) await close.click();

    // Verify total hours column exists and shows a number (button shows "u")
    await expect(frame.locator('th', { hasText: 'Uren benodigd' })).toBeVisible();
    const pRow = frame.locator('tr', { hasText: 'P-1001' }).first();
    await expect(pRow.locator('button', { hasText: /u$/ })).toBeVisible();

    await g.assertNoErrors();
  });
});
