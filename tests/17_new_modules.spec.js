// @ts-check
import { test, expect } from '@playwright/test';
import { gotoHome, guardConsole, loadDemoData, selectApp, layerFrame } from './helpers.js';

test('Projectoverzicht opent Project 360 en slaat notitie op', async ({ page }) => {
  const g = guardConsole(page);
  await gotoHome(page);
  await loadDemoData(page);
  await selectApp(page, 'Projectoverzicht');
  const frame = layerFrame(page);
  await expect(frame.getByRole('button', { name:'Project 360' }).first()).toBeVisible();
  await frame.getByRole('button', { name:'Project 360' }).first().click();
  await frame.getByRole('button', { name:'Notities' }).click();
  await frame.locator('#notes360').fill('Playwright notitie');
  await frame.getByRole('button', { name:'Opslaan' }).click();
  await frame.getByRole('button', { name:'Sluiten' }).click();
  await g.assertNoErrors();
});

test('Projectplanning kan een regel toevoegen en bewaren', async ({ page }) => {
  const g = guardConsole(page);
  await gotoHome(page);
  await loadDemoData(page);
  await selectApp(page, 'Projectplanning');
  const frame = layerFrame(page);
  const before = await frame.locator('tbody tr').count();
  await frame.getByRole('button', { name:'Project toevoegen' }).click();
  await expect(frame.locator('tbody tr')).toHaveCount(before + 1);
  await g.assertNoErrors();
});

test('Transport kan een rit toevoegen', async ({ page }) => {
  const g = guardConsole(page);
  await gotoHome(page);
  await loadDemoData(page);
  await selectApp(page, 'Transportplanning');
  const frame = layerFrame(page);
  const before = await frame.locator('tbody tr').count();
  await frame.getByRole('button', { name:'Nieuwe rit' }).click();
  await frame.getByRole('button', { name:'Opslaan' }).click();
  await expect(frame.locator('tbody tr')).toHaveCount(before + 1);
  await g.assertNoErrors();
});
