import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

test("0003 migreert het historische schema zonder data te wissen", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE app_state (
        tenant_id TEXT NOT NULL,
        state_key TEXT NOT NULL,
        state_json TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_by TEXT,
        PRIMARY KEY (tenant_id, state_key)
      );
      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        actor_email TEXT,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE app_users (
        email TEXT PRIMARY KEY,
        display_name TEXT,
        role TEXT NOT NULL DEFAULT 'viewer',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE app_state_chunks (
        tenant_id TEXT NOT NULL,
        state_key TEXT NOT NULL,
        version INTEGER NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tenant_id, state_key, version, chunk_index)
      );
      INSERT INTO app_state (tenant_id, state_key, state_json, version, updated_by)
      VALUES ('internal', 'main', '{"schemaVersion":12,"projects":{"order":["p1"],"byId":{"p1":{"id":"p1"}}}}', 7, 'historical-user');
      INSERT INTO app_users (email, display_name, role, active)
      VALUES ('admin@example.test', 'Admin', 'admin', 1);
      INSERT INTO audit_log (tenant_id, actor_email, action, metadata_json)
      VALUES ('internal', 'admin@example.test', 'historical_event', '{}');
    `);

    const migration = await readFile(new URL("../../../migrations/0003_atomic_state_security.sql", import.meta.url), "utf8");
    db.exec(migration);

    const state = db.prepare("SELECT version, updated_by, state_json FROM app_state WHERE tenant_id='internal' AND state_key='main'").get();
    assert.equal(state.version, 7);
    assert.equal(state.updated_by, "historical-user");
    assert.match(state.state_json, /\"p1\"/);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_log").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM app_users").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM app_state_commits WHERE version=7").get().count, 1);
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_revisions'").get());

    assert.throws(
      () => db.prepare("UPDATE app_users SET role='viewer' WHERE email='admin@example.test'").run(),
      /CWS_LAST_ADMIN_REQUIRED|last_active_admin/
    );
  } finally {
    db.close();
  }
});
