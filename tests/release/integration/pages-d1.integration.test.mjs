import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const adminEmail = "local-admin@cws.test";
const plannerEmail = "planner@cws.test";

async function freePort() {
  const server = net.createServer();
  server.unref();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitForServer(baseUrl, child, logs) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Lokale Pages-server stopte voortijdig (${child.exitCode}).\n${logs.join("")}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Lokale Pages-server werd niet gereed.\n${logs.join("")}`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise(resolve => setTimeout(resolve, 5_000))
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function parseBody(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { return text; }
}

test("Pages Functions en D1 doorstaan de volledige beveiligde opslagflow", { timeout: 120_000 }, async () => {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const profile = `integration-${process.pid}-${Date.now()}`;
  const dbPath = path.join(root, ".local-d1", `${profile}.sqlite`);
  const logs = [];
  const child = spawn(process.execPath, [
    "scripts/local-pages-server.mjs",
    `--profile=${profile}`,
    `--port=${port}`,
    "--reset",
    "--build"
  ], {
    cwd: root,
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", value => logs.push(value.toString()));
  child.stderr.on("data", value => logs.push(value.toString()));

  const api = async (pathname, {
    method = "GET",
    email = adminEmail,
    body,
    origin = method === "GET" || method === "HEAD" ? null : baseUrl,
    headers = {}
  } = {}) => {
    const requestHeaders = new Headers(headers);
    if (email) requestHeaders.set("X-CWS-Local-User-Email", email);
    if (origin) requestHeaders.set("Origin", origin);
    let payload;
    if (body !== undefined) {
      requestHeaders.set("Content-Type", "application/json");
      payload = typeof body === "string" ? body : JSON.stringify(body);
    }
    const response = await fetch(`${baseUrl}${pathname}`, { method, headers: requestHeaders, body: payload });
    const text = await response.text();
    return { response, text, body: parseBody(text) };
  };

  try {
    await waitForServer(baseUrl, child, logs);

    const health = await api("/api/health", { email: null });
    assert.equal(health.response.status, 200);
    assert.equal(health.body.schemaOk, true);

    const identity = await api("/api/identity");
    assert.equal(identity.response.status, 200);
    assert.equal(identity.body.email, adminEmail);
    assert.equal(identity.body.role, "admin");

    const unknown = await api("/api/identity", { email: "unknown@cws.test" });
    assert.equal(unknown.response.status, 403);
    assert.equal(unknown.body.code, "USER_NOT_PROVISIONED");

    const initial = await api("/api/state");
    assert.equal(initial.response.status, 200);
    assert.equal(initial.body.version, 1);
    let state = JSON.parse(initial.body.stateJson);
    state.meta = { ...(state.meta || {}), integrationStep: "first-save" };

    const firstSave = await api("/api/state", {
      method: "PUT",
      body: { baseVersion: 1, state }
    });
    assert.equal(firstSave.response.status, 200, firstSave.text);
    assert.equal(firstSave.body.version, 2);

    const stale = await api("/api/state", {
      method: "PUT",
      body: { baseVersion: 1, state: { ...state, meta: { ...state.meta, stale: true } } }
    });
    assert.equal(stale.response.status, 409);
    assert.equal(stale.body.code, "STATE_VERSION_CONFLICT");
    assert.equal(stale.body.currentVersion, 2);

    const stateA = structuredClone(state);
    stateA.meta = { ...stateA.meta, concurrentWriter: "A" };
    const stateB = structuredClone(state);
    stateB.meta = { ...stateB.meta, concurrentWriter: "B" };
    const concurrent = await Promise.all([
      api("/api/state", { method: "PUT", body: { baseVersion: 2, state: stateA } }),
      api("/api/state", { method: "PUT", body: { baseVersion: 2, state: stateB } })
    ]);
    assert.deepEqual(concurrent.map(item => item.response.status).sort(), [200, 409]);
    const winner = concurrent.find(item => item.response.status === 200);
    const loser = concurrent.find(item => item.response.status === 409);
    assert.equal(winner.body.version, 3);
    assert.equal(loser.body.code, "STATE_VERSION_CONFLICT");
    assert.equal(loser.body.currentVersion, 3);

    const currentAfterRace = await api("/api/state");
    assert.equal(currentAfterRace.body.version, 3);
    state = JSON.parse(currentAfterRace.body.stateJson);

    const maliciousState = structuredClone(state);
    maliciousState.settings = { ...(maliciousState.settings || {}), logo: { dataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" } };
    const maliciousLogo = await api("/api/state", {
      method: "PUT",
      body: { baseVersion: 3, state: maliciousState }
    });
    assert.equal(maliciousLogo.response.status, 400);
    assert.equal(maliciousLogo.body.code, "LOGO_INVALID");

    const crossOrigin = await api("/api/state", {
      method: "PUT",
      origin: "https://evil.example",
      body: { baseVersion: 3, state }
    });
    assert.equal(crossOrigin.response.status, 403);
    assert.equal(crossOrigin.body.code, "ORIGIN_FORBIDDEN");

    const largeState = structuredClone(state);
    largeState.settings = largeState.settings && typeof largeState.settings === "object" ? largeState.settings : {};
    largeState.settings.datasets = largeState.settings.datasets && typeof largeState.settings.datasets === "object" ? largeState.settings.datasets : {};
    largeState.settings.datasets.integrationPayload = "x".repeat(850_000);
    largeState.meta = { ...(largeState.meta || {}), integrationStep: "chunked-save" };
    const largeSave = await api("/api/state", {
      method: "PUT",
      body: { baseVersion: 3, state: largeState }
    });
    assert.equal(largeSave.response.status, 200, largeSave.text);
    assert.equal(largeSave.body.version, 4);
    assert.equal(largeSave.body.storage.chunked, true);
    assert.ok(largeSave.body.storage.chunkCount >= 4);

    const manifestResponse = await api("/api/state?chunks=auto", {
      headers: { "X-CWS-State-Response": "raw-state" }
    });
    assert.equal(manifestResponse.response.status, 200);
    assert.equal(manifestResponse.response.headers.get("x-cws-chunked-manifest"), "1");
    const manifest = manifestResponse.body;
    assert.equal(manifest.version, 4);
    assert.equal(manifest.chunkCount, largeSave.body.storage.chunkCount);
    let reconstructed = "";
    for (let index = 0; index < manifest.chunkCount; index += 1) {
      const chunk = await api(`/api/state?version=${manifest.version}&chunkIndex=${index}`);
      assert.equal(chunk.response.status, 200);
      reconstructed += chunk.text;
    }
    const reconstructedState = JSON.parse(reconstructed);
    assert.equal(reconstructedState.settings.datasets.integrationPayload.length, 850_000);
    assert.equal(reconstructedState.meta.integrationStep, "chunked-save");

    const lastAdminDemotion = await api("/api/users", {
      method: "PUT",
      body: { email: adminEmail, displayName: "Local Admin", role: "viewer", active: true }
    });
    assert.equal(lastAdminDemotion.response.status, 409);
    assert.equal(lastAdminDemotion.body.code, "LAST_ADMIN_REQUIRED");

    const createPlanner = await api("/api/users", {
      method: "PUT",
      body: { email: plannerEmail, displayName: "Planner", role: "planner", active: true }
    });
    assert.equal(createPlanner.response.status, 200, createPlanner.text);
    assert.equal(createPlanner.body.user.role, "planner");

    const plannerIdentity = await api("/api/identity", { email: plannerEmail });
    assert.equal(plannerIdentity.response.status, 200);
    assert.equal(plannerIdentity.body.role, "planner");
    assert.equal((await api("/api/state", { email: plannerEmail })).response.status, 200);
    assert.equal((await api("/api/users", { email: plannerEmail })).response.status, 403);

    const plannerCleanup = await api("/api/d1-cleanup", {
      method: "POST",
      email: plannerEmail,
      body: { confirm: "CLEANUP_D1", dryRun: true, keepVersions: 4 }
    });
    assert.equal(plannerCleanup.response.status, 403);

    const clientAudit = await api("/api/audit", {
      method: "POST",
      email: plannerEmail,
      body: { action: "integration_clicked", metadata: { clientSuppliedActor: "forged@example.test", value: 42 } }
    });
    assert.equal(clientAudit.response.status, 200);
    const audit = await api("/api/audit", { email: plannerEmail });
    assert.equal(audit.response.status, 200);
    const auditItem = audit.body.items.find(item => item.action === "client_event" && item.metadata?.event === "integration_clicked");
    assert.ok(auditItem);
    assert.equal(auditItem.actor_email, plannerEmail);
    assert.equal(auditItem.metadata.metadata.clientSuppliedActor, "forged@example.test");

    const revisionSave = await api("/api/revision-save", {
      method: "POST",
      email: plannerEmail,
      body: {
        projectId: "p-integration",
        revision: {
          id: "rev-1",
          revNo: "A",
          revisionDate: "2026-08-12",
          status: "Concept",
          description: "Integratietest",
          note: "Bewaar alleen projectgegevens",
          snapshot: { keep: "yes", capacity: { secret: true }, gantt: { hoursByDay: { a: 1 } } }
        }
      }
    });
    assert.equal(revisionSave.response.status, 200, revisionSave.text);
    const revisions = await api("/api/revisions?projectId=p-integration", { email: plannerEmail });
    assert.equal(revisions.response.status, 200);
    assert.equal(revisions.body.revisions.length, 1);
    assert.equal(revisions.body.revisions[0].snapshot.keep, "yes");
    assert.equal(revisions.body.revisions[0].snapshot.capacity, undefined);
    assert.equal(revisions.body.revisions[0].snapshot.gantt, undefined);
    const revisionDelete = await api("/api/revision-delete?projectId=p-integration&revisionId=rev-1", {
      method: "DELETE",
      email: plannerEmail
    });
    assert.equal(revisionDelete.response.status, 200);
    assert.equal(revisionDelete.body.deleted, true);

    const cleanupGet = await api("/api/d1-cleanup");
    assert.equal(cleanupGet.response.status, 405);
    const cleanupDryRun = await api("/api/d1-cleanup", {
      method: "POST",
      body: { confirm: "CLEANUP_D1", dryRun: true, keepVersions: 4 }
    });
    assert.equal(cleanupDryRun.response.status, 200);
    assert.equal(cleanupDryRun.body.dryRun, true);
    const cleanupNoToken = await api("/api/d1-cleanup", {
      method: "POST",
      body: { confirm: "CLEANUP_D1", dryRun: false, keepVersions: 4 }
    });
    assert.equal(cleanupNoToken.response.status, 403);
    assert.equal(cleanupNoToken.body.code, "MAINTENANCE_TOKEN_INVALID");
    const cleanupExecute = await api("/api/d1-cleanup", {
      method: "POST",
      headers: { "X-CWS-Maintenance-Token": "local-maintenance-token" },
      body: { confirm: "CLEANUP_D1", dryRun: false, keepVersions: 4 }
    });
    assert.equal(cleanupExecute.response.status, 200, cleanupExecute.text);
    assert.equal(cleanupExecute.body.dryRun, false);

    const staticResponse = await fetch(`${baseUrl}/`);
    assert.equal(staticResponse.status, 200);
    assert.match(staticResponse.headers.get("content-security-policy") || "", /default-src 'self'/);
    assert.equal(staticResponse.headers.get("x-content-type-options"), "nosniff");
    assert.equal(staticResponse.headers.get("access-control-allow-origin"), null);
    assert.equal((await fetch(`${baseUrl}/d1-backup-before-restore-2026-06-12.sql`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/CLOUDFLARE_INTERNE_TEST.md`)).status, 404);
  } finally {
    await stopChild(child);
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    assert.equal(db.prepare("SELECT version FROM app_state WHERE tenant_id='internal' AND state_key='main'").get().version, 4);
    assert.equal(db.prepare(`
      SELECT COUNT(*) AS count FROM (
        SELECT parent_version, COUNT(*) AS n
          FROM app_state_commits
         WHERE tenant_id='internal' AND state_key='main'
         GROUP BY parent_version HAVING n > 1
      )
    `).get().count, 0);
    assert.equal(db.prepare(`
      SELECT COUNT(*) AS count
        FROM app_state_chunks c
       WHERE NOT EXISTS (
         SELECT 1 FROM app_state_commits k
          WHERE k.tenant_id=c.tenant_id AND k.state_key=c.state_key AND k.version=c.version
       )
    `).get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM app_state_commits WHERE parent_version=2").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM app_revisions").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE actor_email=? AND action='client_event'").get(plannerEmail).count, 1);
  } finally {
    db.close();
    await rm(dbPath, { force: true });
    await rm(`${dbPath}-wal`, { force: true });
    await rm(`${dbPath}-shm`, { force: true });
  }
});
