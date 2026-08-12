PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_state (
  tenant_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  state_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT,
  PRIMARY KEY (tenant_id, state_key)
);

CREATE TABLE IF NOT EXISTS app_state_chunks (
  tenant_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  chunk_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, state_key, version, chunk_index)
);

CREATE TABLE IF NOT EXISTS app_state_commits (
  tenant_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  parent_version INTEGER NOT NULL CHECK (parent_version >= 0),
  state_json TEXT NOT NULL,
  checksum TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes >= 0),
  chunk_count INTEGER NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL,
  PRIMARY KEY (tenant_id, state_key, version),
  UNIQUE (tenant_id, state_key, parent_version)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_users (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_revisions (
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  rev_no TEXT,
  revision_date TEXT,
  status TEXT,
  description TEXT,
  note TEXT,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL,
  PRIMARY KEY (tenant_id, project_id, revision_id)
);

CREATE INDEX IF NOT EXISTS idx_state_chunks_lookup ON app_state_chunks (tenant_id, state_key, version, chunk_index);
CREATE INDEX IF NOT EXISTS idx_state_commits_recent ON app_state_commits (tenant_id, state_key, version DESC);
CREATE INDEX IF NOT EXISTS idx_audit_recent ON audit_log (tenant_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_revisions_recent ON app_revisions (tenant_id, project_id, revision_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_active_role ON app_users (active, role);

CREATE TRIGGER IF NOT EXISTS trg_app_users_keep_last_admin_update
BEFORE UPDATE OF role, active ON app_users
WHEN OLD.role = 'admin' AND OLD.active = 1
 AND (NEW.role <> 'admin' OR NEW.active <> 1)
 AND (SELECT COUNT(*) FROM app_users WHERE role = 'admin' AND active = 1) <= 1
BEGIN
  SELECT RAISE(ABORT, 'last_active_admin');
END;

CREATE TRIGGER IF NOT EXISTS trg_app_users_keep_last_admin_delete
BEFORE DELETE ON app_users
WHEN OLD.role = 'admin' AND OLD.active = 1
 AND (SELECT COUNT(*) FROM app_users WHERE role = 'admin' AND active = 1) <= 1
BEGIN
  SELECT RAISE(ABORT, 'last_active_admin');
END;

INSERT OR IGNORE INTO app_state (
  tenant_id, state_key, state_json, version, updated_by
) VALUES (
  'internal',
  'main',
  '{"schemaVersion":12,"meta":{"dirty":false,"updatedAt":null,"lastAction":null},"ui":{"role":"Admin","lastApp":"projecten","lastTab":"Alle","week":{"year":2026,"week":15},"planView":"week","scroll":{}},"user":{"name":"Gebruiker","role":"admin","dept":""},"roles":{"admin":{"name":"Admin","permissions":["*"]},"planner":{"name":"Planner","permissions":["view_projects","edit_projects","view_planning","edit_planning","auto_plan","view_reports","audit_view","import_data"]},"viewer":{"name":"Viewer","permissions":["view_projects","view_planning","view_reports"]}},"auditLog":[],"projects":{"order":[],"byId":{},"deptHours":[]},"resources":{"order":[],"byId":{}},"departments":{"order":[],"byId":{}},"tasks":{"byProject":{}},"allocations":{"byWeek":{}},"planbord":{"byDeptWeek":{}},"settings":{"tables":{},"datasets":{}},"gantt":{"hoursByDay":{},"sourcesByDay":{}},"ganttV2":{"expanded":{},"byProject":{},"ui":{"showCritical":false,"showDeps":true,"viewMode":"both","zoom":"week"}},"projectOverview":{"notesByProject":{},"statusByProject":{}},"projectPlanning":{"byWeek":{},"columns":[]},"transport":{"vehicles":[],"drivers":[],"locations":[],"trips":[]},"reports":{"active":"cap_week","templates":[]}}',
  1,
  'system'
);
