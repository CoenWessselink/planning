import {
  MAX_STATE_BYTES,
  STATE_KEY,
  TENANT_ID,
  canWriteState,
  ensureSchema,
  getOrCreateUser,
  json,
  rawStateResponse,
  requireActorEmail,
  verifyRequiredSchema,
  writeAudit
} from "./_shared.js";

async function prepareDb(db) {
  // V60: normal state load/save should not run the full self-healing migration path.
  // First perform a cheap schema verification. Only repair when a table/column is
  // actually missing. This prevents unnecessary D1 PRAGMA/migration work on every
  // GET/PUT and avoids Cloudflare Worker 1102 resource-limit failures.
  let schema = await verifyRequiredSchema(db);
  if (!schema.ok) schema = await ensureSchema(db);
  return schema;
}

function textByteLength(value) {
  return new TextEncoder().encode(String(value || "")).byteLength;
}

function extractSchemaVersionFromRawState(raw) {
  const match = String(raw || "").match(/"schemaVersion"\s*:\s*(\d+)/);
  return match ? Number(match[1]) : 0;
}

function parseBaseVersion(context, url) {
  const header = context.request.headers.get("X-CWS-Base-Version");
  const query = url.searchParams.get("baseVersion");
  const value = header ?? query ?? "0";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function wantsRawStateResponse(context, url) {
  return context.request.headers.get("X-CWS-State-Response") === "raw-state" ||
    url.searchParams.get("payload") === "raw-state" ||
    url.searchParams.get("response") === "raw-state";
}

function safeHeader(value) {
  return String(value ?? "").replace(/[\r\n]/g, " ");
}

async function readIncomingState(context) {
  const url = new URL(context.request.url);
  const raw = await context.request.text();
  if (textByteLength(raw) > MAX_STATE_BYTES) {
    const error = new Error("State payload is te groot.");
    error.status = 413;
    throw error;
  }

  const rawMode =
    context.request.headers.get("X-CWS-State-Payload") === "raw-state" ||
    url.searchParams.get("payload") === "raw-state";

  if (rawMode) {
    const schemaVersion = extractSchemaVersionFromRawState(raw);
    if (!schemaVersion) {
      const error = new Error("schemaVersion ontbreekt.");
      error.status = 400;
      throw error;
    }
    return {
      stateJson: raw,
      baseVersion: parseBaseVersion(context, url),
      bytes: textByteLength(raw),
      rawMode: true
    };
  }

  // Backwards-compatible route for older clients that still send
  // { state: {...}, baseVersion }. This is intentionally kept, but the V57 client
  // uses raw-state mode to avoid an extra Worker-side JSON parse/stringify pass.
  let body;
  try {
    body = JSON.parse(raw);
  } catch (_) {
    const error = new Error("Ongeldige JSON-body.");
    error.status = 400;
    throw error;
  }
  if (!body?.state || typeof body.state !== "object" || Array.isArray(body.state)) {
    const error = new Error("Body moet een state-object bevatten.");
    error.status = 400;
    throw error;
  }
  if (!Number(body.state.schemaVersion)) {
    const error = new Error("schemaVersion ontbreekt.");
    error.status = 400;
    throw error;
  }
  const stateJson = JSON.stringify(body.state);
  return {
    stateJson,
    baseVersion: Number(body.baseVersion ?? 0),
    bytes: textByteLength(stateJson),
    rawMode: false
  };
}

export async function onRequestGet(context) {
  const db = context.env?.DB;
  if (!db) return json({ ok: false, error: "D1-binding DB ontbreekt." }, 500);

  const email = requireActorEmail(context.request);
  if (!email) return json({ ok: false, error: "Cloudflare Access-identiteit ontbreekt." }, 401);

  const url = new URL(context.request.url);
  const rawResponse = wantsRawStateResponse(context, url);

  try {
    const schema = await prepareDb(db);
    if (!schema.ok) return json({ ok: false, error: "D1-schema kon niet automatisch worden hersteld.", schemaErrors: schema.errors }, 500);

    const user = await getOrCreateUser(db, email);
    if (!user.active) return json({ ok: false, error: "Gebruiker is inactief." }, 403);

    const row = await db.prepare(
      `SELECT state_json, version, updated_at, updated_by
       FROM app_state WHERE tenant_id = ? AND state_key = ?`
    ).bind(TENANT_ID, STATE_KEY).first();

    const exists = Boolean(row?.state_json);
    const bytes = row?.state_json ? textByteLength(row.state_json) : 0;

    // V60: raw state response. The previous V57 JSON wrapper still forced the
    // Worker to JSON.stringify({ stateJson: "...very large state..." }). On larger
    // planning datasets that could still hit Cloudflare 1102/503. This path returns
    // the stored JSON body directly and puts metadata in headers, so the browser is
    // the only place that parses the large planning state.
    if (rawResponse) {
      return rawStateResponse(row?.state_json || "", 200, {
        "X-CWS-OK": "true",
        "X-CWS-State-Exists": exists ? "1" : "0",
        "X-CWS-Version": String(Number(row?.version || 0)),
        "X-CWS-Updated-At": safeHeader(row?.updated_at || ""),
        "X-CWS-Updated-By": safeHeader(row?.updated_by || ""),
        "X-CWS-User-Email": safeHeader(user.email || email),
        "X-CWS-User-Role": safeHeader(user.role || "viewer"),
        "X-CWS-User-Display-Name": safeHeader(user.display_name || user.email || email),
        "X-CWS-Bytes": String(bytes)
      });
    }

    // Backwards-compatible JSON wrapper for old clients and manual debugging only.
    return json({
      ok: true,
      exists: Boolean(row),
      tenantId: TENANT_ID,
      stateKey: STATE_KEY,
      version: Number(row?.version || 0),
      stateJson: row?.state_json || null,
      stateEncoding: row ? "json-string" : "empty",
      bytes,
      updatedAt: row?.updated_at || null,
      updatedBy: row?.updated_by || null,
      user: { email: user.email, displayName: user.display_name, role: user.role, active: Boolean(user.active) },
      v60: { rawStateResponse: false, lightweight: true, serverSideStateParse: false }
    });
  } catch (error) {
    return json({ ok: false, error: error.message }, error.status || 500);
  }
}

export async function onRequestPut(context) {
  const db = context.env?.DB;
  if (!db) return json({ ok: false, error: "D1-binding DB ontbreekt." }, 500);

  const email = requireActorEmail(context.request);
  if (!email) return json({ ok: false, error: "Cloudflare Access-identiteit ontbreekt." }, 401);

  try {
    const schema = await prepareDb(db);
    if (!schema.ok) return json({ ok: false, error: "D1-schema kon niet automatisch worden hersteld.", schemaErrors: schema.errors }, 500);

    const user = await getOrCreateUser(db, email);
    if (!user.active) return json({ ok: false, error: "Gebruiker is inactief." }, 403);
    if (!canWriteState(user)) return json({ ok: false, error: "Viewer heeft alleen leesrechten." }, 403);

    const incoming = await readIncomingState(context);

    const current = await db.prepare(
      "SELECT version FROM app_state WHERE tenant_id = ? AND state_key = ?"
    ).bind(TENANT_ID, STATE_KEY).first();
    const currentVersion = Number(current?.version || 0);
    const baseVersion = Number(incoming.baseVersion ?? 0);
    if (currentVersion > 0 && baseVersion !== currentVersion) {
      return json({
        ok: false,
        error: "State is gewijzigd door een andere gebruiker.",
        currentVersion
      }, 409);
    }

    const nextVersion = currentVersion + 1;

    await db.prepare(
      `INSERT INTO app_state
        (tenant_id, state_key, state_json, version, updated_at, updated_by)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
       ON CONFLICT(tenant_id, state_key) DO UPDATE SET
         state_json = excluded.state_json,
         version = excluded.version,
         updated_at = CURRENT_TIMESTAMP,
         updated_by = excluded.updated_by`
    ).bind(TENANT_ID, STATE_KEY, incoming.stateJson, nextVersion, email).run();

    // Keep audit metadata small and never store the full state in audit.
    await writeAudit(db, email, "state_saved", {
      version: nextVersion,
      baseVersion,
      bytes: incoming.bytes,
      rawMode: incoming.rawMode,
      v60: true
    }, "app_state", STATE_KEY);

    return json({ ok: true, version: nextVersion, updatedBy: email, bytes: incoming.bytes, v60: { rawStateSave: incoming.rawMode } });
  } catch (error) {
    return json({ ok: false, error: error.message }, error.status || 500);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed." }, 405);
}
