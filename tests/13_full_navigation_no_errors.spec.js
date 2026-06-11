// @ts-check
import { test, expect } from '@playwright/test';
import { gotoHome, guardConsole, selectAppAndExpect, layerFrame } from './helpers.js';

test('Navigatie door alle apps: geen console/page errors', async ({ page }) => {
  const g = guardConsole(page);
  await gotoHome(page);

  const apps = [
    'Projecten',
    'Gantt',
    'Capaciteit',
    'Projectoverzicht',
    'Projectplanning',
    'Planbord',
    'Transportplanning',
    'Rapporten',
    'Dashboard',
    'Instellingen',
    'Import / Export'
  ];

  for (const a of apps) {
    await selectAppAndExpect(page, a);
    const f = layerFrame(page);
    await expect(f.locator('body')).toBeVisible();
    // allow any async render to settle
    await page.waitForTimeout(200);
  }

  await g.assertNoErrors();
});
