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

const MARKER = "v121-full-json-state-boot-response";
const CHUNK_SIZE = 180000;
const CHUNK_THRESHOLD_BYTES = 700000;
const enc = (v) => new TextEncoder().encode(String(v || "")).byteLength;

function split(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) chunks.push(text.slice(i, i + CHUNK_SIZE));
  return chunks;
}

function safeHeader(value) {
  return String(value ?? "").replace(/[\r\n]/g, " ");
}

function isRawStateRequest(request, url) {
  return request.headers.get("X-CWS-State-Response") === "raw-state" ||
    url.searchParams.get("payload") === "raw-state" ||
    url.searchParams.get("response") === "raw-state";
}

function wantsManifest(request, url) {
  return url.searchParams.get("chunks") === "manifest" ||
    request.headers.get("X-CWS-State-Response") === "chunk-manifest";
}

function chunkIndexFromUrl(url) {
  const raw = url.searchParams.get("chunkIndex") ?? url.searchParams.get("chunk") ?? "";
  const index = Number(raw);
  return Number.isInteger(index) && index >= 0 ? index : -1;
}

function parseManifest(raw) {
  if (!raw || raw.length > 4096) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.__cwsChunkedState && (parsed.stateKey === STATE_KEY || parsed.version || parsed.chunkCount)) return parsed;
    if (parsed?.__cwsStateChunkManifest && parsed.version && parsed.chunkCount) return parsed;
  } catch (_) {}
  return null;
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
    updatedBy,
    createdAt: new Date().toISOString(),
    ...extra
  });
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
}

async function readChunkRows(db, version) {
  const result = await db.prepare(
    `SELECT chunk_index, chunk_text FROM app_state_chunks
     WHERE tenant_id = ? AND state_key = ? AND version = ?
     ORDER BY chunk_index ASC`
  ).bind(TENANT_ID, STATE_KEY, Number(version || 0)).all();
  return result.results || [];
}

function assertConsecutive(rows, version) {
  if (!rows.length) throw Object.assign(new Error(`Geen chunks gevonden voor D1-state versie ${version}.`), { status: 500 });
  for (let i = 0; i < rows.length; i += 1) {
    if (Number(rows[i].chunk_index) !== i) {
      throw Object.assign(new Error(`Chunk-index ontbreekt voor D1-state versie ${version}, index ${i}.`), { status: 500 });
    }
  }
}

async function readChunksAsFullJson(db, version, expectedCount = null) {
  const rows = await readChunkRows(db, version);
  assertConsecutive(rows, version);
  if (expectedCount != null && rows.length !== Number(expectedCount || 0)) {
    throw Object.assign(new Error(`D1-state chunks incompleet voor versie ${version}: ${rows.length}/${expectedCount}.`), { status: 500 });
  }
  const full = rows.map(r => r.chunk_text || "").join("");
  try { JSON.parse(full); }
  catch (error) { throw Object.assign(new Error(`D1-state chunks vormen geen geldige JSON (${error.message}).`), { status: 500 }); }
  return { full, rows, bytes: enc(full), version: Number(version || 0) };
}

async function findLatestValidChunkSet(db) {
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
    try { return await readChunksAsFullJson(db, version, count); } catch (_) {}
  }
  return null;
}

async function resolveState(db, row) {
  if (!row?.state_json) return { exists: false, version: 0, full: "", manifest: null, recovered: false };
  const rowVersion = Number(row.version || 0);
  const manifest = parseManifest(row.state_json);
  if (manifest) {
    const version = Number(manifest.version || rowVersion || 0);
    const data = await readChunksAsFullJson(db, version, Number(manifest.chunkCount || 0) || null);
    return { exists: true, version, full: data.full, manifest: { ...manifest, version, bytes: data.bytes, chunkCount: data.rows.length }, recovered: false };
  }
  try {
    JSON.parse(row.state_json);
    return { exists: true, version: rowVersion, full: row.state_json, manifest: null, recovered: false };
  } catch (_) {
    const data = await findLatestValidChunkSet(db);
    if (!data) throw Object.assign(new Error("D1-state is corrupt en er is geen geldige chunk-set gevonden."), { status: 500 });
    const repairedManifest = JSON.parse(makeManifest(data.version, data.bytes, data.rows.length, row.updated_by || "recovered", { recoveredFromCorruptInlineState: true }));
    try {
      await db.prepare(
        `UPDATE app_state SET state_json = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND state_key = ?`
      ).bind(JSON.stringify(repairedManifest), data.version, TENANT_ID, STATE_KEY).run();
    } catch (_) {}
    return { exists: true, version: data.version, full: data.full, manifest: repairedManifest, recovered: true };
  }
}

function stateMetrics(raw) {
  try {
    const s = JSON.parse(raw);
    const order = Array.isArray(s?.projects?.order) ? s.projects.order.length : 0;
    const byId = s?.projects?.byId && typeof s.projects.byId === "object" && !Array.isArray(s.projects.byId) ? Object.keys(s.projects.byId).length : 0;
    const legacy = Array.isArray(s?.projects) ? s.projects.length : 0;
    const gp = s?.ganttV2?.byProject && typeof s.ganttV2.byProject === "object" ? s.ganttV2.byProject : {};
    const ganttRows = Object.values(gp).reduce((n, model) => n + (Array.isArray(model?.rows) ? model.rows.length : 0), 0);
    return { projectCount: Math.max(order, byId, legacy), ganttRowCount: ganttRows, bytes: enc(raw) };
  } catch (_) {
    return { projectCount: 0, ganttRowCount: 0, bytes: enc(raw), parseError: true };
  }
}

function assertSafeIncoming(raw) {
  const m = stateMetrics(raw);
  if (m.parseError) throw Object.assign(new Error("Opslaan geblokkeerd: inkomende state is geen geldige JSON."), { status: 400, metrics: m });
  if (m.projectCount <= 5 || (m.projectCount < 10 && m.ganttRowCount <= 20)) {
    throw Object.assign(new Error(`Opslaan geblokkeerd: state lijkt leeg/demo (${m.projectCount} projecten/${m.ganttRowCount} rijen).`), { status: 409, metrics: m });
  }
  return m;
}

async function handleStateGet(context, url) {
  const db = context.env?.DB;
  if (!db) return json({ ok: false, error: "D1-binding DB ontbreekt.", v121: { marker: MARKER } }, 500);
  const email = requireActorEmail(context.request);
  if (!email) return json({ ok: false, error: "Cloudflare Access-identiteit ontbreekt.", v121: { marker: MARKER } }, 401);
  await prepare(db);
  const user = await getOrCreateUser(db, email);
  if (!user.active) return json({ ok: false, error: "Gebruiker is inactief.", v121: { marker: MARKER } }, 403);

  const row = await db.prepare(
    `SELECT state_json, version, updated_at, updated_by FROM app_state WHERE tenant_id = ? AND state_key = ?`
  ).bind(TENANT_ID, STATE_KEY).first();
  const resolved = await resolveState(db, row);

  if (resolved.exists && chunkIndexFromUrl(url) >= 0) {
    const manifest = resolved.manifest || JSON.parse(makeManifest(resolved.version, enc(resolved.full), split(resolved.full).length, row?.updated_by || email));
    const index = chunkIndexFromUrl(url);
    const rows = await readChunkRows(db, resolved.version);
    const chunk = rows.find(r => Number(r.chunk_index) === index);
    if (!chunk) return json({ ok: false, error: `Chunk ${index} ontbreekt.`, v121: { marker: MARKER } }, 500);
    return rawStateResponse(chunk.chunk_text || "", 200, {
      "X-CWS-OK": "true",
      "X-CWS-State-Exists": "1",
      "X-CWS-Version": String(resolved.version),
      "X-CWS-Chunked": "1",
      "X-CWS-Chunked-Manifest": "0",
      "X-CWS-Chunk-Index": String(index),
      "X-CWS-Chunk-Count": String(Number(manifest.chunkCount || rows.length)),
      "X-CWS-V121": MARKER
    });
  }

  if (resolved.exists && wantsManifest(context.request, url)) {
    const manifest = resolved.manifest || JSON.parse(makeManifest(resolved.version, enc(resolved.full), split(resolved.full).length, row?.updated_by || email));
    return rawStateResponse(JSON.stringify({ ...manifest, __cwsStateChunkManifest: true }), 200, {
      "X-CWS-OK": "true",
      "X-CWS-State-Exists": "1",
      "X-CWS-Version": String(resolved.version),
      "X-CWS-Updated-At": safeHeader(row?.updated_at || ""),
      "X-CWS-Updated-By": safeHeader(row?.updated_by || ""),
      "X-CWS-User-Email": safeHeader(user.email || email),
      "X-CWS-User-Role": safeHeader(user.role || "viewer"),
      "X-CWS-User-Display-Name": safeHeader(user.display_name || user.email || email),
      "X-CWS-Bytes": String(enc(resolved.full)),
      "X-CWS-Chunked": "1",
      "X-CWS-Chunked-Manifest": "1",
      "X-CWS-Chunk-Count": String(Number(manifest.chunkCount || 0)),
      "X-CWS-Recovered-Truncated-State": resolved.recovered ? "1" : "0",
      "X-CWS-V121": MARKER
    });
  }

  if (isRawStateRequest(context.request, url)) {
    return rawStateResponse(resolved.full || "", 200, {
      "X-CWS-OK": "true",
      "X-CWS-State-Exists": resolved.exists ? "1" : "0",
      "X-CWS-Version": String(resolved.version || 0),
      "X-CWS-Updated-At": safeHeader(row?.updated_at || ""),
      "X-CWS-Updated-By": safeHeader(row?.updated_by || ""),
      "X-CWS-User-Email": safeHeader(user.email || email),
      "X-CWS-User-Role": safeHeader(user.role || "viewer"),
      "X-CWS-User-Display-Name": safeHeader(user.display_name || user.email || email),
      "X-CWS-Bytes": String(enc(resolved.full || "")),
      "X-CWS-Chunked": "0",
      "X-CWS-Chunked-Manifest": "0",
      "X-CWS-Recovered-Truncated-State": resolved.recovered ? "1" : "0",
      "X-CWS-Full-State-Json": "1",
      "X-CWS-V121": MARKER
    });
  }

  return json({
    ok: true,
    exists: resolved.exists,
    tenantId: TENANT_ID,
    stateKey: STATE_KEY,
    version: resolved.version || 0,
    stateJson: resolved.full || null,
    stateEncoding: resolved.exists ? "json-string" : "empty",
    bytes: enc(resolved.full || ""),
    updatedAt: row?.updated_at || null,
    updatedBy: row?.updated_by || null,
    user: { email: user.email, displayName: user.display_name, role: user.role, active: Boolean(user.active) },
    v121: { marker: MARKER, fullJsonBootResponse: true, recovered: resolved.recovered }
  });
}

async function readIncomingState(context, url) {
  const bodyText = await context.request.text();
  if (enc(bodyText) > MAX_STATE_BYTES) throw Object.assign(new Error("State payload is te groot."), { status: 413 });
  const rawMode = context.request.headers.get("X-CWS-State-Payload") === "raw-state" || url.searchParams.get("payload") === "raw-state";
  const stateJson = rawMode ? bodyText : JSON.stringify((JSON.parse(bodyText).state || {}));
  JSON.parse(stateJson);
  return {
    stateJson,
    baseVersion: Number(context.request.headers.get("X-CWS-Base-Version") || url.searchParams.get("baseVersion") || 0),
    bytes: enc(stateJson)
  };
}

async function writeCheckpoint(db, raw, version, email) {
  const bytes = enc(raw);
  if (bytes <= CHUNK_THRESHOLD_BYTES) {
    await db.prepare(
      `INSERT INTO app_state (tenant_id, state_key, state_json, version, updated_at, updated_by)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
       ON CONFLICT(tenant_id, state_key) DO UPDATE SET
         state_json = excluded.state_json,
         version = excluded.version,
         updated_at = CURRENT_TIMESTAMP,
         updated_by = excluded.updated_by`
    ).bind(TENANT_ID, STATE_KEY, raw, version, email).run();
    return { chunked: false, chunkCount: 0, bytes };
  }

  const chunks = split(raw);
  const manifest = makeManifest(version, bytes, chunks.length, email);
  await db.prepare(`DELETE FROM app_state_chunks WHERE tenant_id = ? AND state_key = ? AND version = ?`).bind(TENANT_ID, STATE_KEY, version).run();
  for (let i = 0; i < chunks.length; i += 1) {
    await db.prepare(
      `INSERT OR REPLACE INTO app_state_chunks (tenant_id, state_key, version, chunk_index, chunk_text)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(TENANT_ID, STATE_KEY, version, i, chunks[i]).run();
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
  return { chunked: true, chunkCount: chunks.length, bytes };
}

async function handleStatePut(context, url) {
  const db = context.env?.DB;
  if (!db) return json({ ok: false, error: "D1-binding DB ontbreekt.", v121: { marker: MARKER } }, 500);
  const email = requireActorEmail(context.request);
  if (!email) return json({ ok: false, error: "Cloudflare Access-identiteit ontbreekt.", v121: { marker: MARKER } }, 401);
  await prepare(db);
  const user = await getOrCreateUser(db, email);
  if (!user.active) return json({ ok: false, error: "Gebruiker is inactief.", v121: { marker: MARKER } }, 403);
  if (user.role === "viewer") return json({ ok: false, error: "Viewer heeft alleen leesrechten.", v121: { marker: MARKER } }, 403);

  const incoming = await readIncomingState(context, url);
  const m = assertSafeIncoming(incoming.stateJson);
  const current = await db.prepare(`SELECT version FROM app_state WHERE tenant_id = ? AND state_key = ?`).bind(TENANT_ID, STATE_KEY).first();
  const version = Math.max(Number(current?.version || 0), Number(incoming.baseVersion || 0)) + 1;
  const checkpoint = await writeCheckpoint(db, incoming.stateJson, version, email);

  try {
    const mutationId = context.request.headers.get("X-CWS-Client-Mutation-Id") || `m${Date.now()}${Math.random().toString(36).slice(2, 9)}`;
    await db.prepare(
      `INSERT OR REPLACE INTO app_state_save_log
       (tenant_id, state_key, mutation_id, version, base_version, bytes, project_count, gantt_row_count, actor_email, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'checkpointed', CURRENT_TIMESTAMP)`
    ).bind(TENANT_ID, STATE_KEY, mutationId, version, incoming.baseVersion, m.bytes, m.projectCount, m.ganttRowCount, email).run();
  } catch (_) {}

  return json({ ok: true, version, updatedBy: email, bytes: m.bytes, v121: { marker: MARKER, checkpointFirst: true, chunked: checkpoint.chunked, chunkCount: checkpoint.chunkCount } }, 200);
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.pathname === "/api/state" && context.request.method === "GET") {
    try { return await handleStateGet(context, url); }
    catch (error) { return json({ ok: false, error: error.message || String(error), v121: { marker: MARKER } }, error.status || 500); }
  }
  if (url.pathname === "/api/state" && context.request.method === "PUT") {
    try { return await handleStatePut(context, url); }
    catch (error) { return json({ ok: false, error: error.message || String(error), metrics: error.metrics || null, v121: { marker: MARKER, checkpointFirst: true } }, error.status || 500); }
  }
  return context.next();
}
