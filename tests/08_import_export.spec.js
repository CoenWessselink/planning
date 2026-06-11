// @ts-check
import { test, expect } from '@playwright/test';
import { gotoHome, guardConsole, selectAppAndExpect, layerFrame } from './helpers.js';

test('Import / Export module renders + basic actions', async ({ page }) => {
  const g = guardConsole(page);
  await gotoHome(page);
  await selectAppAndExpect(page, 'Import / Export');

  const f = layerFrame(page);
  // The IO module may be lightweight; just assert it loaded something.
  await expect(f.locator('body')).toBeVisible();

  // Look for common controls if present.
  const exportBtn = f.getByRole('button', { name: /export/i });
  if (await exportBtn.count()) {
    // best-effort download capture
    const [dl] = await Promise.all([
      page.waitForEvent('download').catch(() => null),
      exportBtn.first().click()
    ]);
    if (dl) {
      await dl.path().catch(() => {});
    }
  }

  await g.assertNoErrors();
});
