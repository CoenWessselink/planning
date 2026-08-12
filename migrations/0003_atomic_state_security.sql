-- CWS Planning atomic state/CAS and account-safety upgrade.
PRAGMA foreign_keys = ON;

-- Deze migratie moet ook zelfstandig werken op installaties waarop de oude
-- 0001/0002 al in het D1-migratiejournaal staan.
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
  version INTEGER NOT NULL CHECK(version >= 1),
  parent_version INTEGER NOT NULL CHECK(parent_version >= 0),
  state_json TEXT NOT NULL,
  checksum TEXT NOT NULL DEFAULT '',
  bytes INTEGER NOT NULL CHECK(bytes >= 0),
  chunk_count INTEGER NOT NULL DEFAULT 0 CHECK(chunk_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL,
  PRIMARY KEY (tenant_id, state_key, version),
  UNIQUE (tenant_id, state_key, parent_version)
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

INSERT OR IGNORE INTO app_state_commits (
  tenant_id, state_key, version, parent_version, state_json, checksum, bytes, chunk_count, created_at, created_by
)
SELECT tenant_id,
       state_key,
       version,
       CASE WHEN version > 1 THEN version - 1 ELSE 0 END,
       state_json,
       '',
       length(CAST(state_json AS BLOB)),
       CASE
         WHEN json_valid(state_json) AND COALESCE(json_extract(state_json, '$.__cwsChunkedState'), 0) = 1
           THEN COALESCE(json_extract(state_json, '$.chunkCount'), 0)
         ELSE 0
       END,
       updated_at,
       COALESCE(updated_by, 'migration')
  FROM app_state;

CREATE INDEX IF NOT EXISTS idx_state_commits_parent ON app_state_commits (tenant_id, state_key, parent_version);
CREATE UNIQUE INDEX IF NOT EXISTS idx_state_commits_parent_unique ON app_state_commits (tenant_id, state_key, parent_version);
CREATE INDEX IF NOT EXISTS idx_state_chunks_lookup ON app_state_chunks (tenant_id, state_key, version, chunk_index);
CREATE INDEX IF NOT EXISTS idx_state_commits_recent ON app_state_commits (tenant_id, state_key, version DESC);
CREATE INDEX IF NOT EXISTS idx_audit_recent ON audit_log (tenant_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_revisions_recent ON app_revisions (tenant_id, project_id, revision_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_active_role ON app_users (active, role);

DROP TRIGGER IF EXISTS cws_state_commit_parent_guard;
CREATE TRIGGER cws_state_commit_parent_guard
BEFORE INSERT ON app_state_commits
FOR EACH ROW
WHEN NEW.parent_version != COALESCE((
  SELECT version FROM app_state
   WHERE tenant_id = NEW.tenant_id AND state_key = NEW.state_key
), 0)
BEGIN
  SELECT RAISE(ABORT, 'CWS_VERSION_CONFLICT');
END;

DROP TRIGGER IF EXISTS cws_state_version_guard;
CREATE TRIGGER cws_state_version_guard
BEFORE UPDATE OF version, state_json ON app_state
FOR EACH ROW
WHEN NEW.version != OLD.version + 1
  OR NOT EXISTS (
    SELECT 1 FROM app_state_commits
     WHERE tenant_id = NEW.tenant_id
       AND state_key = NEW.state_key
       AND version = NEW.version
       AND parent_version = OLD.version
  )
BEGIN
  SELECT RAISE(ABORT, 'STATE_VERSION_GUARD');
END;

DROP TRIGGER IF EXISTS cws_prevent_last_admin_update;
CREATE TRIGGER cws_prevent_last_admin_update
BEFORE UPDATE OF role, active ON app_users
FOR EACH ROW
WHEN OLD.role = 'admin' AND OLD.active = 1
 AND (NEW.role != 'admin' OR NEW.active != 1)
 AND (SELECT COUNT(*) FROM app_users WHERE role = 'admin' AND active = 1) <= 1
BEGIN
  SELECT RAISE(ABORT, 'CWS_LAST_ADMIN_REQUIRED');
END;

DROP TRIGGER IF EXISTS cws_prevent_last_admin_delete;
CREATE TRIGGER cws_prevent_last_admin_delete
BEFORE DELETE ON app_users
FOR EACH ROW
WHEN OLD.role = 'admin' AND OLD.active = 1
 AND (SELECT COUNT(*) FROM app_users WHERE role = 'admin' AND active = 1) <= 1
BEGIN
  SELECT RAISE(ABORT, 'CWS_LAST_ADMIN_REQUIRED');
END;
