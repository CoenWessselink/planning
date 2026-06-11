// @ts-check
import { expect } from '@playwright/test';

/**
 * Attach listeners to catch console/page errors. Returns an object with a `assertNoErrors()` method.
 * We treat console.error and uncaught page errors as test failures.
 * @param {import('@playwright/test').Page} page
 */
export function guardConsole(page) {
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(String(err));
  });

  return {
    consoleErrors,
    pageErrors,
    async assertNoErrors() {
      // Allow known benign noise patterns (if any) here. For now: strict.
      expect(consoleErrors, 'console.error should be empty').toEqual([]);
      expect(pageErrors, 'pageerror should be empty').toEqual([]);
    }
  };
}

/** @param {import('@playwright/test').Page} page */
export async function gotoHome(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  // Do not rely on branding text; assert on stable shell elements.
  await expect(page.locator('.headerbar')).toBeVisible();
  await expect(page.locator('#openApps')).toBeVisible();
  await expect(page.locator('#appFrame')).toBeVisible();
}

/** @param {import('@playwright/test').Page} page */
export async function openAppsMenu(page) {
  const backdrop = page.locator('#appsBackdrop');
  if (!(await backdrop.evaluate(el => el.classList.contains('show')))) {
    await page.getByRole('button', { name: 'Apps Menu' }).click();
  }
  await expect(page.locator('#appsBackdrop .modal-head')).toBeVisible();
}

/** @param {import('@playwright/test').Page} page */
export async function selectApp(page, name) {
  await openAppsMenu(page);
  await page.locator('#appsGrid .app-card', { hasText: name }).click();
  // allow iframe navigation/render
  await page.waitForTimeout(200);
}

/** @param {import('@playwright/test').Page} page */
export async function expectModuleTitle(page, title) {
  await expect(page.locator('#moduleTitle')).toHaveText(title);
}

/** @param {import('@playwright/test').Page} page */
export async function selectAppAndExpect(page, name) {
  await selectApp(page, name);
  await expectModuleTitle(page, name);
}

/** @param {import('@playwright/test').Page} page */
export async function loadDemoData(page) {
  const btn = page.getByRole('button', { name: 'Demo data' });
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(300);
  }
}

/** @param {import('@playwright/test').Page} page */
export function layerFrame(page) {
  return page.frameLocator('iframe#appFrame');
}
