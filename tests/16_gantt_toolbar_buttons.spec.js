// @ts-check
import { test, expect } from '@playwright/test';
import { guardConsole, gotoHome, selectApp, loadDemoData, layerFrame } from './helpers.js';

test.describe('Gantt - toolbar buttons', () => {
  test('All toolbar buttons are clickable and produce no console/page errors', async ({ page }) => {
    const g = guardConsole(page);

    page.on('dialog', async (d) => {
      try { await d.dismiss(); } catch {}
    });

    await gotoHome(page);
    await loadDemoData(page);
    await selectApp(page, 'Gantt');

    const frame = layerFrame(page);
    const toolbar = frame.locator('[data-testid="gantt-toolbar"]');
    await expect(toolbar).toBeVisible({ timeout: 10000 });

    const buttons = toolbar.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(5);

    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      try {
        await btn.click({ timeout: 5000 });
      } catch {
        await btn.click({ force: true, timeout: 5000 });
      }
      await page.waitForTimeout(100);
    }

    for (const label of ['Tabel', 'Beide', 'Diagram']) {
      const vbtn = toolbar.getByRole('button', { name: label });
      if (await vbtn.count()) {
        await vbtn.first().click({ timeout: 5000 });
        await page.waitForTimeout(100);
      }
    }

    await g.assertNoErrors();
  });
});
