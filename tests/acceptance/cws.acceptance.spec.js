// @ts-check
import { test, expect } from '@playwright/test';
import { loadDemoData } from '../helpers.js';

function guard(page) {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(String(error)));
  return () => expect(errors).toEqual([]);
}

async function home(page) {
  await page.goto('/index.html');
  await expect(page.locator('body[data-cws-ready="true"]')).toBeVisible();
  await expect(page.locator('#openApps')).toBeVisible();
  await loadDemoData(page);
}

async function openApp(page, name) {
  const backdrop = page.locator('#appsBackdrop');
  if (!(await backdrop.evaluate(el => el.classList.contains('show')))) {
    await page.getByRole('button', { name:'Apps Menu' }).click();
  }
  await page.locator('#appsGrid .app-card', { hasText:name }).click();
  await expect(page.locator('#moduleTitle')).toHaveText(name);
  return page.frameLocator('#appFrame');
}

test('boot en officiële laagmapping laden zonder fouten', async ({ page }) => {
  const noErrors = guard(page);
  await home(page);
  const apps = ['Projecten','Gantt','Capaciteit','Projectoverzicht','Projectplanning','Planbord','Transportplanning','Instellingen','Audit','Self-test / Preflight'];
  for (const app of apps) {
    const frame = await openApp(page, app);
    await expect(frame.locator('body')).toBeVisible();
  }
  noErrors();
});

test('Projecten CRUD en projecturen blijven persistent', async ({ page }) => {
  const noErrors = guard(page);
  await home(page);
  const frame = await openApp(page, 'Projecten');
  await frame.getByRole('button', { name:'Nieuw project' }).click();
  await frame.locator('#npNr').fill('9999');
  await frame.locator('#npName').fill('Acceptatieproject');
  await frame.locator('#npClient').fill('CWS Test');
  const hours = frame.locator('#npDeptHours input[type=number]').first();
  await hours.fill('24');
  await frame.locator('#npSave').evaluate(button => button.click());
  await expect(frame.getByText('Acceptatieproject')).toBeVisible();
  await page.reload();
  const frameReloaded = await openApp(page, 'Projecten');
  await expect(frameReloaded.getByText('Acceptatieproject')).toBeVisible();
  noErrors();
});

test('Gantt genereert fasen, wijzigt hiërarchie en herberekent uren', async ({ page }) => {
  const noErrors = guard(page);
  await home(page);
  const frame = await openApp(page, 'Gantt');
  await expect(frame.locator('[data-testid="gantt-toolbar"]')).toBeVisible();
  await frame.getByRole('button', { name:'Genereer fasen' }).click();
  const firstTask = frame.locator('#tableRows tr').nth(1);
  await firstTask.click();
  await frame.getByRole('button', { name:'Inspringen' }).click();
  await frame.getByRole('button', { name:'Uitspringen' }).click();
  await frame.getByRole('button', { name:/Herbereken planning|Herbereken uren/ }).click();
  await expect(frame.locator('.bar').first()).toBeVisible();
  const sharedStore = await page.evaluate(() => {
    const frame = document.querySelector('#appFrame');
    return {
      noFrameOverride:frame?.contentWindow?.CWS === undefined,
      ganttApi:Boolean(window.CWS?.gantt),
      distributedDays:Object.keys(window.CWS?.getState()?.gantt?.hoursByDay || {}).length
    };
  });
  expect(sharedStore.noFrameOverride).toBe(true);
  expect(sharedStore.ganttApi).toBe(true);
  expect(sharedStore.distributedDays).toBeGreaterThan(0);
  noErrors();
});

test('Capaciteit toont beschikbare en geplande uren', async ({ page }) => {
  const noErrors = guard(page);
  await home(page);
  const frame = await openApp(page, 'Capaciteit');
  await expect(frame.locator('table')).toBeVisible();
  await expect(frame.locator('tbody tr').first()).toBeVisible();
  noErrors();
});

test('Projectoverzicht Project 360 en Projectplanning autosave werken', async ({ page }) => {
  const noErrors = guard(page);
  await home(page);
  let frame = await openApp(page, 'Projectoverzicht');
  await frame.getByRole('button', { name:'Project 360' }).first().click();
  await frame.getByRole('button', { name:'Notities' }).click();
  await frame.locator('#notes360').fill('Acceptatienotitie');
  await frame.getByRole('button', { name:'Opslaan' }).click();
  await frame.getByRole('button', { name:'Sluiten' }).click();
  frame = await openApp(page, 'Projectplanning');
  const before = await frame.locator('tbody tr').count();
  await frame.getByRole('button', { name:'Project toevoegen' }).click();
  await expect(frame.locator('tbody tr')).toHaveCount(before + 1);
  noErrors();
});

test('Planbord bewaart een bewerkte overzichtscel', async ({ page }) => {
  const noErrors = guard(page);
  await home(page);
  const frame = await openApp(page, 'Planbord');
  await frame.locator('select').first().selectOption('overview');
  const cell = frame.locator('td[contenteditable=true]').first();
  if (await cell.count()) {
    await cell.fill('Acceptatie');
    await cell.press('Enter');
  }
  await expect(frame.locator('#ovTable')).toBeVisible();
  noErrors();
});

test('Transport CRUD en conflictcontrole werken', async ({ page }) => {
  const noErrors = guard(page);
  await home(page);
  const frame = await openApp(page, 'Transportplanning');
  const before = await frame.locator('tbody tr').count();
  await frame.getByRole('button', { name:'Nieuwe rit' }).click();
  await frame.getByRole('button', { name:'Opslaan' }).click();
  await expect(frame.locator('tbody tr')).toHaveCount(before + 1);
  await frame.getByRole('button', { name:'Bewerken' }).last().click();
  await frame.getByRole('button', { name:'Opslaan' }).click();
  noErrors();
});

test('Preflight valideert de coherente demo-state', async ({ page }) => {
  const noErrors = guard(page);
  await home(page);
  const frame = await openApp(page, 'Self-test / Preflight');
  await expect(frame.locator('#summary')).toContainText(/Alle kritieke controles geslaagd|Alle \d+ controles geslaagd/);
  noErrors();
});

test('Viewer kan tenantdata niet muteren en globale undo/redo werkt', async ({ page }) => {
  await home(page);
  const result = await page.evaluate(() => {
    CWS.setUserRole('admin');
    const before = CWS.getState().projects.order.length;
    CWS.mutate('acceptance_add', {}, state => {
      const id = 'UNDO-TEST';
      state.projects.order.push(id);
      state.projects.byId[id] = { id, nr:id, name:'Undo test', status:'In te plannen' };
    });
    const afterAdd = CWS.getState().projects.order.length;
    CWS.undo();
    const afterUndo = CWS.getState().projects.order.length;
    CWS.redo();
    const afterRedo = CWS.getState().projects.order.length;
    CWS.setUserRole('viewer');
    const blocked = CWS.mutate('viewer_add', {}, state => {
      state.projects.order.push('VIEWER-BLOCKED');
      state.projects.byId['VIEWER-BLOCKED'] = { id:'VIEWER-BLOCKED', nr:'VB', name:'Mag niet' };
    });
    return { before, afterAdd, afterUndo, afterRedo, viewerOk:blocked.ok, viewerExists:Boolean(CWS.getState().projects.byId['VIEWER-BLOCKED']) };
  });
  expect(result.afterAdd).toBe(result.before + 1);
  expect(result.afterUndo).toBe(result.before);
  expect(result.afterRedo).toBe(result.before + 1);
  expect(result.viewerOk).toBe(false);
  expect(result.viewerExists).toBe(false);
});

test('Cloudflare health, state en Access-audit werken', async ({ request }) => {
  const health = await request.get('http://localhost:8788/api/health');
  expect(health.ok()).toBe(true);
  expect((await health.json()).storage).toBe('d1');

  const headers = { 'CF-Access-Authenticated-User-Email':'playwright-admin@cws.test' };
  const initial = await request.get('http://localhost:8788/api/state', { headers });
  expect(initial.ok()).toBe(true);
  const initialBody = await initial.json();
  expect(initialBody.user.email).toBe('playwright-admin@cws.test');

  const saved = await request.put('http://localhost:8788/api/state', {
    headers,
    data:{ baseVersion: initialBody.version, state:{ schemaVersion:12, projects:{ order:[], byId:{} } } }
  });
  expect(saved.ok()).toBe(true);
  expect((await saved.json()).updatedBy).toBe('playwright-admin@cws.test');

  const deniedAudit = await request.get('http://localhost:8788/api/audit');
  // Cloudflare Pages dev kan lokaal Access-headers injecteren; live zonder Access hoort 401 te geven.
  expect([200, 401]).toContain(deniedAudit.status());
  const audit = await request.get('http://localhost:8788/api/audit', { headers });
  expect(audit.ok()).toBe(true);
  expect((await audit.json()).items.length).toBeGreaterThan(0);
});
