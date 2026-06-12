export const TENANT_ID = "internal";
export const STATE_KEY = "main";
export const MAX_STATE_BYTES = 4_500_000;

export const DEFAULT_STATE_JSON = JSON.stringify({
  schemaVersion: 12,
  meta: { dirty: false, updatedAt: null, lastAction: null },
  ui: { role: "Admin", lastApp: "projecten", lastTab: "Alle", week: { year: 2026, week: 15 }, planView: "week", scroll: {} },
  user: { name: "Gebruiker", role: "admin", dept: "" },
  roles: {
    admin: { name: "Admin", permissions: ["*"] },
    planner: { name: "Planner", permissions: ["view_projects", "edit_projects", "view_planning", "edit_planning", "auto_plan", "view_reports", "audit_view"] },
    viewer: { name: "Viewer", permissions: ["view_projects", "view_planning", "view_reports"] }
  },
  auditLog: [],
  projects: { order: [], byId: {}, deptHours: [] },
  resources: { order: [], byId: {} },
  departments: { order: [], byId: {} },
  tasks: { byProject: {} },
  allocations: { byWeek: {} },
  planbord: { byDeptWeek: {} },
  settings: { tables: {}, datasets: {} },
  gantt: { hoursByDay: {}, sourcesByDay: {} },
  ganttV2: { expanded: {}, byProject: {}, ui: { showCritical: false, showDeps: true, viewMode: "both", zoom: "week" } },
  projectOverview: { notesByProject: {}, statusByProject: {} },
  projectPlanning: { byWeek: {}, columns: [] },
  transport: { vehicles: [], drivers: [], locations: [], trips: [] },
  reports: { active: "cap_week", templates: [] }
});

const REQUIRED_SCHEMA = {
  app_state: ["tenant_id", "state_key", "state_json", "version", "updated_at", "updated_by"],
  audit_log: ["id", "tenant_id", "actor_email", "action", "entity_type", "entity_id", "metadata_json", "created_at"],
  app_users: ["email", "display_name", "role", "active", "created_at"]
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Accept,X-CWS-Base-Version,X-CWS-State-Payload,X-CWS-State-Response",
      "Access-Control-Expose-Headers": "X-CWS-OK,X-CWS-State-Exists,X-CWS-Version,X-CWS-Updated-At,X-CWS-Updated-By,X-CWS-User-Email,X-CWS-User-Role,X-CWS-User-Display-Name,X-CWS-Bytes"
    }
  });
}

export function rawStateResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body || "", {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Accept,X-CWS-Base-Version,X-CWS-State-Payload,X-CWS-State-Response",
      "Access-Control-Expose-Headers": "X-CWS-OK,X-CWS-State-Exists,X-CWS-Version,X-CWS-Updated-At,X-CWS-Updated-By,X-CWS-User-Email,X-CWS-User-Role,X-CWS-User-Display-Name,X-CWS-Bytes",
      ...extraHeaders
    }
  });
}

export function isLocalDev(request) {
  try {
    const url = new URL(request.url);
    return ["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname) || url.hostname.endsWith(".local");
  } catch (_) {
    return false;
  }
}

export function actorEmail(request) {
  return request.headers.get("CF-Access-Authenticated-User-Email") || (isLocalDev(request) ? "local-dev@cws.test" : null);
}

export function requireActorEmail(request) {
  return actorEmail(request);
}

async function tableInfo(db, tableName) {
  const result = await db.prepare(`PRAGMA table_info(${tableName})`).all();
  return result.results || [];
}

function hasColumns(info, cols) {
  const names = info.map(row => row.name);
  return cols.every(c => names.includes(c));
}

function hasCompositePrimaryKey(info, cols) {
  const pk = info.filter(row => Number(row.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk)).map(row => row.name);
  return pk.length === cols.length && cols.every((c, i) => pk[i] === c);
}

async function createCanonicalTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS app_state (
    tenant_id TEXT NOT NULL,
    state_key TEXT NOT NULL,
    state_json TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT,
    PRIMARY KEY (tenant_id, state_key)
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    actor_email TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS app_users (
    email TEXT PRIMARY KEY,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'viewer',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

async function migrateAppStateIfNeeded(db) {
  const info = await tableInfo(db, "app_state");
  if (!info.length) return;
  if (hasColumns(info, REQUIRED_SCHEMA.app_state) && hasCompositePrimaryKey(info, ["tenant_id", "state_key"])) return;

  let legacyState = null;
  try {
    const row = await db.prepare("SELECT state_json FROM app_state ORDER BY updated_at DESC LIMIT 1").first();
    if (row?.state_json) legacyState = row.state_json;
  } catch (_) {
    try {
      const row = await db.prepare("SELECT state_json FROM app_state LIMIT 1").first();
      if (row?.state_json) legacyState = row.state_json;
    } catch (_) {}
  }

  await db.prepare("DROP TABLE IF EXISTS app_state_legacy").run();
  await db.prepare("ALTER TABLE app_state RENAME TO app_state_legacy").run();
  await db.prepare(`CREATE TABLE app_state (
    tenant_id TEXT NOT NULL,
    state_key TEXT NOT NULL,
    state_json TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT,
    PRIMARY KEY (tenant_id, state_key)
  )`).run();

  await db.prepare(`INSERT INTO app_state (tenant_id, state_key, state_json, version, updated_by)
    VALUES (?, ?, ?, 1, ?)`)
    .bind(TENANT_ID, STATE_KEY, legacyState || DEFAULT_STATE_JSON, "schema-reconcile")
    .run();
}

async function migrateAuditIfNeeded(db) {
  const info = await tableInfo(db, "audit_log");
  if (!info.length) return;
  if (hasColumns(info, REQUIRED_SCHEMA.audit_log)) return;
  await db.prepare("DROP TABLE IF EXISTS audit_log_legacy").run();
  await db.prepare("ALTER TABLE audit_log RENAME TO audit_log_legacy").run();
  await db.prepare(`CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    actor_email TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

async function migrateUsersIfNeeded(db) {
  const info = await tableInfo(db, "app_users");
  if (!info.length) return;
  if (hasColumns(info, REQUIRED_SCHEMA.app_users)) return;
  let rows = [];
  try {
    const result = await db.prepare("SELECT email, name, role, active FROM app_users").all();
    rows = result.results || [];
  } catch (_) {}
  await db.prepare("DROP TABLE IF EXISTS app_users_legacy").run();
  await db.prepare("ALTER TABLE app_users RENAME TO app_users_legacy").run();
  await db.prepare(`CREATE TABLE app_users (
    email TEXT PRIMARY KEY,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'viewer',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  for (const row of rows) {
    if (!row.email) continue;
    await db.prepare("INSERT OR IGNORE INTO app_users (email, display_name, role, active) VALUES (?, ?, ?, ?)")
      .bind(row.email, row.name || String(row.email).split("@")[0], row.role || "viewer", row.active === 0 ? 0 : 1)
      .run();
  }
}

export async function ensureSchema(db) {
  // Fully self-healing for the internal Cloudflare Pages test. This removes the need
  // to manually run SQL in the D1 Console after a fresh database or old trial schema.
  await createCanonicalTables(db);
  await migrateAppStateIfNeeded(db);
  await migrateAuditIfNeeded(db);
  await migrateUsersIfNeeded(db);
  await createCanonicalTables(db);
  await ensureSeedState(db);
  return verifyRequiredSchema(db);
}

export async function verifyRequiredSchema(db) {
  const errors = [];
  for (const [tableName, columns] of Object.entries(REQUIRED_SCHEMA)) {
    const info = await tableInfo(db, tableName);
    const existing = info.map(row => row.name);
    if (!existing.length) {
      errors.push(`Tabel ${tableName} ontbreekt.`);
      continue;
    }
    const missing = columns.filter(column => !existing.includes(column));
    if (missing.length) errors.push(`Tabel ${tableName} mist kolom(men): ${missing.join(", ")}.`);
    if (tableName === "app_state" && !hasCompositePrimaryKey(info, ["tenant_id", "state_key"])) {
      errors.push("Tabel app_state mist samengestelde primary key (tenant_id, state_key).");
    }
  }
  return { ok: errors.length === 0, errors };
}

export async function ensureSeedState(db) {
  await db.prepare(
    `INSERT OR IGNORE INTO app_state
      (tenant_id, state_key, state_json, version, updated_by)
     VALUES (?, ?, ?, 1, ?)`
  ).bind(TENANT_ID, STATE_KEY, DEFAULT_STATE_JSON, "system").run();
}

export async function getOrCreateUser(db, email) {
  const existing = await db.prepare(
    "SELECT email, display_name, role, active FROM app_users WHERE email = ?"
  ).bind(email).first();
  if (existing) return existing;

  const countRow = await db.prepare("SELECT COUNT(*) AS count FROM app_users").first();
  const role = Number(countRow?.count || 0) === 0 ? "admin" : "planner";
  const displayName = String(email || "").split("@")[0] || email;
  await db.prepare(
    "INSERT INTO app_users (email, display_name, role, active) VALUES (?, ?, ?, 1)"
  ).bind(email, displayName, role).run();
  return { email, display_name: displayName, role, active: 1 };
}

export function canWriteState(user) {
  return Boolean(user?.active) && ["admin", "planner"].includes(String(user.role || "").toLowerCase());
}

export function canViewAudit(user) {
  return Boolean(user?.active) && ["admin", "planner"].includes(String(user.role || "").toLowerCase());
}

export async function writeAudit(db, email, action, metadata = {}, entityType = null, entityId = null) {
  await db.prepare(
    `INSERT INTO audit_log
      (tenant_id, actor_email, action, entity_type, entity_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    TENANT_ID,
    email,
    action,
    entityType,
    entityId,
    JSON.stringify(metadata || {})
  ).run();
}
