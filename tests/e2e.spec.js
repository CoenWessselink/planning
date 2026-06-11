import { test, expect } from '@playwright/test';

test('Boot + demo data zichtbaar in Projecten', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#moduleTitle')).toHaveText('Projecten');
  await page.getByRole('button', { name: 'Demo data' }).click();
  await page.waitForTimeout(300);
  const frame = page.frameLocator('iframe#appFrame');
  const count = await frame.locator('table tbody tr').count();
  expect(count).toBeGreaterThan(0);
});

test('Apps menu openen + lagen navigeren', async ({ page }) => {
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Apps Menu' }).click();
  await expect(page.getByText('APPS MENU')).toBeVisible();
  await page.getByText('Gantt').click();
  await expect(page.locator('#moduleTitle')).toHaveText('Gantt');
  const frame = page.frameLocator('iframe#appFrame');
  await expect(frame.locator('body')).toBeVisible();
});

test('Rol wisselen en afdeling wisselen blijft werken', async ({ page }) => {
  await page.goto('/index.html');
  const rolePill = page.locator('#rolePill');
  const before = await rolePill.textContent();
  await page.getByRole('button', { name: 'Wissel rol' }).click();
  await expect(rolePill).not.toHaveText(before || '');
  await page.getByRole('button', { name: 'Wissel afdeling' }).click();
  await expect(page.locator('#deptPill')).toBeVisible();
});
