import { test, expect } from '@playwright/test';

test('boot + demo visible + navigate layers', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Demo data').click();
  await expect(page.locator('text=Projecten')).toBeVisible();
  // open apps menu and go to Gantt
  await page.getByText('Apps').click();
  await page.getByText('Gantt').click();
  await expect(page.frameLocator('iframe').locator('text=Gantt')).toBeVisible({ timeout: 10000 });
  // go to Planbord
  await page.getByText('Apps').click();
  await page.getByText('Planbord').click();
  await expect(page.frameLocator('iframe').locator('text=Planbord')).toBeVisible({ timeout: 10000 });
});

test('role switch + dept switch works', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Demo data').click();
  const role = page.locator('#rolePill');
  await page.locator('#roleToggle').click();
  await expect(role).not.toHaveText('Admin');
  const dept = page.locator('#deptPill');
  await page.locator('#deptToggle').click();
  await expect(dept).toBeVisible();
});
