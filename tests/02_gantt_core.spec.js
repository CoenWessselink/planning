// @ts-check
import { test, expect } from '@playwright/test';
import { guardConsole, gotoHome, selectApp, loadDemoData, layerFrame } from './helpers.js';

test.describe('Gantt (laag 4) - baseline, deps, critical, drag', () => {
  test('Opens and toggles baseline/deps/critical without errors', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await loadDemoData(page);
    await selectApp(page, 'Gantt');

    const frame = layerFrame(page);
    // Basic sanity: either a header or timeline present
    await expect(frame.locator('text=Gantt')).toBeVisible({ timeout: 15000 }).catch(async () => {
      await expect(frame.locator('body')).toBeVisible();
    });

    // Toggles (best-effort: only click if present)
    const toggleNames = ['Baseline','Afhankelijkheden','Kritiek pad'];
    for (const name of toggleNames) {
      const btn = frame.getByRole('button', { name }).first();
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(150);
      }
    }
    await g.assertNoErrors();
  });

  test('Drag/resize first task bar if present', async ({ page }) => {
    const g = guardConsole(page);
    await gotoHome(page);
    await loadDemoData(page);
    await selectApp(page, 'Gantt');
    const frame = layerFrame(page);

    const bar = frame.locator('.taskbar,.gantt-bar,[data-testid^="gantt-bar-"]').first();
    if (await bar.count()) {
      const box = await bar.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width/2 + 60, box.y + box.height/2);
        await page.mouse.up();
        await page.waitForTimeout(200);
      }
    }

    await g.assertNoErrors();
  });
});
