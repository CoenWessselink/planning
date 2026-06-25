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

const MARKER = "v118-latest-valid-chunk-recovery";
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

function buildChunkManifest(version, bytes, chunkCount, updatedBy, extra = {}) {
  return JSON.stringify({
    __cwsChunkedState: true,
    marker: MARKER,
    version,
    bytes,
    chunkCount,
    updatedBy,
    tenantId: TENANT_ID,
    stateKey: STATE_KEY,
    createdAt: new Date().toISOString(),
    ...extra
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

async function readChunkRows(db, version) {
  const result = await db.prepare(
    `SELECT chunk_index, chunk_text FROM app_state_chunks
     WHERE tenant_id = ? AND state_key = ? AND version = ?
     ORDER BY chunk_index ASC`
  ).bind(TENANT_ID, STATE_KEY, Number(version || 0)).all();
  return result.results || [];
}

function assertConsecutiveChunks(rows, version) {
  if (!rows.length) {
    const error = new Error(`Geen D1 chunks gevonden voor state-versie ${version}.`);
    error.status = 500;
    throw error;
  }
  for (let i = 0; i < rows.length; i += 1) {
    if (Number(rows[i].chunk_index) !== i) {
      const error = new Error(`D1 chunk-index ontbreekt of is ongeldig bij versie ${version}, index ${i}.`);
      error.status = 500;
      throw error;
    }
  }
}

async function readChunksAsJson(db, version, expectedCount = null) {
  const rows = await readChunkRows(db, version);
  assertConsecutiveChunks(rows, version);
  if (expectedCount != null && rows.length !== Number(expectedCount || 0)) {
    const error = new Error(`D1 chunked state incompleet: ${rows.length}/${expectedCount} chunks gevonden voor versie ${version}.`);
    error.status = 500;
    throw error;
  }
  const stateJson = rows.map(r => r.chunk_text || "").join("");
  try { JSON.parse(stateJson); }
  catch (error) {
    const wrapped = new Error(`D1 chunks vormen geen geldige JSON voor versie ${version} (${error.message}).`);
    wrapped.status = 500;
    throw wrapped;
  }
  return { stateJson, rows, bytes: textByteLength(stateJson), version:Number(version || 0) };
}

async function findLatestRecoverableChunkVersion(db, skipVersion = null) {
  const result = await db.prepare(
    `SELECT version,
            COUNT(*) AS chunk_count,
            MIN(chunk_index) AS min_index,
            MAX(chunk_index) AS max_index
     FROM app_state_chunks
     WHERE tenant_id = ? AND state_key = ?
     GROUP BY version
     ORDER BY version DESC
     LIMIT 50`
  ).bind(TENANT_ID, STATE_KEY).all();
  const candidates = result.results || [];
  for (const row of candidates) {
    const version = Number(row.version || 0);
    if (!version || (skipVersion != null && version === Number(skipVersion))) continue;
    const count = Number(row.chunk_count || 0);
    const minIndex = Number(row.min_index ?? -1);
    const maxIndex = Number(row.max_index ?? -1);
    if (!count || minIndex !== 0 || maxIndex !== count - 1) continue;
    try {
      const recovered = await readChunksAsJson(db, version, count);
      const metrics = stateMetricsFromRaw(recovered.stateJson);
      if (!metrics.parseError && metrics.projectCount > 5) return recovered;
    } catch (_) {}
  }
  return null;
}

async function repairAppStateManifestBestEffort(db, row, manifest) {
  try {
    await db.prepare(
      `UPDATE app_state
       SET state_json = ?, version = ?, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND state_key = ?`
    ).bind(JSON.stringify(manifest), Number(manifest.version || row?.version || 0), TENANT_ID, STATE_KEY).run();
  } catch (_) {}
}

async function resolveStoredState(db, row) {
  const raw = row?.state_json || "";
  const currentVersion = Number(row?.version || 0);
  const parsedManifest = parseChunkManifest(raw);
  if (parsedManifest) {
    return {
      exists: true,
      type: "chunked-manifest",
      version: Number(parsedManifest.version || currentVersion),
      manifest: parsedManifest,
      inlineRaw: null,
      recovered: false
    };
  }

  if (raw) {
    try {
      JSON.parse(raw);
      return {
        exists: true,
        type: "inline-json",
        version: currentVersion,
        manifest: null,
        inlineRaw: raw,
        recovered: false
      };
    } catch (parseError) {
      let recovered = null;
      let recoveryMode = "none";
      try {
        recovered = await readChunksAsJson(db, currentVersion, null);
        recoveryMode = "same-version-chunks";
      } catch (_) {
        recovered = await findLatestRecoverableChunkVersion(db, currentVersion);
        recoveryMode = recovered ? "latest-valid-chunk-version" : "none";
      }

      if (recovered?.stateJson) {
        const manifest = {
          __cwsChunkedState: true,
          marker: MARKER,
          tenantId: TENANT_ID,
          stateKey: STATE_KEY,
          version: recovered.version,
          bytes: recovered.bytes,
          chunkCount: recovered.rows.length,
          updatedBy: row?.updated_by || "recovered",
          recoveredFromTruncatedStateJson: true,
          recoveredFromDifferentVersion: recovered.version !== currentVersion,
          corruptInlineVersion: currentVersion,
          recoveryMode,
          recoveredAt: new Date().toISOString(),
          originalParseError: parseError.message
        };
        await repairAppStateManifestBestEffort(db, row, manifest);
        return {
          exists: true,
          type: recoveryMode,
          version: recovered.version,
          manifest,
          inlineRaw: null,
          recovered: true
        };
      }

      const error = new Error(`D1-state is ongeldige JSON en er is geen herstelbare complete chunk-set gevonden (${parseError.message}).`);
      error.status = 500;
      throw error;
    }
  }

  return { exists: false, type: "empty", version: 0, manifest: null, inlineRaw: "", recovered: false };
}

async function readFullStateJson(db, row) {
  const resolved = await resolveStoredState(db, row);
  if (!resolved.exists) return "";
  if (resolved.type === "inline-json") return resolved.inlineRaw || "";
  const data = await readChunksAsJson(db, resolved.version, resolved.manifest?.chunkCount ?? null);
  return data.stateJson;
}

async function readStateChunkResponse(db, manifest, row, url) {
  const index = chunkIndexFromUrl(url);
  const version = Number(manifest?.version || row?.version || 0);
  if (index < 0 || index >= Number(manifest?.chunkCount || 0)) return json({ ok:false, error:"Ongeldige chunk-index.", v118:MARKER }, 400);
  const requestedVersion = Number(url.searchParams.get("version") || version);
  if (requestedVersion !== version) return json({ ok:false, error:`Chunkversie komt niet overeen (${requestedVersion} != ${version}).`, v118:MARKER }, 409);
  const chunk = await db.prepare(
    `SELECT chunk_text FROM app_state_chunks
     WHERE tenant_id = ? AND state_key = ? AND version = ? AND chunk_index = ?`
  ).bind(TENANT_ID, STATE_KEY, version, index).first();
  if (!chunk?.chunk_text) return json({ ok:false, error:`State chunk ${index} ontbreekt.`, v118:MARKER }, 500);
  return rawStateResponse(chunk.chunk_text || "", 200, {
    "X-CWS-OK": "true",
    "X-CWS-State-Exists": "1",
    "X-CWS-Version": String(version),
    "X-CWS-Bytes": String(textByteLength(chunk.chunk_text || "")),
    "X-CWS-Chunked": "1",
    "X-CWS-Chunked-Manifest": "0",
    "X-CWS-Chunk-Index": String(index),
    "X-CWS-Chunk-Count": String(Number(manifest?.chunkCount || 0)),
    "X-CWS-V118": MARKER
  });
}

function chunkManifestResponse(manifest, row, user, email, recovered = false) {
  const manifestVersion = Number(manifest?.version || row?.version || 0);
  const body = JSON.stringify({
    __cwsStateChunkManifest: true,
    __cwsChunkedState: true,
    marker: MARKER,
    tenantId: TENANT_ID,
    stateKey: STATE_KEY,
    version: manifestVersion,
    bytes: Number(manifest?.bytes || 0),
    chunkCount: Number(manifest?.chunkCount || 0),
    updatedAt: row?.updated_at || null,
    updatedBy: row?.updated_by || null,
    recoveredFromTruncatedStateJson: Boolean(recovered || manifest?.recoveredFromTruncatedStateJson),
    recoveredFromDifferentVersion: Boolean(manifest?.recoveredFromDifferentVersion),
    corruptInlineVersion: manifest?.corruptInlineVersion || null,
    recoveryMode: manifest?.recoveryMode || null
  });
  return rawStateResponse(body, 200, {
    "X-CWS-OK": "true",
    "X-CWS-State-Exists": "1",
    "X-CWS-Version": String(manifestVersion),
    "X-CWS-Updated-At": safeHeader(row?.updated_at || ""),
    "X-CWS-Updated-By": safeHeader(row?.updated_by || ""),
    "X-CWS-User-Email": safeHeader(user?.email || email),
    "X-CWS-User-Role": safeHeader(user?.role || "viewer"),
    "X-CWS-User-Display-Name": safeHeader(user?.display_name || user?.email || email),
    "X-CWS-Bytes": String(Number(manifest?.bytes || 0)),
    "X-CWS-Chunked": "1",
    "X-CWS-Chunked-Manifest": "1",
    "X-CWS-Chunk-Count": String(Number(manifest?.chunkCount || 0)),
    "X-CWS-Recovered-Truncated-State": recovered || manifest?.recoveredFromTruncatedStateJson ? "1" : "0",
    "X-CWS-V118": MARKER
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
  return { projectCount: Math.max(projectOrder, projectById, legacyProjectArray), ganttRowCount, bytes:textByteLength(raw) };
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
    error.guard = "v118-empty-state-guard";
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
    try { await db.prepare(`DELETE FROM app_state_chunks WHERE tenant_id = ? AND state_key = ? AND version <> ?`).bind(TENANT_ID, STATE_KEY, version).run(); } catch (_) {}
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
  try { await db.prepare(`DELETE FROM app_state_chunks WHERE tenant_id = ? AND state_key = ? AND version <> ?`).bind(TENANT_ID, STATE_KEY, version).run(); } catch (_) {}
  return { chunked:true, chunkCount:chunks.length, bytes };
}

async function auditBestEffort(db, email, metadata) {
  try { await writeAudit(db, email, "state_saved_checkpoint_first", metadata, "app_state", STATE_KEY); } catch (_) {}
}

export async function onRequestGet(context) {
  const db = context.env?.DB;
  if (!db) return json({ ok:false, error:"D1-binding DB ontbreekt.", v118:MARKER }, 500);
  const email = requireActorEmail(context.request);
  if (!email) return json({ ok:false, error:"Cloudflare Access-identiteit ontbreekt.", v118:MARKER }, 401);
  const url = new URL(context.request.url);
  const rawResponse = wantsRawStateResponse(context, url);

  try {
    const schema = await prepareDb(db);
    if (!schema.ok) return json({ ok:false, error:"D1-schema kon niet automatisch worden hersteld.", schemaErrors:schema.errors, v118:MARKER }, 500);
    const user = await getOrCreateUser(db, email);
    if (!user.active) return json({ ok:false, error:"Gebruiker is inactief.", v118:MARKER }, 403);
    const row = await db.prepare(
      `SELECT state_json, version, updated_at, updated_by FROM app_state WHERE tenant_id = ? AND state_key = ?`
    ).bind(TENANT_ID, STATE_KEY).first();
    const exists = Boolean(row?.state_json);
    const resolved = exists ? await resolveStoredState(db, row) : { exists:false, type:"empty", version:0, manifest:null, inlineRaw:"", recovered:false };
    const manifest = resolved.manifest;

    if (exists && manifest && chunkIndexFromUrl(url) >= 0) return readStateChunkResponse(db, manifest, row, url);
    if (exists && manifest && (rawResponse || wantsChunkManifestResponse(context, url))) return chunkManifestResponse(manifest, row, user, email, resolved.recovered);

    const fullStateJson = exists ? await readFullStateJson(db, row) : "";
    const bytes = textByteLength(fullStateJson || "");
    if (rawResponse) {
      return rawStateResponse(fullStateJson || "", 200, {
        "X-CWS-OK": "true",
        "X-CWS-State-Exists": exists ? "1" : "0",
        "X-CWS-Version": String(Number(resolved?.version || row?.version || 0)),
        "X-CWS-Updated-At": safeHeader(row?.updated_at || ""),
        "X-CWS-Updated-By": safeHeader(row?.updated_by || ""),
        "X-CWS-User-Email": safeHeader(user.email || email),
        "X-CWS-User-Role": safeHeader(user.role || "viewer"),
        "X-CWS-User-Display-Name": safeHeader(user.display_name || user.email || email),
        "X-CWS-Bytes": String(bytes),
        "X-CWS-Chunked": "0",
        "X-CWS-Chunk-Count": "0",
        "X-CWS-Recovered-Truncated-State": resolved.recovered ? "1" : "0",
        "X-CWS-V118": MARKER
      });
    }
    return json({
      ok:true,
      exists,
      tenantId:TENANT_ID,
      stateKey:STATE_KEY,
      version:Number(resolved?.version || row?.version || 0),
      stateJson:fullStateJson || null,
      stateEncoding:exists ? "json-string" : "empty",
      bytes,
      updatedAt:row?.updated_at || null,
      updatedBy:row?.updated_by || null,
      user:{ email:user.email, displayName:user.display_name, role:user.role, active:Boolean(user.active) },
      v118:{ marker:MARKER, checkpointFirst:true, recoveredTruncatedState:resolved.recovered, storageType:resolved.type }
    });
  } catch (error) {
    return json({ ok:false, error:error.message || String(error), v118:MARKER }, error.status || 500);
  }
}

export async function onRequestPut(context) {
  const db = context.env?.DB;
  if (!db) return json({ ok:false, error:"D1-binding DB ontbreekt.", v118:MARKER }, 500);
  const email = requireActorEmail(context.request);
  if (!email) return json({ ok:false, error:"Cloudflare Access-identiteit ontbreekt.", v118:MARKER }, 401);

  try {
    const schema = await prepareDb(db);
    if (!schema.ok) return json({ ok:false, error:"D1-schema kon niet automatisch worden hersteld.", schemaErrors:schema.errors, v118:MARKER }, 500);
    const user = await getOrCreateUser(db, email);
    if (!user.active) return json({ ok:false, error:"Gebruiker is inactief.", v118:MARKER }, 403);
    if (!canWriteState(user)) return json({ ok:false, error:"Viewer heeft alleen leesrechten.", v118:MARKER }, 403);

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
      v118:{ marker:MARKER, checkpointFirst:true, chunked:writeResult.chunked, chunkCount:writeResult.chunkCount }
    });
  } catch (error) {
    return json({
      ok:false,
      error:error.message || String(error),
      incomingMetrics:error.incomingMetrics || null,
      guard:error.guard || null,
      v118:{ marker:MARKER, checkpointFirst:true }
    }, error.status || 500);
  }
}

export function onRequest() {
  return json({ ok:false, error:"Method not allowed.", v118:MARKER }, 405);
}
