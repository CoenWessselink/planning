import {
  MAX_STATE_BYTES,
  STATE_KEY,
  TENANT_ID,
  ensureSchema,
  getOrCreateUser,
  json,
  rawStateResponse,
  requireActorEmail,
  verifyRequiredSchema
} from "./api/_shared.js";

const MARKER = "v128-stable-state-put-small-d1-chunks";
const CHUNK_SIZE = 60_000;
const INLINE_THRESHOLD_BYTES = 240_000;
const KEEP_CHUNK_VERSIONS = 25;
const enc = (value) => new TextEncoder().encode(String(value || "")).byteLength;

function safeHeader(value) {
  return String(value ?? "").replace(/[\r\n]/g, " ");
}

function makeChunks(text) {
  const chunks = [];
  for (let index = 0; index < text.length; index += CHUNK_SIZE) chunks.push(text.slice(index, index + CHUNK_SIZE));
  return chunks;
}

function makeManifest(version, bytes, chunkCount, updatedBy, extra = {}) {
  return JSON.stringify({
    __cwsChunkedState: true,
    marker: MARKER,
    tenantId: TENANT_ID,
    stateKey: STATE_KEY,
    version,
    bytes,
    chunkCount,
    chunkSize: CHUNK_SIZE,
    updatedBy,
    createdAt: new Date().toISOString(),
    ...extra
  });
}

function parseManifest(raw) {
  if (!raw || raw.length > 8192) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.__cwsChunkedState && (parsed.stateKey === STATE_KEY || parsed.version || parsed.chunkCount)) return parsed;
    if (parsed?.__cwsStateChunkManifest && parsed.version && parsed.chunkCount) return parsed;
  } catch (_) {}
  return null;
}

function wantsRawState(request, url) {
  return request.headers.get("X-CWS-State-Response") === "raw-state" ||
    url.searchParams.get("payload") === "raw-state" ||
    url.searchParams.get("response") === "raw-state";
}

function wantsManifest(request, url) {
  return request.headers.get("X-CWS-State-Response") === "chunk-manifest" ||
    url.searchParams.get("chunks") === "manifest";
}

function requestedChunkIndex(url) {
  if (!url.searchParams.has("chunkIndex") && !url.searchParams.has("chunk")) return -1;
  const raw = url.searchParams.get("chunkIndex") ?? url.searchParams.get("chunk");
  if (raw == null || String(raw).trim() === "") return -1;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
}

async function prepare(db) {
  let schema = await verifyRequiredSchema(db);
  if (!schema.ok) schema = await ensureSchema(db);
  await db.prepare(`CREATE TABLE IF NOT EXISTS app_state_chunks (
    tenant_id TEXT NOT NULL,
    state_key TEXT NOT NULL,
    version INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, state_key, version, chunk_index)
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS app_state_save_log (
    tenant_id TEXT NOT NULL,
    state_key TEXT NOT NULL,
    mutation_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    base_version INTEGER NOT NULL DEFAULT 0,
    bytes INTEGER NOT NULL DEFAULT 0,
    project_count INTEGER NOT NULL DEFAULT 0,
    gantt_row_count INTEGER NOT NULL DEFAULT 0,
    actor_email TEXT,
    status TEXT NOT NULL DEFAULT 'checkpointed',
    error_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, state_key, mutation_id)
  )`).run();
  return schema;
}

async function readChunkRows(db, version) {
  const result = await db.prepare(
    `SELECT chunk_index, chunk_text FROM app_state_chunks
     WHERE tenant_id = ? AND state_key = ? AND version = ?
     ORDER BY chunk_index ASC`
  ).bind(TENANT_ID, STATE_KEY, Number(version || 0)).all();
  return result.results || [];
}

function assertCompleteRows(rows, version, expectedCount = null) {
  if (!rows.length) throw Object.assign(new Error(`Geen chunks gevonden voor D1-state versie ${version}.`), { status: 500 });
  if (expectedCount != null && rows.length !== Number(expectedCount || 0)) {
    throw Object.assign(new Error(`D1-state chunks incompleet voor versie ${version}: ${rows.length}/${expectedCount}.`), { status: 500 });
  }
  for (let index = 0; index < rows.length; index += 1) {
    if (Number(rows[index].chunk_index) !== index) {
      throw Object.assign(new Error(`Chunk-index ontbreekt voor D1-state versie ${version}, index ${index}.`), { status: 500 });
    }
  }
}

async function readChunksAsText(db, version, expectedCount = null) {
  const rows = await readChunkRows(db, version);
  assertCompleteRows(rows, version, expectedCount);
  const full = rows.map((row) => row.chunk_text || "").join("");
  JSON.parse(full);
  return { full, rows, bytes: enc(full), version: Number(version || 0) };
}

async function findLatestValidChunks(db) {
  const result = await db.prepare(
    `SELECT version, COUNT(*) AS chunk_count, MIN(chunk_index) AS min_index, MAX(chunk_index) AS max_index
     FROM app_state_chunks
     WHERE tenant_id = ? AND state_key = ?
     GROUP BY version
     ORDER BY version DESC
     LIMIT 50`
  ).bind(TENANT_ID, STATE_KEY).all();

  for (const row of result.results || []) {
    const version = Number(row.version || 0);
    const count = Number(row.chunk_count || 0);
    if (!version || !count || Number(row.min_index) !== 0 || Number(row.max_index) !== count - 1) continue;
    try { return await readChunksAsText(db, version, count); } catch (_) {}
  }
  return null;
}

async function loadCurrentState(db) {
  const row = await db.prepare(
    `SELECT state_json, version, updated_at, updated_by FROM app_state WHERE tenant_id = ? AND state_key = ?`
  ).bind(TENANT_ID, STATE_KEY).first();

  if (!row?.state_json) return { exists: false, full: "", version: 0, row: null, manifest: null, recovered: false };

  const manifest = parseManifest(row.state_json);
  if (manifest) {
    const version = Number(manifest.version || row.version || 0);
    const loaded = await readChunksAsText(db, version, Number(manifest.chunkCount || 0) || null);
    return {
      exists: true,
      full: loaded.full,
      version,
      row,
      manifest: { ...manifest, version, bytes: loaded.bytes, chunkCount: loaded.rows.length },
      recovered: false
    };
  }

  try {
    JSON.parse(row.state_json);
    return { exists: true, full: row.state_json, version: Number(row.version || 0), row, manifest: null, recovered: false };
  } catch (_) {
    const recovered = await findLatestValidChunks(db);
    if (!recovered) throw Object.assign(new Error("D1-state is corrupt en er is geen complete chunk-set gevonden."), { status: 500 });
    const repairedManifest = JSON.parse(makeManifest(recovered.version, recovered.bytes, recovered.rows.length, row.updated_by || "recovered", { recoveredFromCorruptInlineState: true }));
    await db.prepare(
      `UPDATE app_state SET state_json = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND state_key = ?`
    ).bind(JSON.stringify(repairedManifest), recovered.version, TENANT_ID, STATE_KEY).run();
    return { exists: true, full: recovered.full, version: recovered.version, row, manifest: repairedManifest, recovered: true };
  }
}

function stateMetrics(raw) {
  try {
    const state = JSON.parse(raw || "{}");
    const orderCount = Array.isArray(state?.projects?.order) ? state.projects.order.length : 0;
    const byIdCount = state?.projects?.byId && typeof state.projects.byId === "object" && !Array.isArray(state.projects.byId) ? Object.keys(state.projects.byId).length : 0;
    const legacyCount = Array.isArray(state?.projects) ? state.projects.length : 0;
    const byProject = state?.ganttV2?.byProject && typeof state.ganttV2.byProject === "object" && !Array.isArray(state.ganttV2.byProject) ? state.ganttV2.byProject : {};
    const ganttRowCount = Object.values(byProject).reduce((total, model) => total + (Array.isArray(model?.rows) ? model.rows.length : 0), 0);
    return { projectCount: Math.max(orderCount, byIdCount, legacyCount), ganttRowCount, bytes: enc(raw) };
  } catch (_) {
    return { projectCount: 0, ganttRowCount: 0, bytes: enc(raw), parseError: true };
  }
}

function sanitizeIncomingState(raw) {
  const parsed = JSON.parse(raw);
  const byProject = parsed?.ganttV2?.byProject || {};
  for (const model of Object.values(byProject)) {
    if (!Array.isArray(model?.revisions)) continue;
    model.revisions = model.revisions.map((revision) => {
      if (!revision || typeof revision !== "object") return revision;
      const next = { ...revision };
      const snapshot = JSON.parse(JSON.stringify(next.snapshot || {}));
      delete snapshot.capacity;
      delete snapshot.gantt;
      delete snapshot.hoursByDay;
      delete snapshot.sourcesByDay;
      delete snapshot.projectDeptHoursValidation;
      snapshot.meta = snapshot.meta && typeof snapshot.meta === "object" ? snapshot.meta : {};
      snapshot.meta.capacityExcludedFromRevision = true;
      snapshot.meta.capacityRevisionIsolation = MARKER;
      next.snapshot = snapshot;
      return next;
    });
  }
  parsed.meta = parsed.meta && typeof parsed.meta === "object" ? parsed.meta : {};
  parsed.meta.stateSaveRoute = MARKER;
  parsed.meta.stateSaveChunkSize = CHUNK_SIZE;
  parsed.meta.stateSaveAt = new Date().toISOString();
  return JSON.stringify(parsed);
}

async function readIncomingState(context, url) {
  const bodyText = await context.request.text();
  const incomingBytes = enc(bodyText);
  if (incomingBytes > MAX_STATE_BYTES) throw Object.assign(new Error(`State payload is te groot (${incomingBytes}/${MAX_STATE_BYTES} bytes).`), { status: 413 });

  const rawMode = context.request.headers.get("X-CWS-State-Payload") === "raw-state" || url.searchParams.get("payload") === "raw-state";
  let stateJson = "";
  if (rawMode) {
    stateJson = bodyText;
  } else {
    const body = JSON.parse(bodyText || "{}");
    if (!body?.state || typeof body.state !== "object" || Array.isArray(body.state)) throw Object.assign(new Error("Body moet een state-object bevatten."), { status: 400 });
    stateJson = JSON.stringify(body.state);
  }

  const sanitized = sanitizeIncomingState(stateJson);
  const metrics = stateMetrics(sanitized);
  if (metrics.parseError) throw Object.assign(new Error("Opslaan geblokkeerd: inkomende state is geen geldige JSON."), { status: 400, metrics });
  if (metrics.projectCount <= 5 || (metrics.projectCount < 10 && metrics.ganttRowCount <= 20)) {
    throw Object.assign(new Error(`Opslaan geblokkeerd: state lijkt leeg/demo (${metrics.projectCount} projecten/${metrics.ganttRowCount} Gantt-rijen).`), { status: 409, metrics });
  }

  return {
    stateJson: sanitized,
    baseVersion: Number(context.request.headers.get("X-CWS-Base-Version") || url.searchParams.get("baseVersion") || 0),
    bytes: enc(sanitized),
    metrics,
    rawMode
  };
}

async function writeCheckpoint(db, stateJson, version, email) {
  const bytes = enc(stateJson);
  if (bytes <= INLINE_THRESHOLD_BYTES) {
    await db.prepare(
      `INSERT INTO app_state (tenant_id, state_key, state_json, version, updated_at, updated_by)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
       ON CONFLICT(tenant_id, state_key) DO UPDATE SET
         state_json = excluded.state_json,
         version = excluded.version,
         updated_at = CURRENT_TIMESTAMP,
         updated_by = excluded.updated_by`
    ).bind(TENANT_ID, STATE_KEY, stateJson, version, email).run();
    return { chunked: false, chunkCount: 0, bytes };
  }

  const chunks = makeChunks(stateJson);
  const manifest = makeManifest(version, bytes, chunks.length, email, { stablePut: true });

  await db.prepare(`DELETE FROM app_state_chunks WHERE tenant_id = ? AND state_key = ? AND version = ?`).bind(TENANT_ID, STATE_KEY, version).run();
  for (let index = 0; index < chunks.length; index += 1) {
    await db.prepare(
      `INSERT OR REPLACE INTO app_state_chunks (tenant_id, state_key, version, chunk_index, chunk_text)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(TENANT_ID, STATE_KEY, version, index, chunks[index]).run();
  }

  await db.prepare(
    `INSERT INTO app_state (tenant_id, state_key, state_json, version, updated_at, updated_by)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
     ON CONFLICT(tenant_id, state_key) DO UPDATE SET
       state_json = excluded.state_json,
       version = excluded.version,
       updated_at = CURRENT_TIMESTAMP,
       updated_by = excluded.updated_by`
  ).bind(TENANT_ID, STATE_KEY, manifest, version, email).run();

  try {
    await db.prepare(`DELETE FROM app_state_chunks WHERE tenant_id = ? AND state_key = ? AND version < ?`).bind(TENANT_ID, STATE_KEY, Math.max(0, version - KEEP_CHUNK_VERSIONS)).run();
  } catch (_) {}

  return { chunked: true, chunkCount: chunks.length, bytes };
}

async function handleStateGet(context, url) {
  const db = context.env?.DB;
  if (!db) return json({ ok: false, error: "D1-binding DB ontbreekt.", v128: { marker: MARKER } }, 500);
  const email = requireActorEmail(context.request);
  if (!email) return json({ ok: false, error: "Cloudflare Access-identiteit ontbreekt.", v128: { marker: MARKER } }, 401);

  await prepare(db);
  const user = await getOrCreateUser(db, email);
  if (!user.active) return json({ ok: false, error: "Gebruiker is inactief.", v128: { marker: MARKER } }, 403);

  const current = await loadCurrentState(db);
  const index = requestedChunkIndex(url);

  if (current.exists && index >= 0) {
    const requestedVersion = Number(url.searchParams.get("version") || current.version || 0);
    const rows = await readChunkRows(db, requestedVersion);
    const chunk = rows.find((row) => Number(row.chunk_index) === index);
    if (!chunk) return json({ ok: false, error: `Chunk ${index} ontbreekt voor versie ${requestedVersion}.`, v128: { marker: MARKER } }, 500);
    return rawStateResponse(chunk.chunk_text || "", 200, {
      "X-CWS-OK": "true",
      "X-CWS-State-Exists": "1",
      "X-CWS-Version": String(requestedVersion),
      "X-CWS-Chunked": "1",
      "X-CWS-Chunked-Manifest": "0",
      "X-CWS-Chunk-Index": String(index),
      "X-CWS-Chunk-Count": String(rows.length),
      "X-CWS-V128": MARKER
    });
  }

  if (current.exists && wantsManifest(context.request, url)) {
    const manifest = current.manifest || JSON.parse(makeManifest(current.version, enc(current.full), makeChunks(current.full).length, current.row?.updated_by || email, { transientInlineManifest: true }));
    return rawStateResponse(JSON.stringify({ ...manifest, __cwsStateChunkManifest: true }), 200, {
      "X-CWS-OK": "true",
      "X-CWS-State-Exists": "1",
      "X-CWS-Version": String(current.version || 0),
      "X-CWS-Updated-At": safeHeader(current.row?.updated_at || ""),
      "X-CWS-Updated-By": safeHeader(current.row?.updated_by || ""),
      "X-CWS-User-Email": safeHeader(user.email || email),
      "X-CWS-User-Role": safeHeader(user.role || "viewer"),
      "X-CWS-User-Display-Name": safeHeader(user.display_name || user.email || email),
      "X-CWS-Bytes": String(enc(current.full || "")),
      "X-CWS-Chunked": "1",
      "X-CWS-Chunked-Manifest": "1",
      "X-CWS-Chunk-Count": String(Number(manifest.chunkCount || 0)),
      "X-CWS-V128": MARKER
    });
  }

  if (wantsRawState(context.request, url)) {
    return rawStateResponse(current.full || "", 200, {
      "X-CWS-OK": "true",
      "X-CWS-State-Exists": current.exists ? "1" : "0",
      "X-CWS-Version": String(current.version || 0),
      "X-CWS-Updated-At": safeHeader(current.row?.updated_at || ""),
      "X-CWS-Updated-By": safeHeader(current.row?.updated_by || ""),
      "X-CWS-User-Email": safeHeader(user.email || email),
      "X-CWS-User-Role": safeHeader(user.role || "viewer"),
      "X-CWS-User-Display-Name": safeHeader(user.display_name || user.email || email),
      "X-CWS-Bytes": String(enc(current.full || "")),
      "X-CWS-Chunked": "0",
      "X-CWS-Chunked-Manifest": "0",
      "X-CWS-Full-State-Json": "1",
      "X-CWS-V128": MARKER
    });
  }

  return json({
    ok: true,
    exists: current.exists,
    version: current.version || 0,
    stateJson: current.full || null,
    stateEncoding: current.exists ? "json-string" : "empty",
    bytes: enc(current.full || ""),
    updatedAt: current.row?.updated_at || null,
    updatedBy: current.row?.updated_by || null,
    user: { email: user.email, displayName: user.display_name, role: user.role, active: Boolean(user.active) },
    v128: { marker: MARKER, stablePut: true, recovered: current.recovered }
  });
}

async function handleStatePut(context, url) {
  const db = context.env?.DB;
  if (!db) return json({ ok: false, error: "D1-binding DB ontbreekt.", v128: { marker: MARKER } }, 500);
  const email = requireActorEmail(context.request);
  if (!email) return json({ ok: false, error: "Cloudflare Access-identiteit ontbreekt.", v128: { marker: MARKER } }, 401);

  await prepare(db);
  const user = await getOrCreateUser(db, email);
  if (!user.active) return json({ ok: false, error: "Gebruiker is inactief.", v128: { marker: MARKER } }, 403);
  if (String(user.role || "").toLowerCase() === "viewer") return json({ ok: false, error: "Viewer heeft alleen leesrechten.", v128: { marker: MARKER } }, 403);

  const incoming = await readIncomingState(context, url);
  const current = await db.prepare(`SELECT version FROM app_state WHERE tenant_id = ? AND state_key = ?`).bind(TENANT_ID, STATE_KEY).first();
  const currentVersion = Number(current?.version || 0);
  const nextVersion = Math.max(currentVersion, Number(incoming.baseVersion || 0)) + 1;
  const write = await writeCheckpoint(db, incoming.stateJson, nextVersion, email);

  try {
    const mutationId = context.request.headers.get("X-CWS-Client-Mutation-Id") || `m${Date.now()}${Math.random().toString(36).slice(2, 9)}`;
    await db.prepare(
      `INSERT OR REPLACE INTO app_state_save_log
       (tenant_id, state_key, mutation_id, version, base_version, bytes, project_count, gantt_row_count, actor_email, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'checkpointed', CURRENT_TIMESTAMP)`
    ).bind(TENANT_ID, STATE_KEY, mutationId, nextVersion, incoming.baseVersion, incoming.bytes, incoming.metrics.projectCount, incoming.metrics.ganttRowCount, email).run();
  } catch (_) {}

  return json({
    ok: true,
    version: nextVersion,
    updatedBy: email,
    bytes: incoming.bytes,
    v128: {
      marker: MARKER,
      stablePut: true,
      chunked: write.chunked,
      chunkCount: write.chunkCount,
      chunkSize: CHUNK_SIZE
    }
  }, 200);
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.pathname !== "/api/state") return context.next();

  if (context.request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (context.request.method === "GET") {
    try { return await handleStateGet(context, url); }
    catch (error) { return json({ ok: false, error: error.message || String(error), v128: { marker: MARKER, stage: "GET" } }, error.status || 500); }
  }
  if (context.request.method === "PUT") {
    try { return await handleStatePut(context, url); }
    catch (error) { return json({ ok: false, error: error.message || String(error), metrics: error.metrics || null, v128: { marker: MARKER, stage: "PUT" } }, error.status || 500); }
  }
  return json({ ok: false, error: "Method not allowed", v128: { marker: MARKER } }, 405);
}
