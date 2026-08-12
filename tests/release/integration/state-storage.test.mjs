import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_STATE_JSON, verifyRequiredSchema } from "../../../functions/api/_shared.js";
import {
  CHUNK_THRESHOLD_BYTES,
  RETAIN_VERSIONS,
  readActiveState,
  writeStateCAS
} from "../../../functions/api/_state_storage.js";
import { createMigratedDb } from "../helpers/d1-sqlite.mjs";

function stateWith(label, extra = {}) {
  const state = JSON.parse(DEFAULT_STATE_JSON);
  state.meta = { ...state.meta, label };
  return Object.assign(state, extra);
}

test("alle migraties leveren het vereiste niet-destructieve schema", async t => {
  const db = createMigratedDb();
  t.after(() => db.close());
  const schema = await verifyRequiredSchema(db);
  assert.deepEqual(schema, { ok: true, errors: [] });
  const active = await readActiveState(db);
  assert.equal(active.exists, true);
  assert.equal(active.version, 1);
  assert.equal(active.state.schemaVersion, 12);
});

test("exacte baseVersion schrijft één immutable versie en stale saves conflicteren", async t => {
  const db = createMigratedDb();
  t.after(() => db.close());

  const saved = await writeStateCAS(db, { state: stateWith("eerste"), baseVersion: 1, email: "planner@example.test" });
  assert.equal(saved.ok, true);
  assert.equal(saved.version, 2);
  assert.equal(saved.chunked, false);

  const active = await readActiveState(db);
  assert.equal(active.version, 2);
  assert.equal(active.state.meta.label, "eerste");

  const stale = await writeStateCAS(db, { state: stateWith("stale"), baseVersion: 1, email: "planner@example.test" });
  assert.deepEqual(stale, { ok: false, conflict: true, currentVersion: 2, baseVersion: 1 });
  const commits = await db.prepare("SELECT version, parent_version FROM app_state_commits ORDER BY version").all();
  assert.deepEqual(commits.results.map(row => [row.version, row.parent_version]), [[1, 0], [2, 1]]);
  assert.equal((await readActiveState(db)).state.meta.label, "eerste");
});

test("twee gelijktijdige writers op dezelfde basis leveren precies één winnaar", async t => {
  const db = createMigratedDb();
  t.after(() => db.close());
  const [left, right] = await Promise.all([
    writeStateCAS(db, { state: stateWith("writer-links"), baseVersion: 1, email: "left@example.test" }),
    writeStateCAS(db, { state: stateWith("writer-rechts"), baseVersion: 1, email: "right@example.test" })
  ]);
  const winners = [left, right].filter(result => result.ok);
  const conflicts = [left, right].filter(result => result.conflict);
  assert.equal(winners.length, 1);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].currentVersion, 2);
  const active = await readActiveState(db);
  assert.equal(active.version, 2);
  assert.ok(["writer-links", "writer-rechts"].includes(active.state.meta.label));
  assert.equal(Number((await db.prepare("SELECT COUNT(*) AS count FROM app_state_commits WHERE version = 2").first()).count), 1);
});

test("grote states worden atomair gechunkt en met checksum teruggelezen", async t => {
  const db = createMigratedDb();
  t.after(() => db.close());
  const state = stateWith("groot");
  state.settings.largeNote = "x".repeat(CHUNK_THRESHOLD_BYTES + 120_000);

  const saved = await writeStateCAS(db, { state, baseVersion: 1, email: "planner@example.test" });
  assert.equal(saved.ok, true);
  assert.equal(saved.chunked, true);
  assert.ok(saved.chunkCount >= 2);

  const active = await readActiveState(db);
  assert.equal(active.chunked, true);
  assert.equal(active.chunkCount, saved.chunkCount);
  assert.equal(active.checksum, saved.checksum);
  assert.equal(active.state.settings.largeNote.length, CHUNK_THRESHOLD_BYTES + 120_000);
  const chunkRows = await db.prepare("SELECT COUNT(*) AS count FROM app_state_chunks WHERE version = 2").first();
  assert.equal(Number(chunkRows.count), saved.chunkCount);
});

test("een chunkfout draait commit, chunks en actieve pointer volledig terug", async t => {
  const db = createMigratedDb();
  t.after(() => db.close());
  const before = await readActiveState(db);
  const state = stateWith("rollback");
  state.settings.largeNote = "r".repeat(CHUNK_THRESHOLD_BYTES + 200_000);
  db.failBatchAt = 2;
  await assert.rejects(
    () => writeStateCAS(db, { state, baseVersion: 1, email: "planner@example.test" }),
    /INJECTED_BATCH_FAILURE_2/
  );
  db.failBatchAt = null;

  const after = await readActiveState(db);
  assert.equal(after.version, before.version);
  assert.equal(after.state.meta.label, before.state.meta.label);
  assert.equal(Number((await db.prepare("SELECT COUNT(*) AS count FROM app_state_commits WHERE version = 2").first()).count), 0);
  assert.equal(Number((await db.prepare("SELECT COUNT(*) AS count FROM app_state_chunks WHERE version = 2").first()).count), 0);
});

test("corrupte actieve chunks herstellen alleen-lezen vanuit de laatste geldige commit", async t => {
  const db = createMigratedDb();
  t.after(() => db.close());
  await writeStateCAS(db, { state: stateWith("veilig"), baseVersion: 1, email: "planner@example.test" });
  const large = stateWith("corrupt-actief");
  large.settings.largeNote = "z".repeat(CHUNK_THRESHOLD_BYTES + 100_000);
  await writeStateCAS(db, { state: large, baseVersion: 2, email: "planner@example.test" });
  await db.prepare("UPDATE app_state_chunks SET chunk_text = 'beschadigd' WHERE version = 3 AND chunk_index = 0").run();

  const recovered = await readActiveState(db, { recover: true });
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.activeVersion, 3);
  assert.equal(recovered.recoveredFromVersion, 2);
  assert.equal(recovered.state.meta.label, "veilig");
  await assert.rejects(() => readActiveState(db, { recover: false }), error => ["STATE_BYTES_MISMATCH", "STATE_CHECKSUM_MISMATCH"].includes(error?.code));
});

test("retentie bewaart maximaal de laatste versies", async t => {
  const db = createMigratedDb();
  t.after(() => db.close());
  let baseVersion = 1;
  for (let index = 0; index < RETAIN_VERSIONS + 4; index += 1) {
    const result = await writeStateCAS(db, { state: stateWith(`v-${index}`), baseVersion, email: "planner@example.test" });
    assert.equal(result.ok, true);
    baseVersion = result.version;
  }
  const rows = await db.prepare("SELECT version FROM app_state_commits ORDER BY version").all();
  assert.equal(rows.results.length, RETAIN_VERSIONS);
  assert.equal(rows.results.at(-1).version, baseVersion);
});

test("D1-triggers beschermen de laatste actieve beheerder", async t => {
  const db = createMigratedDb();
  t.after(() => db.close());
  await db.prepare("INSERT INTO app_users(email, display_name, role, active) VALUES(?, ?, 'admin', 1)")
    .bind("admin@example.test", "Admin").run();
  await assert.rejects(
    () => db.prepare("UPDATE app_users SET active = 0 WHERE email = ?").bind("admin@example.test").run(),
    /last_admin|LAST_ADMIN/i
  );
  await db.prepare("INSERT INTO app_users(email, display_name, role, active) VALUES(?, ?, 'admin', 1)")
    .bind("admin2@example.test", "Admin 2").run();
  const changed = await db.prepare("UPDATE app_users SET role = 'viewer' WHERE email = ?").bind("admin@example.test").run();
  assert.equal(changed.meta.changes, 1);
});
