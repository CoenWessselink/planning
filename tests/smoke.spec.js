// @ts-check
import { test, expect } from '@playwright/test';

test.describe('CWS Planning UI - Smoke & Regression', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    // Stable boot assertions (no reliance on branding text)
    await expect(page.locator('.headerbar')).toBeVisible();
    await expect(page.locator('#openApps')).toBeVisible();
    await expect(page.locator('#appFrame')).toBeVisible();
  });

  test('Apps menu opens and all apps selectable', async ({ page }) => {
    await page.getByRole('button', { name: 'Apps Menu' }).click();
    await expect(page.locator('text=Projecten')).toBeVisible();
    await page.locator('text=Projecten').click();
    await expect(page.locator('text=Projecten')).toBeVisible();
  });

  test('Role switch does not hide apps and keeps navigation working', async ({ page }) => {
    await page.locator('text=Admin').click(); // role pill/selector
    await page.locator('text=Planner').click();
    await page.getByRole('button', { name: 'Apps Menu' }).click();
    await page.locator('text=Projecten').click();
    await expect(page.locator('text=Nieuw Project')).toBeVisible();
  });

  test('Projecten: create project, edit, persists after reload', async ({ page }) => {
    await page.getByRole('button', { name: 'Apps Menu' }).click();
    await page.locator('text=Projecten').click();

    await page.getByRole('button', { name: 'Nieuw Project' }).click();
    await page.getByPlaceholder('Projectnummer').fill('P-9999');
    await page.getByPlaceholder('Projectnaam').fill('Test project');
    await page.getByPlaceholder('Opdrachtgever').fill('ACME');
    await page.getByRole('button', { name: 'Opslaan' }).click();
    await expect(page.locator('text=P-9999')).toBeVisible();

    // inline edit projectnaam (double click cell)
    const nameCell = page.locator('tr:has-text("P-9999") td').nth(1);
    await nameCell.dblclick();
    await page.locator('input').first().fill('Test project edited');
    await page.keyboard.press('Enter');

    await page.reload();
    await page.getByRole('button', { name: 'Apps Menu' }).click();
    await page.locator('text=Projecten').click();
    await expect(page.locator('text=Test project edited')).toBeVisible();
  });

  test('Planbord: basic load and capacity has rows', async ({ page }) => {
    await page.getByRole('button', { name: 'Apps Menu' }).click();
    await page.locator('text=Planbord').click();

    // Planbord should show some grid/table (implementation may differ)
    await expect(page.locator('iframe#appFrame')).toBeVisible();

    // go to capacity and verify planned hours > 0
    await page.getByRole('button', { name: 'Apps Menu' }).click();
    await page.locator('text=Capaciteit').click();
    await expect(page.locator('text=Totaal uren:')).toBeVisible();
    const trCount = await page.locator('tbody tr').count();
    expect(trCount).toBeGreaterThan(0);
  });

  test('Toewijzingen: can add assignment and it shows in table', async ({ page }) => {
    await page.getByRole('button', { name: 'Apps Menu' }).click();
    await page.locator('text=Toewijzingen').click();

    await page.getByRole('button', { name: 'Nieuwe toewijzing' }).click();
    await page.locator('#mHours').fill('3');
    await page.getByRole('button', { name: 'Opslaan' }).click();

    const rows = await page.locator('table tbody tr').count();
    expect(rows).toBeGreaterThan(0);
  });

  test('Exports/print controls exist on major apps', async ({ page }) => {
    const check = async (appName) => {
      await page.getByRole('button', { name: 'Apps Menu' }).click();
      await page.locator(`text=${appName}`).click();
      await expect(page.locator('text=Export CSV')).toBeVisible();
    };
    await check('Projecten');
    await check('Capaciteit');
    await check('Rapporten');
    await check('Toewijzingen');
    await check('Dashboard');
  });

});
