export const TENANT_ID = "internal";
export const STATE_KEY = "main";
export const MAX_STATE_BYTES = 4_500_000;

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
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

export function hasAccessHeader(request) {
  return Boolean(request.headers.get("CF-Access-Authenticated-User-Email"));
}

export const DEFAULT_STATE_JSON = '{"schemaVersion":12,"projects":{"order":[],"byId":{},"deptHours":[]},"resources":{"order":[],"byId":{}},"departments":{"order":[],"byId":{}},"settings":{"tables":{}},"gantt":{"hoursByDay":{},"sourcesByDay":{}},"ganttV2":{"expanded":{},"byProject":{},"ui":{"showCritical":false}},"projectOverview":{"notesByProject":{},"statusByProject":{}},"projectPlanning":{"byWeek":{},"columns":[]},"transport":{"vehicles":[],"drivers":[],"locations":[],"trips":[]},"auditLog":[]}';

const REQUIRED_SCHEMA = {
  app_state: ["tenant_id", "state_key", "state_json", "version", "updated_at", "updated_by"],
  audit_log: ["id", "tenant_id", "actor_email", "action", "entity_type", "entity_id", "metadata_json", "created_at"],
  app_users: ["email", "display_name", "role", "active", "created_at"]
};

async function columnsFor(db, tableName) {
  const result = await db.prepare(`PRAGMA table_info(${tableName})`).all();
  return (result.results || []).map(row => row.name);
}

export async function verifyRequiredSchema(db) {
  const errors = [];
  for (const [tableName, columns] of Object.entries(REQUIRED_SCHEMA)) {
    const existing = await columnsFor(db, tableName);
    if (!existing.length) {
      errors.push(`Tabel ${tableName} ontbreekt.`);
      continue;
    }
    const missing = columns.filter(column => !existing.includes(column));
    if (missing.length) errors.push(`Tabel ${tableName} mist kolom(men): ${missing.join(", ")}.`);
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
  const role = Number(countRow?.count || 0) === 0 ? "admin" : "viewer";
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
