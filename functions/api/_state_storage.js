import { MAX_STATE_BYTES, STATE_KEY, TENANT_ID, httpError } from "./_shared.js";
import { byteLength, sanitizeStateObject } from "./_validation.js";

export const CHUNK_CHAR_SIZE = 180_000;
export const CHUNK_THRESHOLD_BYTES = 700_000;
export const RETAIN_VERSIONS = 8;
export const MANIFEST_MARKER = "cws-state-v2-atomic";

function resultChanges(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0) || 0;
}

function isVersionConflictError(error) {
  const message = String(error?.message || error || "");
  return /CWS_VERSION_CONFLICT|STATE_VERSION_GUARD|UNIQUE constraint failed:\s*app_state_commits\.(?:tenant_id|state_key|parent_version)/i.test(message);
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function splitStateIntoChunks(raw) {
  const chunks = [];
  for (let offset = 0; offset < raw.length; offset += CHUNK_CHAR_SIZE) chunks.push(raw.slice(offset, offset + CHUNK_CHAR_SIZE));
  return chunks;
}

export function parseStateManifest(raw) {
  if (!raw || String(raw).length > 16_384) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.__cwsStateManifest === 2 && Number(parsed.version) >= 1 && Number(parsed.chunkCount) >= 1) return parsed;
    if ((parsed?.__cwsChunkedState || parsed?.__cwsStateChunkManifest) && Number(parsed.version) >= 1 && Number(parsed.chunkCount) >= 1) {
      return {
        __cwsStateManifest: 1,
        marker: parsed.marker || "legacy-chunk-manifest",
        tenantId: parsed.tenantId || TENANT_ID,
        stateKey: parsed.stateKey || STATE_KEY,
        version: Number(parsed.version),
        bytes: Number(parsed.bytes || 0),
        chunkCount: Number(parsed.chunkCount),
        chunkSize: Number(parsed.chunkSize || 0),
        checksum: String(parsed.checksum || ""),
        createdAt: parsed.createdAt || null,
        updatedBy: parsed.updatedBy || null
      };
    }
  } catch (_) {}
  return null;
}

function makeManifest({ version, bytes, chunkCount, checksum, email }) {
  return JSON.stringify({
    __cwsStateManifest: 2,
    marker: MANIFEST_MARKER,
    tenantId: TENANT_ID,
    stateKey: STATE_KEY,
    version,
    bytes,
    chunkCount,
    chunkSize: CHUNK_CHAR_SIZE,
    checksum,
    createdAt: new Date().toISOString(),
    updatedBy: email
  });
}

function stateVersionPredicate() {
  return `(
    (? = 0 AND NOT EXISTS (
      SELECT 1 FROM app_state WHERE tenant_id = ? AND state_key = ?
    ))
    OR EXISTS (
      SELECT 1 FROM app_state WHERE tenant_id = ? AND state_key = ? AND version = ?
    )
  )`;
}

function predicateBindings(baseVersion) {
  return [baseVersion, TENANT_ID, STATE_KEY, TENANT_ID, STATE_KEY, baseVersion];
}

function prepareConditionalChunk(db, { version, index, text, baseVersion }) {
  return db.prepare(`
    INSERT INTO app_state_chunks
      (tenant_id, state_key, version, chunk_index, chunk_text, created_at)
    SELECT ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
    WHERE ${stateVersionPredicate()}
  `).bind(TENANT_ID, STATE_KEY, version, index, text, ...predicateBindings(baseVersion));
}

function prepareConditionalCommit(db, { version, baseVersion, storedJson, checksum, bytes, chunkCount, email }) {
  return db.prepare(`
    INSERT INTO app_state_commits
      (tenant_id, state_key, version, parent_version, state_json, checksum, bytes, chunk_count, created_at, created_by)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?
    WHERE ${stateVersionPredicate()}
  `).bind(TENANT_ID, STATE_KEY, version, baseVersion, storedJson, checksum, bytes, chunkCount, email, ...predicateBindings(baseVersion));
}

function prepareConditionalUpdate(db, { version, baseVersion, storedJson, email }) {
  return db.prepare(`
    UPDATE app_state
       SET state_json = ?, version = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
     WHERE tenant_id = ? AND state_key = ? AND version = ?
  `).bind(storedJson, version, email, TENANT_ID, STATE_KEY, baseVersion);
}

function prepareConditionalInsert(db, { version, baseVersion, storedJson, email }) {
  return db.prepare(`
    INSERT INTO app_state (tenant_id, state_key, state_json, version, updated_at, updated_by)
    SELECT ?, ?, ?, ?, CURRENT_TIMESTAMP, ?
    WHERE ? = 0 AND NOT EXISTS (
      SELECT 1 FROM app_state WHERE tenant_id = ? AND state_key = ?
    )
  `).bind(TENANT_ID, STATE_KEY, storedJson, version, email, baseVersion, TENANT_ID, STATE_KEY);
}

function prepareRetentionCleanup(db, tableName, version) {
  const safeTable = tableName === "app_state_commits" ? "app_state_commits" : "app_state_chunks";
  return db.prepare(`
    DELETE FROM ${safeTable}
     WHERE tenant_id = ? AND state_key = ? AND version < ?
       AND EXISTS (
         SELECT 1 FROM app_state WHERE tenant_id = ? AND state_key = ? AND version = ?
       )
  `).bind(TENANT_ID, STATE_KEY, Math.max(0, version - RETAIN_VERSIONS + 1), TENANT_ID, STATE_KEY, version);
}

export function stateMetrics(state) {
  const projectOrder = Array.isArray(state?.projects?.order) ? state.projects.order.length : 0;
  const projectById = state?.projects?.byId && typeof state.projects.byId === "object" && !Array.isArray(state.projects.byId) ? Object.keys(state.projects.byId).length : 0;
  const legacyProjects = Array.isArray(state?.projects) ? state.projects.length : 0;
  const byProject = state?.ganttV2?.byProject && typeof state.ganttV2.byProject === "object" ? state.ganttV2.byProject : {};
  const ganttRows = Object.values(byProject).reduce((sum, model) => sum + (Array.isArray(model?.rows) ? model.rows.length : 0), 0);
  return { projectCount: Math.max(projectOrder, projectById, legacyProjects), ganttRowCount: ganttRows };
}

export function isDestructiveReplacement(currentState, incomingState) {
  const current = stateMetrics(currentState || {});
  const incoming = stateMetrics(incomingState || {});
  const projectLoss = current.projectCount - incoming.projectCount;
  const ganttLoss = current.ganttRowCount - incoming.ganttRowCount;
  const projectsCatastrophic = current.projectCount >= 20 && projectLoss >= 10 && incoming.projectCount <= Math.floor(current.projectCount * 0.35);
  const ganttCatastrophic = current.ganttRowCount >= 100 && ganttLoss >= 50 && incoming.ganttRowCount <= Math.floor(current.ganttRowCount * 0.35);
  return { destructive: projectsCatastrophic || ganttCatastrophic, current, incoming };
}

export function sanitizeStateForPersistence(input) {
  const clean = sanitizeStateObject(input);
  const byProject = clean?.ganttV2?.byProject;
  if (byProject && typeof byProject === "object" && !Array.isArray(byProject)) {
    for (const model of Object.values(byProject)) {
      if (!Array.isArray(model?.revisions)) continue;
      model.revisions = model.revisions.map(revision => {
        if (!revision || typeof revision !== "object") return revision;
        const next = { ...revision };
        if (next.snapshot && typeof next.snapshot === "object") {
          const snapshot = { ...next.snapshot };
          delete snapshot.capacity;
          delete snapshot.gantt;
          delete snapshot.hoursByDay;
          delete snapshot.sourcesByDay;
          delete snapshot.projectDeptHoursValidation;
          snapshot.meta = snapshot.meta && typeof snapshot.meta === "object" ? snapshot.meta : {};
          snapshot.meta.capacityExcludedFromRevision = true;
          next.snapshot = snapshot;
        }
        return next;
      });
    }
  }
  return clean;
}

export async function writeStateCAS(db, { state, baseVersion, email }) {
  if (!Number.isInteger(baseVersion) || baseVersion < 0) throw httpError("baseVersion ontbreekt of is ongeldig.", 428, "BASE_VERSION_REQUIRED");
  const cleanState = sanitizeStateForPersistence(state);
  const raw = JSON.stringify(cleanState);
  const bytes = byteLength(raw);
  if (bytes > MAX_STATE_BYTES) throw httpError("State payload is te groot.", 413, "STATE_TOO_LARGE", { bytes, maxBytes: MAX_STATE_BYTES });

  const current = await db.prepare(
    "SELECT version FROM app_state WHERE tenant_id = ? AND state_key = ?"
  ).bind(TENANT_ID, STATE_KEY).first();
  const currentVersion = Number(current?.version || 0);
  if (currentVersion !== baseVersion) {
    return { ok: false, conflict: true, currentVersion, baseVersion };
  }

  const version = baseVersion + 1;
  const checksum = await sha256Hex(raw);
  const chunks = bytes > CHUNK_THRESHOLD_BYTES ? splitStateIntoChunks(raw) : [];
  const storedJson = chunks.length ? makeManifest({ version, bytes, chunkCount: chunks.length, checksum, email }) : raw;
  const statements = [];
  // Publiceer eerst een immutable commitrecord en vervolgens de bijbehorende chunks.
  // D1 batch() is atomair: iedere fout draait de volledige set terug voordat de actieve pointer wijzigt.
  statements.push(prepareConditionalCommit(db, {
    version,
    baseVersion,
    storedJson,
    checksum,
    bytes,
    chunkCount: chunks.length,
    email
  }));
  chunks.forEach((text, index) => statements.push(prepareConditionalChunk(db, { version, index, text, baseVersion })));
  const updateIndex = statements.length;
  statements.push(prepareConditionalUpdate(db, { version, baseVersion, storedJson, email }));
  const insertIndex = statements.length;
  statements.push(prepareConditionalInsert(db, { version, baseVersion, storedJson, email }));
  statements.push(prepareRetentionCleanup(db, "app_state_chunks", version));
  statements.push(prepareRetentionCleanup(db, "app_state_commits", version));

  let results;
  try {
    results = await db.batch(statements);
  } catch (error) {
    if (!isVersionConflictError(error)) throw error;
    const latest = await db.prepare("SELECT version FROM app_state WHERE tenant_id = ? AND state_key = ?")
      .bind(TENANT_ID, STATE_KEY).first();
    return { ok: false, conflict: true, currentVersion: Number(latest?.version || 0), baseVersion };
  }
  const stateChanges = resultChanges(results?.[updateIndex]) + resultChanges(results?.[insertIndex]);
  if (stateChanges !== 1) {
    const latest = await db.prepare("SELECT version FROM app_state WHERE tenant_id = ? AND state_key = ?")
      .bind(TENANT_ID, STATE_KEY).first();
    return { ok: false, conflict: true, currentVersion: Number(latest?.version || 0), baseVersion };
  }
  return { ok: true, state: cleanState, version, baseVersion, bytes, checksum, chunked: chunks.length > 0, chunkCount: chunks.length };
}

async function readChunks(db, version, expectedCount, expectedChecksum = "", expectedBytes = 0) {
  const result = await db.prepare(`
    SELECT chunk_index, chunk_text FROM app_state_chunks
     WHERE tenant_id = ? AND state_key = ? AND version = ?
     ORDER BY chunk_index ASC
  `).bind(TENANT_ID, STATE_KEY, version).all();
  const rows = result.results || [];
  if (rows.length !== expectedCount) throw httpError(`Statechunks zijn incompleet voor versie ${version}.`, 500, "STATE_CHUNKS_INCOMPLETE", { found: rows.length, expected: expectedCount });
  for (let index = 0; index < rows.length; index += 1) {
    if (Number(rows[index].chunk_index) !== index) throw httpError(`Statechunk ${index} ontbreekt voor versie ${version}.`, 500, "STATE_CHUNK_INDEX");
  }
  const raw = rows.map(row => String(row.chunk_text || "")).join("");
  if (expectedBytes && byteLength(raw) !== Number(expectedBytes)) throw httpError("Statechunk-grootte komt niet overeen met het manifest.", 500, "STATE_BYTES_MISMATCH");
  if (expectedChecksum && await sha256Hex(raw) !== expectedChecksum) throw httpError("Statechecksum komt niet overeen met het manifest.", 500, "STATE_CHECKSUM_MISMATCH");
  JSON.parse(raw);
  return raw;
}

async function readStoredJson(db, storedJson, fallbackVersion = 0) {
  const manifest = parseStateManifest(storedJson);
  if (!manifest) {
    const state = JSON.parse(storedJson);
    return { raw: storedJson, state, manifest: null, version: Number(fallbackVersion || 0), bytes: byteLength(storedJson), checksum: await sha256Hex(storedJson), chunked: false, chunkCount: 0 };
  }
  const raw = await readChunks(db, Number(manifest.version || fallbackVersion), Number(manifest.chunkCount), String(manifest.checksum || ""), Number(manifest.bytes || 0));
  return { raw, state: JSON.parse(raw), manifest, version: Number(manifest.version || fallbackVersion), bytes: byteLength(raw), checksum: manifest.checksum || await sha256Hex(raw), chunked: true, chunkCount: Number(manifest.chunkCount) };
}

export async function readActiveState(db, { recover = true } = {}) {
  const row = await db.prepare(`
    SELECT state_json, version, updated_at, updated_by
      FROM app_state WHERE tenant_id = ? AND state_key = ?
  `).bind(TENANT_ID, STATE_KEY).first();
  if (!row?.state_json) return { exists: false, state: null, raw: "", version: 0, activeVersion: 0, row: null, recovered: false, chunked: false, chunkCount: 0, bytes: 0, checksum: "" };
  try {
    const resolved = await readStoredJson(db, row.state_json, row.version);
    return { exists: true, ...resolved, activeVersion: Number(row.version || resolved.version), row, recovered: false };
  } catch (activeError) {
    if (!recover) throw activeError;
    const commits = await db.prepare(`
      SELECT version, state_json, checksum, bytes, chunk_count, created_at, created_by
        FROM app_state_commits
       WHERE tenant_id = ? AND state_key = ? AND version <= ?
       ORDER BY version DESC LIMIT ?
    `).bind(TENANT_ID, STATE_KEY, Number(row.version || 0), RETAIN_VERSIONS).all();
    for (const commit of (commits.results || [])) {
      try {
        const resolved = await readStoredJson(db, commit.state_json, commit.version);
        return {
          exists: true,
          ...resolved,
          activeVersion: Number(row.version || 0),
          row,
          recovered: true,
          recoveredFromVersion: Number(commit.version),
          activeError: activeError.message
        };
      } catch (_) {}
    }
    throw activeError;
  }
}

export async function readStateChunk(db, { version, index }) {
  if (!Number.isInteger(version) || version < 1 || !Number.isInteger(index) || index < 0) throw httpError("Chunkparameters zijn ongeldig.", 400, "CHUNK_PARAMETERS_INVALID");
  const row = await db.prepare(`
    SELECT chunk_text FROM app_state_chunks
     WHERE tenant_id = ? AND state_key = ? AND version = ? AND chunk_index = ?
  `).bind(TENANT_ID, STATE_KEY, version, index).first();
  if (!row) throw httpError("Statechunk niet gevonden.", 404, "STATE_CHUNK_NOT_FOUND");
  return String(row.chunk_text || "");
}
