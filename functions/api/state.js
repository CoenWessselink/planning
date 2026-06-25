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

const MARKER = "v113-api-state-checkpoint-first";
const CHUNK_CHAR_SIZE = 180_000;
const CHUNK_THRESHOLD_BYTES = 700_000;

function textByteLength(value) {
  return new TextEncoder().encode(String(value || "")).byteLength;
}

function safeHeader(value) {
  return String(value ?? "").replace(/[\r\n]/g, " ");
}

async function prepareDb(db) {
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
  return schema;
}

function buildChunkManifest(version, bytes, chunkCount, updatedBy) {
  return JSON.stringify({
    __cwsChunkedState: true,
    marker: MARKER,
    version,
    bytes,
    chunkCount,
    updatedBy,
    tenantId: TENANT_ID,
    stateKey: STATE_KEY,
    createdAt: new Date().toISOString()
  });
}

function parseChunkManifest(raw) {
  if (!raw || raw.length > 4096) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.__cwsChunkedState && parsed?.stateKey === STATE_KEY) return parsed;
    if (parsed?.__cwsChunkedState && parsed?.version && parsed?.chunkCount) return parsed;
  } catch (_) {}
  return null;
}

function splitStateIntoChunks(stateJson) {
  const chunks = [];
  for (let i = 0; i < stateJson.length; i += CHUNK_CHAR_SIZE) chunks.push(stateJson.slice(i, i + CHUNK_CHAR_SIZE));
  return chunks;
}

function wantsRawStateResponse(context, url) {
  return context.request.headers.get("X-CWS-State-Response") === "raw-state" ||
    url.searchParams.get("payload") === "raw-state" ||
    url.searchParams.get("response") === "raw-state";
}

function wantsChunkManifestResponse(context, url) {
  return url.searchParams.get("chunks") === "auto" ||
    url.searchParams.get("chunks") === "manifest" ||
    context.request.headers.get("X-CWS-State-Response") === "chunk-manifest";
}

function chunkIndexFromUrl(url) {
  const raw = url.searchParams.get("chunkIndex") ?? url.searchParams.get("chunk") ?? "";
  const index = Number(raw);
  return Number.isInteger(index) && index >= 0 ? index : -1;
}

async function readFullStateJson(db, row) {
  const raw = row?.state_json || "";
  const manifest = parseChunkManifest(raw);
  if (!manifest) return raw;
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

async function readStateChunkResponse(db, manifest, row, url) {
  const index = chunkIndexFromUrl(url);
  const version = Number(manifest?.version || row?.version || 0);
  if (index < 0 || index >= Number(manifest?.chunkCount || 0)) return json({ ok:false, error:"Ongeldige chunk-index.", v113:MARKER }, 400);
  const requestedVersion = Number(url.searchParams.get("version") || version);
  if (requestedVersion !== version) return json({ ok:false, error:`Chunkversie komt niet overeen (${requestedVersion} != ${version}).`, v113:MARKER }, 409);
  const chunk = await db.prepare(
    `SELECT chunk_text FROM app_state_chunks
     WHERE tenant_id = ? AND state_key = ? AND version = ? AND chunk_index = ?`
  ).bind(TENANT_ID, STATE_KEY, version, index).first();
  if (!chunk?.chunk_text) return json({ ok:false, error:`State chunk ${index} ontbreekt.`, v113:MARKER }, 500);
  return rawStateResponse(chunk.chunk_text || "", 200, {
    "X-CWS-OK": "true",
    "X-CWS-State-Exists": "1",
    "X-CWS-Version": String(version),
    "X-CWS-Bytes": String(textByteLength(chunk.chunk_text || "")),
    "X-CWS-Chunked": "1",
    "X-CWS-Chunked-Manifest": "0",
    "X-CWS-Chunk-Index": String(index),
    "X-CWS-Chunk-Count": String(Number(manifest?.chunkCount || 0)),
    "X-CWS-V113": MARKER
  });
}

function chunkManifestResponse(manifest, row, user, email) {
  const body = JSON.stringify({
    __cwsStateChunkManifest: true,
    __cwsChunkedState: true,
    marker: MARKER,
    tenantId: TENANT_ID,
    stateKey: STATE_KEY,
    version: Number(manifest?.version || row?.version || 0),
    bytes: Number(manifest?.bytes || 0),
    chunkCount: Number(manifest?.chunkCount || 0),
    updatedAt: row?.updated_at || null,
    updatedBy: row?.updated_by || null
  });
  return rawStateResponse(body, 200, {
    "X-CWS-OK": "true",
    "X-CWS-State-Exists": "1",
    "X-CWS-Version": String(Number(row?.version || manifest?.version || 0)),
    "X-CWS-Updated-At": safeHeader(row?.updated_at || ""),
    "X-CWS-Updated-By": safeHeader(row?.updated_by || ""),
    "X-CWS-User-Email": safeHeader(user?.email || email),
    "X-CWS-User-Role": safeHeader(user?.role || "viewer"),
    "X-CWS-User-Display-Name": safeHeader(user?.display_name || user?.email || email),
    "X-CWS-Bytes": String(Number(manifest?.bytes || 0)),
    "X-CWS-Chunked": "1",
    "X-CWS-Chunked-Manifest": "1",
    "X-CWS-Chunk-Count": String(Number(manifest?.chunkCount || 0)),
    "X-CWS-V113": MARKER
  });
}

function extractSchemaVersionFromRawState(raw) {
  const match = String(raw || "").match(/"schemaVersion"\s*:\s*(\d+)/);
  return match ? Number(match[1]) : 0;
}

function parseBaseVersion(context, url) {
  const value = context.request.headers.get("X-CWS-Base-Version") ?? url.searchParams.get("baseVersion") ?? "0";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stripRevisionDerivedData(raw) {
  let state;
  try { state = JSON.parse(raw); } catch (_) { return raw; }
  const byProject = state?.ganttV2?.byProject || {};
  for (const model of Object.values(byProject)) {
    if (!Array.isArray(model?.revisions)) continue;
    model.revisions = model.revisions.map((rev) => {
      if (!rev || typeof rev !== "object") return rev;
      const next = { ...rev };
      const snap = JSON.parse(JSON.stringify(next.snapshot || {}));
      delete snap.capacity;
      delete snap.gantt;
      delete snap.hoursByDay;
      delete snap.sourcesByDay;
      delete snap.projectDeptHoursValidation;
      snap.meta = snap.meta && typeof snap.meta === "object" ? snap.meta : {};
      snap.meta.capacityExcludedFromRevision = true;
      snap.meta.capacityRevisionIsolation = MARKER;
      next.snapshot = snap;
      return next;
    });
  }
  state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};
  state.meta.stateSaveRoute = MARKER;
  return JSON.stringify(state);
}

function stateMetricsFromRaw(raw) {
  if (!raw) return { projectCount:0, ganttRowCount:0, bytes:0 };
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (_) { return { projectCount:0, ganttRowCount:0, bytes:textByteLength(raw), parseError:true }; }
  const projectOrder = Array.isArray(parsed?.projects?.order) ? parsed.projects.order.length : 0;
  const projectById = parsed?.projects?.byId && typeof parsed.projects.byId === "object" && !Array.isArray(parsed.projects.byId) ? Object.keys(parsed.projects.byId).length : 0;
  const legacyProjectArray = Array.isArray(parsed?.projects) ? parsed.projects.length : 0;
  const ganttByProject = parsed?.ganttV2?.byProject && typeof parsed.ganttV2.byProject === "object" && !Array.isArray(parsed.ganttV2.byProject) ? parsed.ganttV2.byProject : {};
  const ganttRowCount = Object.values(ganttByProject).reduce((sum, model) => sum + (Array.isArray(model?.rows) ? model.rows.length : 0), 0);
  return {
    projectCount: Math.max(projectOrder, projectById, legacyProjectArray),
    ganttRowCount,
    bytes: textByteLength(raw)
  };
}

function assertIncomingStateSafe(incomingRaw) {
  const incoming = stateMetricsFromRaw(incomingRaw);
  if (incoming.parseError) {
    const error = new Error("Opslaan geblokkeerd: inkomende state is geen geldige JSON.");
    error.status = 400;
    error.incomingMetrics = incoming;
    throw error;
  }
  const looksLikeDemoOrEmpty = incoming.projectCount <= 5 || (incoming.projectCount < 10 && incoming.ganttRowCount <= 20);
  if (looksLikeDemoOrEmpty) {
    const error = new Error(`Opslaan geblokkeerd: inkomende state lijkt leeg/demo (${incoming.projectCount} projecten/${incoming.ganttRowCount} rijen).`);
    error.status = 409;
    error.incomingMetrics = incoming;
    error.guard = "v113-empty-state-guard";
    throw error;
  }
  return incoming;
}

async function readIncomingState(context) {
  const url = new URL(context.request.url);
  const raw = await context.request.text();
  const requestBytes = textByteLength(raw);
  if (requestBytes > MAX_STATE_BYTES) {
    const error = new Error("State payload is te groot.");
    error.status = 413;
    throw error;
  }
  const rawMode = context.request.headers.get("X-CWS-State-Payload") === "raw-state" || url.searchParams.get("payload") === "raw-state";
  if (rawMode) {
    if (!extractSchemaVersionFromRawState(raw)) {
      const error = new Error("schemaVersion ontbreekt.");
      error.status = 400;
      throw error;
    }
    const stateJson = stripRevisionDerivedData(raw);
    return { stateJson, baseVersion: parseBaseVersion(context, url), bytes: textByteLength(stateJson), rawMode:true };
  }
  let body;
  try { body = JSON.parse(raw); }
  catch (_) {
    const error = new Error("Ongeldige JSON-body.");
    error.status = 400;
    throw error;
  }
  if (!body?.state || typeof body.state !== "object" || Array.isArray(body.state) || !Number(body.state.schemaVersion)) {
    const error = new Error("Body moet een state-object met schemaVersion bevatten.");
    error.status = 400;
    throw error;
  }
  const stateJson = stripRevisionDerivedData(JSON.stringify(body.state));
  return { stateJson, baseVersion:Number(body.baseVersion ?? 0), bytes:textByteLength(stateJson), rawMode:false };
}

async function writeCheckpoint(db, stateJson, version, email) {
  const bytes = textByteLength(stateJson);
  if (bytes <= CHUNK_THRESHOLD_BYTES) {
    await db.prepare(
      `INSERT INTO app_state
        (tenant_id, state_key, state_json, version, updated_at, updated_by)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
       ON CONFLICT(tenant_id, state_key) DO UPDATE SET
        state_json = excluded.state_json,
        version = excluded.version,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = excluded.updated_by`
    ).bind(TENANT_ID, STATE_KEY, stateJson, version, email).run();
    try {
      await db.prepare(`DELETE FROM app_state_chunks WHERE tenant_id = ? AND state_key = ? AND version <> ?`).bind(TENANT_ID, STATE_KEY, version).run();
    } catch (_) {}
    return { chunked:false, chunkCount:0, bytes };
  }

  const chunks = splitStateIntoChunks(stateJson);
  const manifest = buildChunkManifest(version, bytes, chunks.length, email);
  await db.prepare(`DELETE FROM app_state_chunks WHERE tenant_id = ? AND state_key = ? AND version = ?`).bind(TENANT_ID, STATE_KEY, version).run();
  for (let index = 0; index < chunks.length; index += 1) {
    await db.prepare(
      `INSERT OR REPLACE INTO app_state_chunks (tenant_id, state_key, version, chunk_index, chunk_text)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(TENANT_ID, STATE_KEY, version, index, chunks[index]).run();
  }
  await db.prepare(
    `INSERT INTO app_state
      (tenant_id, state_key, state_json, version, updated_at, updated_by)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
     ON CONFLICT(tenant_id, state_key) DO UPDATE SET
      state_json = excluded.state_json,
      version = excluded.version,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = excluded.updated_by`
  ).bind(TENANT_ID, STATE_KEY, manifest, version, email).run();
  try {
    await db.prepare(`DELETE FROM app_state_chunks WHERE tenant_id = ? AND state_key = ? AND version <> ?`).bind(TENANT_ID, STATE_KEY, version).run();
  } catch (_) {}
  return { chunked:true, chunkCount:chunks.length, bytes };
}

async function auditBestEffort(db, email, metadata) {
  try {
    await writeAudit(db, email, "state_saved_checkpoint_first", metadata, "app_state", STATE_KEY);
  } catch (_) {}
}

export async function onRequestGet(context) {
  const db = context.env?.DB;
  if (!db) return json({ ok:false, error:"D1-binding DB ontbreekt.", v113:MARKER }, 500);
  const email = requireActorEmail(context.request);
  if (!email) return json({ ok:false, error:"Cloudflare Access-identiteit ontbreekt.", v113:MARKER }, 401);
  const url = new URL(context.request.url);
  const rawResponse = wantsRawStateResponse(context, url);

  try {
    const schema = await prepareDb(db);
    if (!schema.ok) return json({ ok:false, error:"D1-schema kon niet automatisch worden hersteld.", schemaErrors:schema.errors, v113:MARKER }, 500);
    const user = await getOrCreateUser(db, email);
    if (!user.active) return json({ ok:false, error:"Gebruiker is inactief.", v113:MARKER }, 403);
    const row = await db.prepare(
      `SELECT state_json, version, updated_at, updated_by FROM app_state WHERE tenant_id = ? AND state_key = ?`
    ).bind(TENANT_ID, STATE_KEY).first();
    const exists = Boolean(row?.state_json);
    const manifest = parseChunkManifest(row?.state_json || "");

    if (exists && manifest && chunkIndexFromUrl(url) >= 0) return readStateChunkResponse(db, manifest, row, url);
    if (exists && manifest && (rawResponse || wantsChunkManifestResponse(context, url))) return chunkManifestResponse(manifest, row, user, email);

    const fullStateJson = exists ? await readFullStateJson(db, row) : "";
    const bytes = textByteLength(fullStateJson || "");
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
        "X-CWS-Chunked": "0",
        "X-CWS-Chunk-Count": "0",
        "X-CWS-V113": MARKER
      });
    }
    return json({
      ok:true,
      exists,
      tenantId:TENANT_ID,
      stateKey:STATE_KEY,
      version:Number(row?.version || 0),
      stateJson:fullStateJson || null,
      stateEncoding:exists ? "json-string" : "empty",
      bytes,
      updatedAt:row?.updated_at || null,
      updatedBy:row?.updated_by || null,
      user:{ email:user.email, displayName:user.display_name, role:user.role, active:Boolean(user.active) },
      v113:{ marker:MARKER, checkpointFirst:true }
    });
  } catch (error) {
    return json({ ok:false, error:error.message || String(error), v113:MARKER }, error.status || 500);
  }
}

export async function onRequestPut(context) {
  const db = context.env?.DB;
  if (!db) return json({ ok:false, error:"D1-binding DB ontbreekt.", v113:MARKER }, 500);
  const email = requireActorEmail(context.request);
  if (!email) return json({ ok:false, error:"Cloudflare Access-identiteit ontbreekt.", v113:MARKER }, 401);

  try {
    const schema = await prepareDb(db);
    if (!schema.ok) return json({ ok:false, error:"D1-schema kon niet automatisch worden hersteld.", schemaErrors:schema.errors, v113:MARKER }, 500);
    const user = await getOrCreateUser(db, email);
    if (!user.active) return json({ ok:false, error:"Gebruiker is inactief.", v113:MARKER }, 403);
    if (!canWriteState(user)) return json({ ok:false, error:"Viewer heeft alleen leesrechten.", v113:MARKER }, 403);

    const incoming = await readIncomingState(context);
    const incomingMetrics = assertIncomingStateSafe(incoming.stateJson);
    const current = await db.prepare(
      `SELECT version FROM app_state WHERE tenant_id = ? AND state_key = ?`
    ).bind(TENANT_ID, STATE_KEY).first();
    const currentVersion = Number(current?.version || 0);
    const baseVersion = Number(incoming.baseVersion || 0);
    const nextVersion = Math.max(currentVersion, baseVersion) + 1;

    const writeResult = await writeCheckpoint(db, incoming.stateJson, nextVersion, email);
    await auditBestEffort(db, email, {
      version:nextVersion,
      baseVersion,
      bytes:incoming.bytes,
      rawMode:incoming.rawMode,
      incomingMetrics,
      marker:MARKER,
      checkpointFirst:true,
      chunked:writeResult.chunked,
      chunkCount:writeResult.chunkCount
    });

    return json({
      ok:true,
      version:nextVersion,
      updatedBy:email,
      bytes:incoming.bytes,
      v113:{ marker:MARKER, checkpointFirst:true, chunked:writeResult.chunked, chunkCount:writeResult.chunkCount }
    });
  } catch (error) {
    return json({
      ok:false,
      error:error.message || String(error),
      incomingMetrics:error.incomingMetrics || null,
      guard:error.guard || null,
      v113:{ marker:MARKER, checkpointFirst:true }
    }, error.status || 500);
  }
}

export function onRequest() {
  return json({ ok:false, error:"Method not allowed.", v113:MARKER }, 405);
}
