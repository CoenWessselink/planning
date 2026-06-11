CREATE TABLE IF NOT EXISTS app_state (
  tenant_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  state_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT,
  PRIMARY KEY (tenant_id, state_key)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_users (
  email TEXT PRIMARY KEY,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO app_state (
  tenant_id,
  state_key,
  state_json,
  version,
  updated_by
) VALUES (
  'internal',
  'main',
  '{"schemaVersion":12,"projects":{"order":[],"byId":{},"deptHours":[]},"resources":{"order":[],"byId":{}},"departments":{"order":[],"byId":{}},"settings":{"tables":{}},"gantt":{"hoursByDay":{},"sourcesByDay":{}},"ganttV2":{"expanded":{},"byProject":{},"ui":{"showCritical":false}},"projectOverview":{"notesByProject":{},"statusByProject":{}},"projectPlanning":{"byWeek":{},"columns":[]},"transport":{"vehicles":[],"drivers":[],"locations":[],"trips":[]},"auditLog":[]}',
  1,
  'system'
);
