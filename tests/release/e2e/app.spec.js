import { test, expect } from "@playwright/test";

const LOCAL_USER = "local-admin@cws.test";

async function openApp(page, app = null) {
  const target = app ? `/index.html?app=${encodeURIComponent(app)}` : "/index.html";
  const response = await page.goto(target, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toHaveAttribute("data-cws-ready", "true", { timeout: 60_000 });
  return response;
}

async function openModule(page, app) {
  await page.evaluate(moduleId => Router.loadApp(moduleId), app);
  await expect(page.locator("#appFrame")).toHaveAttribute("data-active-app", app, { timeout: 20_000 });
  const body = page.frameLocator("#appFrame").locator("body");
  await expect(body).not.toBeEmpty({ timeout: 20_000 });
  return body;
}

async function storageStatus(page) {
  return page.evaluate(() => ({ ...CWS.storageStatus }));
}

async function waitForRemoteSave(page, previousVersion) {
  await expect.poll(async () => {
    const status = await storageStatus(page);
    return {
      version: Number(status.remoteVersion || 0),
      synced: !status.unsynced && !status.remoteSaveInFlight && !status.remoteSaveQueued,
      conflict: Boolean(status.conflictActionRequired)
    };
  }, { timeout: 45_000 }).toEqual({
    version: expect.any(Number),
    synced: true,
    conflict: false
  });
  await expect.poll(() => page.evaluate(() => Number(CWS.storageStatus.remoteVersion || 0)), { timeout: 45_000 })
    .toBeGreaterThan(previousVersion);
}

function collectRuntimeErrors(page, { ignoreExpectedConflict409 = false } = {}) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", error => pageErrors.push(String(error)));
  page.on("console", message => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (ignoreExpectedConflict409 && /Failed to load resource:.*409 \(Conflict\)/i.test(text)) return;
    consoleErrors.push(text);
  });
  return () => {
    expect(pageErrors, `Onverwachte page errors: ${pageErrors.join(" | ")}`).toEqual([]);
    expect(consoleErrors, `Onverwachte console errors: ${consoleErrors.join(" | ")}`).toEqual([]);
  };
}

test.describe.configure({ mode: "serial" });

test("nieuwe of lege D1 blijft de gedeelde gezaghebbende bron", async ({ page }) => {
  const assertNoErrors = collectRuntimeErrors(page);
  const response = await openApp(page);
  expect(response).not.toBeNull();
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).not.toContain("unsafe-eval");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("SAMEORIGIN");

  // Make retries and repeated local runs deterministic without bypassing the API.
  const before = await storageStatus(page);
  const reset = await page.evaluate(async () => CWS.storage.reset());
  expect(reset.ok).toBe(true);
  expect(Number(reset.version || 0)).toBeGreaterThan(Number(before.remoteVersion || 0));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toHaveAttribute("data-cws-ready", "true", { timeout: 60_000 });

  const status = await storageStatus(page);
  expect(status.mode).toBe("api");
  expect(status.stateSource).toBe("remote-d1");
  expect(status.d1Reachable).toBe(true);
  expect(status.unsynced).toBe(false);
  expect(await page.evaluate(() => CWS.getStateMetrics().projectCount)).toBe(0);
  await expect(page.locator("#appFrame")).toHaveAttribute("data-active-app", "projecten");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  assertNoErrors();
});

test("demo-opbouw wordt via D1 opgeslagen en alle productiemodules laden", async ({ page }) => {
  const assertNoErrors = collectRuntimeErrors(page);
  await openApp(page);
  const before = Number((await storageStatus(page)).remoteVersion || 0);
  expect(await page.evaluate(() => CWS.resetDemo())).toBe(true);
  await waitForRemoteSave(page, before);
  expect(await page.evaluate(() => CWS.getStateMetrics().projectCount)).toBe(5);

  const modules = [
    "projecten", "gantt", "capaciteit", "afdelingsplanning", "werkvoorraad",
    "resources", "conflicten", "mijnwerk", "rollenrechten", "projectoverzicht",
    "projectplanning", "planbord", "transport", "rapporten", "dashboard",
    "instellingen", "nietwerkbaredagen", "werknemerswerkweek", "importexport",
    "audit", "preflight"
  ];
  for (const app of modules) {
    const body = await openModule(page, app);
    await expect(body).not.toContainText("Opstarten is niet voltooid");
  }
  assertNoErrors();
});

test("project aanmaken blijft na D1-save en volledige reload bestaan", async ({ page }) => {
  const assertNoErrors = collectRuntimeErrors(page);
  await openApp(page, "projecten");
  await expect(page.locator("#appFrame")).toHaveAttribute("data-active-app", "projecten");
  const frame = page.frameLocator("#appFrame");
  await frame.locator("#newProject").click();
  await expect(frame.locator("#npBackdrop")).toBeVisible();

  const projectNumber = "E2E-260812";
  await frame.locator("#npNr").fill(projectNumber);
  await frame.locator("#npName").fill("Browseracceptatie staalproject");
  await frame.locator("#npClient").fill("CWS Testklant");
  await frame.locator("#npStart").fill("20-08-2026");
  const before = Number((await storageStatus(page)).remoteVersion || 0);
  await frame.locator("#npSave").click();
  await expect(frame.locator("#rows")).toContainText(projectNumber);
  await waitForRemoteSave(page, before);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toHaveAttribute("data-cws-ready", "true", { timeout: 60_000 });
  await expect(page.locator("#appFrame")).toHaveAttribute("data-active-app", "projecten");
  await expect(page.frameLocator("#appFrame").locator("#rows")).toContainText(projectNumber);
  expect(await page.evaluate(number => CWS.getState().projects.order.some(
    id => CWS.getState().projects.byId[id]?.nr === number
  ), projectNumber)).toBe(true);
  assertNoErrors();
});

test("releaseoppervlak, CAS, identiteit, postMessage en mobiele weergave zijn afgeschermd", async ({ page, request, browser }) => {
  // A 409 is the expected HTTP result for exactly one of the two simultaneous CAS writes.
  const assertNoErrors = collectRuntimeErrors(page, { ignoreExpectedConflict409:true });
  await openApp(page);

  const beforeProjects = await page.evaluate(() => CWS.getStateMetrics().projectCount);
  const promptCalls = await page.evaluate(async () => {
    window.__cwsPromptCalls = 0;
    window.prompt = () => { window.__cwsPromptCalls += 1; return "DATA LEEGMAKEN"; };
    window.confirm = () => true;
    window.postMessage({ type:"cws_admin_clear_data" }, location.origin);
    await new Promise(resolve => setTimeout(resolve, 250));
    return window.__cwsPromptCalls;
  });
  expect(promptCalls).toBe(0);
  expect(await page.evaluate(() => CWS.getStateMetrics().projectCount)).toBe(beforeProjects);

  for (const pathname of [
    "/wrangler.toml",
    "/package.json",
    "/d1-backup-before-restore-2026-06-12.sql",
    "/CLOUDFLARE_INTERNE_TEST.md"
  ]) {
    const response = await request.get(pathname, { headers:{ "X-CWS-Local-User-Email":LOCAL_USER } });
    expect(response.status(), pathname).toBe(404);
  }
  const unknown = await request.get("/api/identity", {
    headers:{ "X-CWS-Local-User-Email":"unknown-user@cws.test" }
  });
  expect(unknown.status()).toBe(403);

  const current = await request.get("/api/state?payload=raw-state", {
    headers:{
      "X-CWS-Local-User-Email":LOCAL_USER,
      "X-CWS-State-Response":"raw-state"
    }
  });
  expect(current.ok()).toBe(true);
  const baseVersion = Number(current.headers()["x-cws-version"] || 0);
  const state = JSON.parse(await current.text());
  state.meta = { ...(state.meta || {}), e2eCasAt:new Date().toISOString() };
  const payload = JSON.stringify(state);
  const write = () => request.put(`/api/state?payload=raw-state&baseVersion=${baseVersion}`, {
    headers:{
      "X-CWS-Local-User-Email":LOCAL_USER,
      "Origin":"http://127.0.0.1:8788",
      "Content-Type":"application/json; charset=utf-8",
      "X-CWS-State-Payload":"raw-state",
      "X-CWS-Base-Version":String(baseVersion)
    },
    data:payload
  });
  const writes = await Promise.all([write(), write()]);
  expect(writes.map(response => response.status()).sort((a, b) => a - b)).toEqual([200, 409]);

  const mobileContext = await browser.newContext({
    baseURL:"http://127.0.0.1:8788",
    viewport:{ width:390, height:844 },
    extraHTTPHeaders:{ "X-CWS-Local-User-Email":LOCAL_USER }
  });
  const mobile = await mobileContext.newPage();
  const assertNoMobileErrors = collectRuntimeErrors(mobile);
  await openApp(mobile);
  await expect(mobile.locator("#appFrame")).toHaveAttribute("data-active-app", "dashboard");
  await expect(mobile.locator("#mobileBottomNav")).toBeVisible();
  expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await mobile.locator('[data-mobile-app="projecten"]').click();
  await expect(mobile.locator("#appFrame")).toHaveAttribute("data-active-app", "projecten");
  const mobileFrame = mobile.frameLocator("#appFrame");
  await expect(mobileFrame.locator(".mobile-projects-view")).toBeVisible();
  expect(await mobileFrame.locator(".mobile-project-card").count()).toBeGreaterThanOrEqual(5);
  expect(await mobileFrame.locator("html").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  assertNoMobileErrors();
  await mobileContext.close();

  // Reload after the intentional CAS conflict: the latest committed D1 version must hydrate cleanly.
  await page.reload({ waitUntil:"domcontentloaded" });
  await expect(page.locator("body")).toHaveAttribute("data-cws-ready", "true", { timeout:60_000 });
  const finalStatus = await storageStatus(page);
  expect(finalStatus.mode).toBe("api");
  expect(finalStatus.stateSource).toBe("remote-d1");
  assertNoErrors();
});
