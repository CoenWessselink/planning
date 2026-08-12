import { authenticateRequest, isLocalRequest } from "./_auth.js";
import { byteLength, httpError, normalizeEmail, safeMetadata } from "./_validation.js";

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
    planner: { name: "Planner", permissions: ["view_projects", "edit_projects", "view_planning", "edit_planning", "auto_plan", "view_reports", "audit_view", "import_data"] },
    viewer: { name: "Viewer", permissions: ["view_projects", "view_planning", "view_reports"] }
  },
  auditLog: [],
  projects: { order: [], byId: {}, deptHours: [] },
  resources: { order: [], byId: {} },
  departments: { order: [], byId: {} },
  tasks: { byProject: {} },
  allocations: { byWeek: {} },
  planbord: { byDeptWeek: {} },
  settings: { tables: {}, datasets: {}, logo: null },
  gantt: { hoursByDay: {}, sourcesByDay: {} },
  ganttV2: { expanded: {}, byProject: {}, ui: { showCritical: false, showDeps: true, viewMode: "both", zoom: "week" } },
  projectOverview: { notesByProject: {}, statusByProject: {} },
  projectPlanning: { byWeek: {}, columns: [] },
  transport: { vehicles: [], drivers: [], locations: [], trips: [] },
  reports: { active: "cap_week", templates: [] }
});

const REQUIRED_SCHEMA = {
  app_state: ["tenant_id", "state_key", "state_json", "version", "updated_at", "updated_by"],
  app_state_chunks: ["tenant_id", "state_key", "version", "chunk_index", "chunk_text", "created_at"],
  app_state_commits: ["tenant_id", "state_key", "version", "parent_version", "state_json", "checksum", "bytes", "chunk_count", "created_at", "created_by"],
  audit_log: ["id", "tenant_id", "actor_email", "action", "entity_type", "entity_id", "metadata_json", "created_at"],
  app_users: ["email", "display_name", "role", "active", "created_at"],
  app_revisions: ["tenant_id", "project_id", "revision_id", "rev_no", "revision_date", "status", "description", "note", "snapshot_json", "created_at", "created_by"]
};

export const SECURITY_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; worker-src 'self' blob:; manifest-src 'self'"
});

export function responseHeaders(extra = {}) {
  return {
    "Cache-Control": "no-store",
    ...SECURITY_HEADERS,
    ...extra
  };
}

export function applySecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  if (!headers.has("Cache-Control") && headers.get("Content-Type")?.includes("application/json")) headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders({ "Content-Type": "application/json; charset=utf-8", ...extraHeaders })
  });
}

export function rawStateResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body || "", {
    status,
    headers: responseHeaders({ "Content-Type": "application/json; charset=utf-8", ...extraHeaders })
  });
}

export function optionsResponse(methods = "GET,OPTIONS") {
  return new Response(null, {
    status: 204,
    headers: responseHeaders({ Allow: methods })
  });
}

export function errorResponse(error, fallbackStatus = 500, extra = {}) {
  const status = Number(error?.status || fallbackStatus) || fallbackStatus;
  const publicError = status >= 500 && !error?.status
    ? "Onverwachte serverfout."
    : (error?.message || String(error || "Onbekende fout"));
  const code = status >= 500 && !error?.code ? "INTERNAL_ERROR" : (error?.code || "REQUEST_FAILED");
  if (status >= 500) console.error("CWS API error", { code, message:error?.message || String(error), stack:error?.stack });
  return json({
    ok: false,
    error: publicError,
    code,
    ...(status < 500 && error?.details ? { details: error.details } : {}),
    ...extra
  }, status);
}

export function assertSameOrigin(request, env = {}) {
  const method = String(request.method || "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;
  const url = new URL(request.url);
  const origin = String(request.headers.get("Origin") || "").trim();
  if (origin) {
    if (origin !== url.origin) throw httpError("Cross-origin wijzigingsverzoek geweigerd.", 403, "ORIGIN_FORBIDDEN");
    return true;
  }
  const fetchSite = String(request.headers.get("Sec-Fetch-Site") || "").toLowerCase();
  if (fetchSite === "same-origin") return true;
  if (isLocalRequest(request) && String(env.CWS_LOCAL_AUTH_BYPASS || "").toLowerCase() === "true") return true;
  if (!fetchSite) throw httpError("Origin-header ontbreekt bij wijzigingsverzoek.", 403, "ORIGIN_REQUIRED");
  throw httpError("Onbetrouwbare request-origin geweigerd.", 403, "ORIGIN_FORBIDDEN");
}

async function tableInfo(db, tableName) {
  const safeName = String(tableName).replace(/[^a-zA-Z0-9_]/g, "");
  const result = await db.prepare(`PRAGMA table_info(${safeName})`).all();
  return result.results || [];
}

function hasCompositePrimaryKey(info, cols) {
  const pk = info.filter(row => Number(row.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk)).map(row => row.name);
  return pk.length === cols.length && cols.every((col, index) => pk[index] === col);
}

export async function verifyRequiredSchema(db) {
  const errors = [];
  for (const [tableName, columns] of Object.entries(REQUIRED_SCHEMA)) {
    let info = [];
    try { info = await tableInfo(db, tableName); } catch (_) {}
    const existing = info.map(row => row.name);
    if (!existing.length) {
      errors.push(`Tabel ${tableName} ontbreekt.`);
      continue;
    }
    const missing = columns.filter(column => !existing.includes(column));
    if (missing.length) errors.push(`Tabel ${tableName} mist kolom(men): ${missing.join(", ")}.`);
    if (["app_state", "app_state_chunks", "app_state_commits", "app_revisions"].includes(tableName)) {
      const expected = {
        app_state: ["tenant_id", "state_key"],
        app_state_chunks: ["tenant_id", "state_key", "version", "chunk_index"],
        app_state_commits: ["tenant_id", "state_key", "version"],
        app_revisions: ["tenant_id", "project_id", "revision_id"]
      }[tableName];
      if (!hasCompositePrimaryKey(info, expected)) errors.push(`Tabel ${tableName} heeft niet de vereiste primary key.`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export async function requireRuntimeSchema(db) {
  const schema = await verifyRequiredSchema(db);
  if (!schema.ok) {
    throw httpError("D1-schema is niet gemigreerd. Voer de meegeleverde migraties uit.", 503, "D1_MIGRATION_REQUIRED", schema.errors);
  }
  return schema;
}

// Compatibiliteitsnaam voor oudere imports; voert bewust geen DDL of datamigratie uit.
export const ensureSchema = requireRuntimeSchema;

export async function getUser(db, email) {
  return db.prepare("SELECT email, display_name, role, active, created_at FROM app_users WHERE lower(email) = lower(?) LIMIT 1")
    .bind(email).first();
}

export async function getAuthorizedUser(db, email, env = {}) {
  const normalized = normalizeEmail(email);
  let user = await getUser(db, normalized);
  if (!user) {
    const bootstrapEmails = new Set(
      [env.CWS_BOOTSTRAP_ADMIN_EMAIL, env.CWS_BOOTSTRAP_ADMIN_EMAILS]
        .flatMap(value => String(value || "").split(/[\s,;]+/))
        .map(value => value.trim().toLowerCase())
        .filter(Boolean)
    );
    const countRow = await db.prepare("SELECT COUNT(*) AS count FROM app_users").first();
    if (Number(countRow?.count || 0) === 0 && bootstrapEmails.has(normalized)) {
      const displayName = normalized.split("@")[0].slice(0, 100);
      await db.prepare("INSERT OR IGNORE INTO app_users (email, display_name, role, active) VALUES (?, ?, 'admin', 1)")
        .bind(normalized, displayName).run();
      user = await getUser(db, normalized);
    }
  }
  if (!user) throw httpError("Gebruiker is niet geautoriseerd voor CWS Planning.", 403, "USER_NOT_PROVISIONED");
  if (!Number(user.active)) throw httpError("Gebruiker is inactief.", 403, "USER_INACTIVE");
  return user;
}

// Compatibiliteitsnaam; onbekende gebruikers worden niet meer automatisch aangemaakt.
export async function getOrCreateUser(db, email, env = {}) {
  return getAuthorizedUser(db, email, env);
}

export async function requireIdentity(context) {
  const identity = await authenticateRequest(context.request, context.env || {});
  return identity;
}

export function canWriteState(user) {
  return Boolean(Number(user?.active)) && ["admin", "planner"].includes(String(user?.role || "").toLowerCase());
}

export function canViewAudit(user) {
  return Boolean(Number(user?.active)) && ["admin", "planner"].includes(String(user?.role || "").toLowerCase());
}

export function canManageUsers(user) {
  return Boolean(Number(user?.active)) && String(user?.role || "").toLowerCase() === "admin";
}

export async function writeAudit(db, email, action, metadata = {}, entityType = null, entityId = null) {
  const safeAction = String(action || "unknown").trim().slice(0, 100).replace(/[^a-zA-Z0-9_.:-]/g, "_") || "unknown";
  const safeEntityType = entityType == null ? null : String(entityType).slice(0, 80);
  const safeEntityId = entityId == null ? null : String(entityId).slice(0, 200);
  const cleanMetadata = safeMetadata(metadata);
  await db.prepare(
    `INSERT INTO audit_log
      (tenant_id, actor_email, action, entity_type, entity_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(TENANT_ID, normalizeEmail(email), safeAction, safeEntityType, safeEntityId, JSON.stringify(cleanMetadata)).run();
}

export function stateResponseHeaders({ exists, version, updatedAt, updatedBy, user, bytes, chunked, chunkCount, checksum = "" }) {
  const clean = value => String(value ?? "").replace(/[\r\n]/g, " ");
  return {
    "X-CWS-OK": "true",
    "X-CWS-State-Exists": exists ? "1" : "0",
    "X-CWS-Version": String(Number(version || 0)),
    "X-CWS-Updated-At": clean(updatedAt),
    "X-CWS-Updated-By": clean(updatedBy),
    "X-CWS-User-Email": clean(user?.email),
    "X-CWS-User-Role": clean(user?.role || "viewer"),
    "X-CWS-User-Display-Name": clean(user?.display_name || user?.email),
    "X-CWS-Bytes": String(Number(bytes || 0)),
    "X-CWS-Chunked": chunked ? "1" : "0",
    "X-CWS-Chunk-Count": String(Number(chunkCount || 0)),
    "X-CWS-Checksum": clean(checksum),
    "Access-Control-Expose-Headers": "X-CWS-OK,X-CWS-State-Exists,X-CWS-Version,X-CWS-Updated-At,X-CWS-Updated-By,X-CWS-User-Email,X-CWS-User-Role,X-CWS-User-Display-Name,X-CWS-Bytes,X-CWS-Chunked,X-CWS-Chunk-Count,X-CWS-Checksum"
  };
}

export { authenticateRequest, isLocalRequest, byteLength, httpError };
