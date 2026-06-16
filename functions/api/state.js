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


// V82: D1 has a per-value SQLite limit. The full planning state can grow beyond a
// single TEXT cell after large Gantt/revision/print work. Store large state JSON in
// deterministic chunks and keep app_state.state_json as a small manifest.
const V82_CHUNK_TABLE = "app_state_chunks";
const V82_CHUNK_CHAR_SIZE = 180_000;
const V82_CHUNK_THRESHOLD_BYTES = 700_000;
const V82_MARKER = "v82-d1-chunked-state-save-fix";
const V85_MARKER = "v85-d1-chunked-state-streaming-load-fix";

async function ensureChunkSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS app_state_chunks (
    tenant_id TEXT NOT NULL,
    state_key TEXT NOT NULL,
    version INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, state_key, version, chunk_index)
  )`).run();
}

function buildChunkManifest(version, bytes, chunkCount, updatedBy) {
  return JSON.stringify({
    __cwsChunkedState: true,
    marker: V82_MARKER,
    schemaVersion: 12,
    tenantId: TENANT_ID,
    stateKey: STATE_KEY,
    version,
    bytes,
    chunkCount,
    updatedBy,
    createdAt: new Date().toISOString()
  });
}

function parseChunkManifest(raw) {
  if (!raw || raw.length > 4096) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.__cwsChunkedState && parsed?.marker === V82_MARKER) return parsed;
  } catch (_) {}
  return null;
}
function wantsChunkManifestResponse(context, url) {
  return url.searchParams.get("chunks") === "auto" ||
    url.searchParams.get("chunks") === "manifest" ||
    context.request.headers.get("X-CWS-State-Response") === "chunk-manifest";
}

function wantsSingleChunkResponse(url) {
  return url.searchParams.has("chunkIndex") || url.searchParams.has("chunk");
}

function chunkIndexFromUrl(url) {
  const raw = url.searchParams.get("chunkIndex") ?? url.searchParams.get("chunk") ?? "";
  const index = Number(raw);
  return Number.isInteger(index) && index >= 0 ? index : -1;
}

function chunkManifestResponse(manifest, row) {
  const body = JSON.stringify({
    __cwsStateChunkManifest: true,
    __cwsChunkedState: true,
    marker: V85_MARKER,
    legacyMarker: V82_MARKER,
    tenantId: TENANT_ID,
    stateKey: STATE_KEY,
    version: Number(manifest?.version || row?.version || 0),
    bytes: Number(manifest?.bytes || 0),
    chunkCount: Number(manifest?.chunkCount || 0),
    createdAt: manifest?.createdAt || null,
    updatedAt: row?.updated_at || null,
    updatedBy: row?.updated_by || null
  });
  return rawStateResponse(body, 200, {
    "X-CWS-OK": "true",
    "X-CWS-State-Exists": "1",
    "X-CWS-Version": String(Number(row?.version || manifest?.version || 0)),
    "X-CWS-Updated-At": safeHeader(row?.updated_at || ""),
    "X-CWS-Updated-By": safeHeader(row?.updated_by || ""),
    "X-CWS-Bytes": String(Number(manifest?.bytes || 0)),
    "X-CWS-Chunked": "1",
    "X-CWS-Chunked-Manifest": "1",
    "X-CWS-Chunk-Count": String(Number(manifest?.chunkCount || 0)),
    "X-CWS-V85": V85_MARKER
  });
}

async function readStateChunkResponse(db, manifest, row, url) {
  const index = chunkIndexFromUrl(url);
  if (index < 0 || index >= Number(manifest?.chunkCount || 0)) {
    return json({ ok:false, error:"Ongeldige chunk-index." }, 400);
  }
  const requestedVersion = Number(url.searchParams.get("version") || manifest?.version || row?.version || 0);
  const manifestVersion = Number(manifest?.version || row?.version || 0);
  if (requestedVersion !== manifestVersion) {
    return json({ ok:false, error:`Chunkversie komt niet overeen (${requestedVersion} != ${manifestVersion}).` }, 409);
  }
  await ensureChunkSchema(db);
  const chunk = await db.prepare(
    `SELECT chunk_text FROM app_state_chunks
     WHERE tenant_id = ? AND state_key = ? AND version = ? AND chunk_index = ?`
  ).bind(TENANT_ID, STATE_KEY, manifestVersion, index).first();
  if (!chunk?.chunk_text) return json({ ok:false, error:`State chunk ${index} ontbreekt.` }, 500);
  return rawStateResponse(chunk.chunk_text || "", 200, {
    "X-CWS-OK": "true",
    "X-CWS-State-Exists": "1",
    "X-CWS-Version": String(manifestVersion),
    "X-CWS-Bytes": String(textByteLength(chunk.chunk_text || "")),
    "X-CWS-Chunked": "1",
    "X-CWS-Chunked-Manifest": "0",
    "X-CWS-Chunk-Index": String(index),
    "X-CWS-Chunk-Count": String(Number(manifest?.chunkCount || 0)),
    "X-CWS-V85": V85_MARKER
  });
}

async function migrateOversizedInlineStateToChunks(db, row, email) {
  const raw = row?.state_json || "";
  if (!raw || parseChunkManifest(raw) || textByteLength(raw) <= V82_CHUNK_THRESHOLD_BYTES) return { row, manifest: parseChunkManifest(raw), migrated:false };
  const version = Number(row?.version || 1);
  await ensureChunkSchema(db);
  const chunks = splitStateIntoChunks(raw);
  const manifestText = buildChunkManifest(version, textByteLength(raw), chunks.length, row?.updated_by || email || "v85-inline-migration");
  const statements = [
    db.prepare(`DELETE FROM app_state_chunks WHERE tenant_id = ? AND state_key = ?`).bind(TENANT_ID, STATE_KEY)
  ];
  chunks.forEach((chunk, index) => {
    statements.push(db.prepare(
      `INSERT INTO app_state_chunks (tenant_id, state_key, version, chunk_index, chunk_text)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(TENANT_ID, STATE_KEY, version, index, chunk));
  });
  statements.push(db.prepare(
    `UPDATE app_state SET state_json = ?, updated_at = CURRENT_TIMESTAMP, updated_by = COALESCE(updated_by, ?)
     WHERE tenant_id = ? AND state_key = ?`
  ).bind(manifestText, email || "v85-inline-migration", TENANT_ID, STATE_KEY));
  await db.batch(statements);
  const migratedRow = { ...row, state_json: manifestText };
  return { row: migratedRow, manifest: parseChunkManifest(manifestText), migrated:true };
}


function splitStateIntoChunks(stateJson) {
  const chunks = [];
  for (let i = 0; i < stateJson.length; i += V82_CHUNK_CHAR_SIZE) {
    chunks.push(stateJson.slice(i, i + V82_CHUNK_CHAR_SIZE));
  }
  return chunks;
}

async function readFullStateJson(db, row) {
  const raw = row?.state_json || "";
  const manifest = parseChunkManifest(raw);
  if (!manifest) return raw;
  await ensureChunkSchema(db);
  const result = await db.prepare(
    `SELECT chunk_index, chunk_text FROM app_state_chunks
     WHERE tenant_id = ? AND state_key = ? AND version = ?
     ORDER BY chunk_index ASC`
  ).bind(TENANT_ID, STATE_KEY, Number(manifest.version || row?.version || 0)).all();
  const rows = result.results || [];
  if (rows.length !== Number(manifest.chunkCount || 0)) {
    const error = new Error(`D1 chunked state incompleet: ${rows.length}/${manifest.chunkCount} chunks gevonden.`);
    error.status = 500;
    throw error;
  }
  return rows.map(r => r.chunk_text || "").join("");
}

async function writeFullStateJson(db, stateJson, nextVersion, email) {
  await ensureChunkSchema(db);
  const bytes = textByteLength(stateJson);
  if (bytes <= V82_CHUNK_THRESHOLD_BYTES) {
    await db.batch([
      db.prepare(`DELETE FROM app_state_chunks WHERE tenant_id = ? AND state_key = ?`).bind(TENANT_ID, STATE_KEY),
      db.prepare(
        `INSERT INTO app_state
          (tenant_id, state_key, state_json, version, updated_at, updated_by)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
         ON CONFLICT(tenant_id, state_key) DO UPDATE SET
           state_json = excluded.state_json,
           version = excluded.version,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = excluded.updated_by`
      ).bind(TENANT_ID, STATE_KEY, stateJson, nextVersion, email)
    ]);
    return { chunked: false, chunkCount: 0, bytes };
  }

  const chunks = splitStateIntoChunks(stateJson);
  const manifest = buildChunkManifest(nextVersion, bytes, chunks.length, email);
  const statements = [
    db.prepare(`DELETE FROM app_state_chunks WHERE tenant_id = ? AND state_key = ?`).bind(TENANT_ID, STATE_KEY)
  ];
  chunks.forEach((chunk, index) => {
    statements.push(db.prepare(
      `INSERT INTO app_state_chunks (tenant_id, state_key, version, chunk_index, chunk_text)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(TENANT_ID, STATE_KEY, nextVersion, index, chunk));
  });
  statements.push(db.prepare(
    `INSERT INTO app_state
      (tenant_id, state_key, state_json, version, updated_at, updated_by)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
     ON CONFLICT(tenant_id, state_key) DO UPDATE SET
       state_json = excluded.state_json,
       version = excluded.version,
       updated_at = CURRENT_TIMESTAMP,
       updated_by = excluded.updated_by`
  ).bind(TENANT_ID, STATE_KEY, manifest, nextVersion, email));

  await db.batch(statements);
  return { chunked: true, chunkCount: chunks.length, bytes };
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
  // Compatibility marker: V63 D1 save guard, overschrijven geblokkeerd.
  // V72 uses stricter shrink thresholds.
  const current = stateMetricsFromRaw(currentRaw);
  const incoming = stateMetricsFromRaw(incomingRaw);
  const currentProjects = Number(current.projectCount || 0);
  const incomingProjects = Number(incoming.projectCount || 0);
  const currentRows = Number(current.ganttRowCount || 0);
  const incomingRows = Number(incoming.ganttRowCount || 0);
  const looksLikeDemoOrEmpty = incomingProjects <= 5 || (incomingProjects < 10 && incomingRows <= 20);
  const projectDrop = currentProjects >= 10 &&
    incomingProjects < currentProjects &&
    (currentProjects - incomingProjects >= Math.max(5, Math.ceil(currentProjects * 0.2)));
  const ganttDrop = currentRows >= 20 &&
    incomingRows < currentRows &&
    (currentRows - incomingRows >= Math.max(10, Math.ceil(currentRows * 0.25)));
  if (projectDrop || ganttDrop || (currentProjects >= 20 && looksLikeDemoOrEmpty)) {
    const error = new Error(`Opslaan geblokkeerd: inkomende state zou planning verkleinen van ${currentProjects} projecten/${currentRows} Gantt-rijen naar ${incomingProjects}/${incomingRows}.`);
    error.status = 409;
    error.guard = "v72-state-shrink-guard";
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

    let row = await db.prepare(
      `SELECT state_json, version, updated_at, updated_by
       FROM app_state WHERE tenant_id = ? AND state_key = ?`
    ).bind(TENANT_ID, STATE_KEY).first();

    if (row?.state_json && !parseChunkManifest(row.state_json)) {
      const migrated = await migrateOversizedInlineStateToChunks(db, row, email);
      row = migrated.row;
    }

    const exists = Boolean(row?.state_json);
    const manifest = parseChunkManifest(row?.state_json || "");

    if (exists && manifest && wantsSingleChunkResponse(url)) {
      return readStateChunkResponse(db, manifest, row, url);
    }

    if (rawResponse && exists && manifest && wantsChunkManifestResponse(context, url)) {
      const response = chunkManifestResponse(manifest, row);
      response.headers.set("X-CWS-User-Email", safeHeader(user.email || email));
      response.headers.set("X-CWS-User-Role", safeHeader(user.role || "viewer"));
      response.headers.set("X-CWS-User-Display-Name", safeHeader(user.display_name || user.email || email));
      return response;
    }

    const fullStateJson = exists ? await readFullStateJson(db, row) : "";
    const bytes = fullStateJson ? textByteLength(fullStateJson) : Number(manifest?.bytes || 0);

    // V60: raw state response. The previous V57 JSON wrapper still forced the
    // Worker to JSON.stringify({ stateJson: "...very large state..." }). On larger
    // planning datasets that could still hit Cloudflare 1102/503. This path returns
    // the stored JSON body directly and puts metadata in headers, so the browser is
    // the only place that parses the large planning state.
    // V60 compatibility marker: rawStateResponse(row?.state_json || "". V82 reassembles chunked state before returning raw JSON.
    if (rawResponse) {
      return rawStateResponse(fullStateJson || "", 200, {
        "X-CWS-OK": "true",
        "X-CWS-State-Exists": exists ? "1" : "0",
        "X-CWS-Version": String(Number(row?.version || 0)),
        "X-CWS-Updated-At": safeHeader(row?.updated_at || ""),
        "X-CWS-Updated-By": safeHeader(row?.updated_by || ""),
        "X-CWS-User-Email": safeHeader(user.email || email),
        "X-CWS-User-Role": safeHeader(user.role || "viewer"),
        "X-CWS-User-Display-Name": safeHeader(user.display_name || user.email || email),
        "X-CWS-Bytes": String(bytes),
        "X-CWS-Chunked": manifest ? "1" : "0",
        "X-CWS-Chunk-Count": manifest ? String(manifest.chunkCount || 0) : "0",
        "X-CWS-V85": V85_MARKER
      });
    }

    // V57 compatibility marker: stateJson: row?.state_json. V82 returns fullStateJson after optional chunk reassembly and keeps serverSideStateParse:false.
    // Backwards-compatible JSON wrapper for old clients and manual debugging only.
    return json({
      ok: true,
      exists: Boolean(row),
      tenantId: TENANT_ID,
      stateKey: STATE_KEY,
      version: Number(row?.version || 0),
      stateJson: fullStateJson || null,
      stateEncoding: row ? "json-string" : "empty",
      bytes,
      updatedAt: row?.updated_at || null,
      updatedBy: row?.updated_by || null,
      user: { email: user.email, displayName: user.display_name, role: user.role, active: Boolean(user.active) },
      v60: { rawStateResponse: false, lightweight: true, serverSideStateParse: false },
      v82: { chunkedState: Boolean(manifest), chunkCount: Number(manifest?.chunkCount || 0), marker: V82_MARKER },
      v85: { chunkedStateStreamingLoad: Boolean(manifest), marker: V85_MARKER }
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
    const currentStateJson = current?.state_json ? await readFullStateJson(db, current) : "";
    const guardMetrics = assertNoCatastrophicOverwrite(currentStateJson || "", incoming.stateJson);
    const baseVersion = Number(incoming.baseVersion ?? 0);
    if (currentVersion > 0 && baseVersion !== currentVersion) {
      return json({
        ok: false,
        error: "State is gewijzigd door een andere gebruiker.",
        currentVersion
      }, 409);
    }

    const nextVersion = currentVersion + 1;

    const writeResult = await writeFullStateJson(db, incoming.stateJson, nextVersion, email);

    // Keep audit metadata small and never store the full state in audit.
    await writeAudit(db, email, "state_saved", {
      version: nextVersion,
      baseVersion,
      bytes: incoming.bytes,
      rawMode: incoming.rawMode,
      v60: true,
      v62: { d1SaveGuard: true, currentMetrics: guardMetrics.current, incomingMetrics: guardMetrics.incoming },
      v72: { stateShrinkGuard: true },
      v82: { chunkedStateSave:true, chunked:writeResult.chunked, chunkCount:writeResult.chunkCount, marker:V82_MARKER }
    }, "app_state", STATE_KEY);

    return json({ ok: true, version: nextVersion, updatedBy: email, bytes: incoming.bytes, v60: { rawStateSave: incoming.rawMode }, v62: { d1SaveGuard: true, metrics: guardMetrics.incoming }, v72: { stateShrinkGuard: true }, v82: { chunkedStateSave:true, chunked:writeResult.chunked, chunkCount:writeResult.chunkCount, marker:V82_MARKER } });
  } catch (error) {
    return json({ ok: false, error: error.message, currentMetrics: error.currentMetrics || null, incomingMetrics: error.incomingMetrics || null, guard:error.guard || null, v62: error.status === 409 ? { d1SaveGuard: Boolean(error.currentMetrics || error.incomingMetrics) } : undefined, v72:error.guard ? { stateShrinkGuard:true } : undefined, v82:{ chunkedStateSave:true, marker:V82_MARKER, sqliteTooBigGuard:String(error.message||"").includes("SQLITE_TOOBIG") || String(error.message||"").includes("too big") } }, error.status || 500);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed." }, 405);
}
