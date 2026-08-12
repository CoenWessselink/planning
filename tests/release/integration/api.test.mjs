import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_STATE_JSON } from "../../../functions/api/_shared.js";
import { onRequestGet as getHealth } from "../../../functions/api/health.js";
import { onRequestGet as getIdentity } from "../../../functions/api/identity.js";
import { onRequestGet as getState, onRequestPut as putState } from "../../../functions/api/state.js";
import { onRequestPost as resetState } from "../../../functions/api/state-reset.js";
import { onRequestGet as getUsers, onRequestPut as putUser } from "../../../functions/api/users.js";
import { onRequestPost as cleanupD1 } from "../../../functions/api/d1-cleanup.js";
import { createMigratedDb } from "../helpers/d1-sqlite.mjs";
import { jsonBody, makeContext, makeRequest } from "../helpers/context.mjs";

function baseState() {
  return JSON.parse(DEFAULT_STATE_JSON);
}

function projectState(count) {
  const state = baseState();
  state.projects.order = [];
  state.projects.byId = {};
  for (let index = 0; index < count; index += 1) {
    const id = `p-${index}`;
    state.projects.order.push(id);
    state.projects.byId[id] = { id, name: `Project ${index}` };
  }
  return state;
}

test("health controleert het schema zonder runtime-DDL", async t => {
  const db = createMigratedDb();
  t.after(() => db.close());
  const response = await getHealth(makeContext(db, makeRequest("http://127.0.0.1/api/health")));
  assert.equal(response.status, 200);
  const body = await jsonBody(response);
  assert.equal(body.ok, true);
  assert.equal(body.schemaOk, true);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("alleen de expliciet geconfigureerde eerste admin wordt gebootstrapt", async t => {
  const db = createMigratedDb();
  t.after(() => db.close());

  const adminResponse = await getIdentity(makeContext(db, makeRequest("http://127.0.0.1/api/identity")));
  assert.equal(adminResponse.status, 200);
  assert.equal((await jsonBody(adminResponse)).role, "admin");

  const unknownResponse = await getIdentity(makeContext(
    db,
    makeRequest("http://127.0.0.1/api/identity", { email: "unknown@example.test" })
  ));
  assert.equal(unknownResponse.status, 403);
  assert.equal((await jsonBody(unknownResponse)).code, "USER_NOT_PROVISIONED");
  assert.equal(Number((await db.prepare("SELECT COUNT(*) AS count FROM app_users").first()).count), 1);
});

test("state-API gebruikt exacte CAS en retourneert 409 bij stale writes", async t => {
  const db = createMigratedDb();
  t.after(() => db.close());

  const read = await getState(makeContext(db, makeRequest("http://127.0.0.1/api/state?payload=raw-state")));
  assert.equal(read.status, 200);
  assert.equal(read.headers.get("x-cws-version"), "1");
  assert.equal(JSON.parse(await read.text()).schemaVersion, 12);

  const first = baseState();
  first.meta.label = "eerste";
  const save = await putState(makeContext(db, makeRequest("http://127.0.0.1/api/state", {
    method: "PUT",
    headers: { "X-CWS-State-Payload": "raw-state", "X-CWS-Base-Version": "1" },
    body: first
  })));
  assert.equal(save.status, 200);
  assert.equal((await jsonBody(save)).version, 2);

  const stale = baseState();
  stale.meta.label = "stale";
  const conflict = await putState(makeContext(db, makeRequest("http://127.0.0.1/api/state", {
    method: "PUT",
    headers: { "X-CWS-State-Payload": "raw-state", "X-CWS-Base-Version": "1" },
    body: stale
  })));
  assert.equal(conflict.status, 409);
  const conflictBody = await jsonBody(conflict);
  assert.equal(conflictBody.code, "STATE_VERSION_CONFLICT");
  assert.equal(conflictBody.currentVersion, 2);
});

test("catastrofale vervanging vereist admin-intentie en versiebevestiging", async t => {
  const db = createMigratedDb();
  t.after(() => db.close());
  await getIdentity(makeContext(db, makeRequest("http://127.0.0.1/api/identity")));

  const fill = await putState(makeContext(db, makeRequest("http://127.0.0.1/api/state", {
    method: "PUT",
    body: { state: projectState(30), baseVersion: 1 }
  })));
  assert.equal(fill.status, 200);

  const blocked = await putState(makeContext(db, makeRequest("http://127.0.0.1/api/state", {
    method: "PUT",
    body: { state: projectState(0), baseVersion: 2 }
  })));
  assert.equal(blocked.status, 409);
  assert.equal((await jsonBody(blocked)).code, "DESTRUCTIVE_CONFIRM_REQUIRED");

  const allowed = await putState(makeContext(db, makeRequest("http://127.0.0.1/api/state", {
    method: "PUT",
    headers: { "X-CWS-Destructive-Intent": "restore", "X-CWS-Destructive-Confirm": "2" },
    body: { state: projectState(0), baseVersion: 2 }
  })));
  assert.equal(allowed.status, 200);
  assert.equal((await jsonBody(allowed)).version, 3);
});

test("viewer kan lezen maar niet schrijven", async t => {
  const db = createMigratedDb();
  t.after(() => db.close());
  await getIdentity(makeContext(db, makeRequest("http://127.0.0.1/api/identity")));
  const createViewer = await putUser(makeContext(db, makeRequest("http://127.0.0.1/api/users", {
    method: "PUT",
    body: { email: "viewer@example.test", displayName: "Viewer", role: "viewer", active: true }
  })));
  assert.equal(createViewer.status, 200);

  const read = await getState(makeContext(db, makeRequest("http://127.0.0.1/api/state", { email: "viewer@example.test" })));
  assert.equal(read.status, 200);
  const write = await putState(makeContext(db, makeRequest("http://127.0.0.1/api/state", {
    method: "PUT",
    email: "viewer@example.test",
    body: { state: baseState(), baseVersion: 1 }
  })));
  assert.equal(write.status, 403);
  assert.equal((await jsonBody(write)).code, "STATE_WRITE_FORBIDDEN");
});

test("gebruikers-API en DB blokkeren degradatie van de laatste admin", async t => {
  const db = createMigratedDb();
  t.after(() => db.close());
  await getIdentity(makeContext(db, makeRequest("http://127.0.0.1/api/identity")));

  const blocked = await putUser(makeContext(db, makeRequest("http://127.0.0.1/api/users", {
    method: "PUT",
    body: { email: "admin@example.test", role: "viewer", active: true }
  })));
  assert.equal(blocked.status, 409);
  assert.equal((await jsonBody(blocked)).code, "LAST_ADMIN_REQUIRED");

  const second = await putUser(makeContext(db, makeRequest("http://127.0.0.1/api/users", {
    method: "PUT",
    body: { email: "admin2@example.test", role: "admin", active: true }
  })));
  assert.equal(second.status, 200);
  const changed = await putUser(makeContext(db, makeRequest("http://127.0.0.1/api/users", {
    method: "PUT",
    body: { email: "admin@example.test", role: "viewer", active: true }
  })));
  assert.equal(changed.status, 200);
  const users = await getUsers(makeContext(db, makeRequest("http://127.0.0.1/api/users", { email: "admin2@example.test" })));
  assert.equal(users.status, 200);
});

test("reset en D1-onderhoud zijn admin-only, POST-only en expliciet bevestigd", async t => {
  const db = createMigratedDb();
  t.after(() => db.close());
  await getIdentity(makeContext(db, makeRequest("http://127.0.0.1/api/identity")));

  const missingConfirm = await resetState(makeContext(db, makeRequest("http://127.0.0.1/api/state-reset", {
    method: "POST",
    body: { baseVersion: 1 }
  })));
  assert.equal(missingConfirm.status, 400);

  const reset = await resetState(makeContext(db, makeRequest("http://127.0.0.1/api/state-reset", {
    method: "POST",
    body: { confirm: "RESET_PLANNING", baseVersion: 1 }
  })));
  assert.equal(reset.status, 200);

  const badKeep = await cleanupD1(makeContext(db, makeRequest("http://127.0.0.1/api/d1-cleanup", {
    method: "POST",
    body: { confirm: "CLEANUP_D1", dryRun: true, keepVersions: 1 }
  })));
  assert.equal(badKeep.status, 400);
  assert.equal((await jsonBody(badKeep)).code, "KEEP_VERSIONS_INVALID");

  const dryRun = await cleanupD1(makeContext(db, makeRequest("http://127.0.0.1/api/d1-cleanup", {
    method: "POST",
    body: { confirm: "CLEANUP_D1", dryRun: true, keepVersions: 2 }
  })));
  assert.equal(dryRun.status, 200);
  assert.equal((await jsonBody(dryRun)).dryRun, true);

  const noToken = await cleanupD1(makeContext(db, makeRequest("http://127.0.0.1/api/d1-cleanup", {
    method: "POST",
    body: { confirm: "CLEANUP_D1", dryRun: false, keepVersions: 2 }
  })));
  assert.equal(noToken.status, 503);
  assert.equal((await jsonBody(noToken)).code, "MAINTENANCE_TOKEN_NOT_CONFIGURED");
});
