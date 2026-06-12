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

function stateMetricsFromRaw(raw) {
  if (!raw) return { projectCount: 0, projectOrder: 0, projectById: 0, ganttProjectCount: 0, ganttRowCount: 0, bytes: 0 };
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    return { projectCount: 0, projectOrder: 0, projectById: 0, ganttProjectCount: 0, ganttRowCount: 0, bytes: textByteLength(raw), parseError: true };
  }
  const projectOrder = Array.isArray(parsed?.projects?.order) ? parsed.projects.order.length : 0;
  const projectById = parsed?.projects?.byId && typeof parsed.projects.byId === "object" && !Array.isArray(parsed.projects.byId) ? Object.keys(parsed.projects.byId).length : 0;
  const legacyProjectArray = Array.isArray(parsed?.projects) ? parsed.projects.length : 0;
  const ganttByProject = parsed?.ganttV2?.byProject && typeof parsed.ganttV2.byProject === "object" && !Array.isArray(parsed.ganttV2.byProject) ? parsed.ganttV2.byProject : {};
  const ganttProjectCount = Object.keys(ganttByProject).length;
  const ganttRowCount = Object.values(ganttByProject).reduce((sum, model) => sum + (Array.isArray(model?.rows) ? model.rows.length : 0), 0);
  return {
    projectCount: Math.max(projectOrder, projectById, legacyProjectArray),
    projectOrder,
    projectById,
    legacyProjectArray,
    ganttProjectCount,
    ganttRowCount,
    bytes: textByteLength(raw)
  };
}

function assertNoCatastrophicOverwrite(currentRaw, incomingRaw) {
  const current = stateMetricsFromRaw(currentRaw);
  const incoming = stateMetricsFromRaw(incomingRaw);
  const currentProjects = Number(current.projectCount || 0);
  const incomingProjects = Number(incoming.projectCount || 0);
  const currentRows = Number(current.ganttRowCount || 0);
  const incomingRows = Number(incoming.ganttRowCount || 0);
  const looksLikeDemoOrEmpty = incomingProjects <= 5 || (incomingProjects < 10 && incomingRows <= 20);
  const projectDrop = currentProjects >= 20 && incomingProjects < Math.max(10, Math.floor(currentProjects * 0.6));
  const ganttDrop = currentRows >= 50 && incomingRows < Math.max(20, Math.floor(currentRows * 0.5));
  if (projectDrop || ganttDrop || (currentProjects >= 20 && looksLikeDemoOrEmpty)) {
    const error = new Error(`V62 D1 save guard: overschrijven geblokkeerd. Huidige D1 bevat ${currentProjects} projecten/${currentRows} Gantt-rijen; inkomende state bevat ${incomingProjects} projecten/${incomingRows} Gantt-rijen.`);
    error.status = 409;
    error.currentMetrics = current;
    error.incomingMetrics = incoming;
    throw error;
  }
  return { current, incoming };
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
      "SELECT version, state_json FROM app_state WHERE tenant_id = ? AND state_key = ?"
    ).bind(TENANT_ID, STATE_KEY).first();
    const currentVersion = Number(current?.version || 0);
    const guardMetrics = assertNoCatastrophicOverwrite(current?.state_json || "", incoming.stateJson);
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
      v60: true,
      v62: { d1SaveGuard: true, currentMetrics: guardMetrics.current, incomingMetrics: guardMetrics.incoming }
    }, "app_state", STATE_KEY);

    return json({ ok: true, version: nextVersion, updatedBy: email, bytes: incoming.bytes, v60: { rawStateSave: incoming.rawMode }, v62: { d1SaveGuard: true, metrics: guardMetrics.incoming } });
  } catch (error) {
    return json({ ok: false, error: error.message, currentMetrics: error.currentMetrics || null, incomingMetrics: error.incomingMetrics || null, v62: error.status === 409 ? { d1SaveGuard: Boolean(error.currentMetrics || error.incomingMetrics) } : undefined }, error.status || 500);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed." }, 405);
}
