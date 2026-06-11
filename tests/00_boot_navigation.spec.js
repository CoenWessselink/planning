// @ts-check
import { test, expect } from '@playwright/test';
import { guardConsole, gotoHome, openAppsMenu, selectApp, loadDemoData, layerFrame } from './helpers.js';

test.describe('Boot, navigation, and global UI', () => {
  test('Boots with no console errors and demo data loads', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await loadDemoData(page);
    // Projects table should have rows in the embedded layer
    const frame = layerFrame(page);
    const rows = await frame.locator('table tbody tr').count();
    expect(rows).toBeGreaterThan(0);
    await g.assertNoErrors();
  });

  test('Apps menu lists all apps and each app can be opened', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);

    await openAppsMenu(page);
    const apps = ['Projecten','Gantt','Capaciteit','Projectoverzicht','Projectplanning','Planbord','Transportplanning','Instellingen'];
    for (const app of apps) {
      await expect(page.locator(`text=${app}`).first()).toBeVisible();
    }

    // Open each app and assert the iframe (or main area) shows something non-empty
    for (const app of apps) {
      await selectApp(page, app);
      // if the app uses iframe, ensure it rendered something
      const frame = layerFrame(page);
      // Some layers may not have a table; check for at least one visible element
      await expect(frame.locator('body')).toBeVisible();
    }
    await g.assertNoErrors();
  });

  test('Role and department switching does not break navigation', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);

    await page.getByRole('button', { name: 'Wissel rol' }).click();
    await expect(page.locator('#rolePill')).toBeVisible();
    await page.getByRole('button', { name: 'Wissel afdeling' }).click();
    await expect(page.locator('#deptPill')).toBeVisible();

    await selectApp(page, 'Projecten');
    const frame = layerFrame(page);
    await expect(frame.locator('table')).toBeVisible();

    await g.assertNoErrors();
  });
});
