// @ts-check
import { test, expect } from '@playwright/test';
import { gotoHome, guardConsole, selectAppAndExpect, layerFrame } from './helpers.js';

test('Dashboard shows KPI blocks and department load table', async ({ page }) => {
  const g = guardConsole(page);
  await gotoHome(page);
  await selectAppAndExpect(page, 'Dashboard');

  const f = layerFrame(page);
  // KPI cards / blocks should exist
  const anyKpi = f.locator('.kpi, .kpi-card, [data-testid="kpi"], text=/KPI/i').first();
  await expect(anyKpi).toBeVisible();

  // Department load table should have rows (>0) if present
  const deptTable = f.locator('table').first();
  if (await deptTable.count()) {
    const rows = deptTable.locator('tr');
    const n = await rows.count();
    // header + at least one data row (best effort)
    expect(n).toBeGreaterThanOrEqual(2);
  }

  await g.assertNoErrors();
});
