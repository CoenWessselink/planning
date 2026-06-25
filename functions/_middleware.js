import { MAX_STATE_BYTES, STATE_KEY, TENANT_ID, ensureSchema, getOrCreateUser, json, requireActorEmail, verifyRequiredSchema } from "./api/_shared.js";

const MARKER = "v112-checkpoint-first-state-save";
const CHUNK_SIZE = 180000;
const CHUNK_THRESHOLD_BYTES = 700000;
const enc = (v) => new TextEncoder().encode(String(v || "")).byteLength;

function split(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) chunks.push(text.slice(i, i + CHUNK_SIZE));
  return chunks;
}

function chunkManifest(version, bytes, chunkCount, updatedBy) {
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

function metrics(raw) {
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

function assertSafe(raw) {
  const m = metrics(raw);
  if (m.parseError) throw Object.assign(new Error("Opslaan geblokkeerd: ongeldige JSON."), { status: 400, metrics: m });
  if (m.projectCount <= 5 || (m.projectCount < 10 && m.ganttRowCount <= 20)) {
    throw Object.assign(new Error(`Opslaan geblokkeerd: state lijkt leeg/demo (${m.projectCount} projecten/${m.ganttRowCount} rijen).`), { status: 409, metrics: m });
  }
  return m;
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

async function readIncomingState(context) {
  const url = new URL(context.request.url);
  const bodyText = await context.request.text();
  if (enc(bodyText) > MAX_STATE_BYTES) throw Object.assign(new Error("State payload is te groot."), { status: 413 });
  const rawMode = context.request.headers.get("X-CWS-State-Payload") === "raw-state" || url.searchParams.get("payload") === "raw-state";
  if (rawMode) {
    return {
      stateJson: stripRevisionDerivedData(bodyText),
      baseVersion: Number(context.request.headers.get("X-CWS-Base-Version") || url.searchParams.get("baseVersion") || 0)
    };
  }
  const parsed = JSON.parse(bodyText);
  if (!parsed?.state || typeof parsed.state !== "object") throw Object.assign(new Error("Body moet een state-object bevatten."), { status: 400 });
  return {
    stateJson: stripRevisionDerivedData(JSON.stringify(parsed.state)),
    baseVersion: Number(parsed.baseVersion || 0)
  };
}

async function writeCheckpoint(db, raw, version, email) {
  const bytes = enc(raw);
  if (bytes <= CHUNK_THRESHOLD_BYTES) {
    await db.prepare(`INSERT INTO app_state (tenant_id, state_key, state_json, version, updated_at, updated_by)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(tenant_id, state_key) DO UPDATE SET
        state_json = excluded.state_json,
        version = excluded.version,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = excluded.updated_by`).bind(TENANT_ID, STATE_KEY, raw, version, email).run();
    return { chunked: false, chunkCount: 0, bytes };
  }

  const chunks = split(raw);
  const manifest = chunkManifest(version, bytes, chunks.length, email);
  await db.prepare(`DELETE FROM app_state_chunks WHERE tenant_id = ? AND state_key = ? AND version = ?`).bind(TENANT_ID, STATE_KEY, version).run();
  for (let i = 0; i < chunks.length; i += 1) {
    await db.prepare(`INSERT OR REPLACE INTO app_state_chunks (tenant_id, state_key, version, chunk_index, chunk_text)
      VALUES (?, ?, ?, ?, ?)`).bind(TENANT_ID, STATE_KEY, version, i, chunks[i]).run();
  }
  await db.prepare(`INSERT INTO app_state (tenant_id, state_key, state_json, version, updated_at, updated_by)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    ON CONFLICT(tenant_id, state_key) DO UPDATE SET
      state_json = excluded.state_json,
      version = excluded.version,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = excluded.updated_by`).bind(TENANT_ID, STATE_KEY, manifest, version, email).run();
  return { chunked: true, chunkCount: chunks.length, bytes };
}

async function writeSaveLogBestEffort(db, { version, baseVersion, mutationId, email, metrics: m }) {
  try {
    await db.prepare(`INSERT OR REPLACE INTO app_state_save_log
      (tenant_id, state_key, mutation_id, version, base_version, bytes, project_count, gantt_row_count, actor_email, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'checkpointed', CURRENT_TIMESTAMP)`)
      .bind(TENANT_ID, STATE_KEY, mutationId, version, baseVersion, m.bytes, m.projectCount, m.ganttRowCount, email)
      .run();
  } catch (_) {
    // Log/audit must never block the real planning checkpoint.
  }
}

async function handleStatePut(context) {
  const db = context.env?.DB;
  if (!db) return json({ ok: false, error: "D1-binding DB ontbreekt.", v112: { marker: MARKER } }, 500);

  const email = requireActorEmail(context.request);
  if (!email) return json({ ok: false, error: "Cloudflare Access-identiteit ontbreekt.", v112: { marker: MARKER } }, 401);

  try {
    await prepare(db);
    const user = await getOrCreateUser(db, email);
    if (!user.active) return json({ ok: false, error: "Gebruiker is inactief.", v112: { marker: MARKER } }, 403);
    if (user.role === "viewer") return json({ ok: false, error: "Viewer heeft alleen leesrechten.", v112: { marker: MARKER } }, 403);

    const incoming = await readIncomingState(context);
    const m = assertSafe(incoming.stateJson);
    const current = await db.prepare(`SELECT version FROM app_state WHERE tenant_id = ? AND state_key = ?`).bind(TENANT_ID, STATE_KEY).first();
    const version = Math.max(Number(current?.version || 0), Number(incoming.baseVersion || 0)) + 1;
    const mutationId = context.request.headers.get("X-CWS-Client-Mutation-Id") || `m${Date.now()}${Math.random().toString(36).slice(2, 9)}`;

    // Canonical rule: first persist the real checkpoint. Anything else is non-blocking.
    const checkpoint = await writeCheckpoint(db, incoming.stateJson, version, email);
    await writeSaveLogBestEffort(db, { version, baseVersion: incoming.baseVersion, mutationId, email, metrics: m });

    return json({
      ok: true,
      version,
      updatedBy: email,
      bytes: m.bytes,
      mutationId,
      v112: {
        marker: MARKER,
        checkpointFirst: true,
        chunked: checkpoint.chunked,
        chunkCount: checkpoint.chunkCount
      }
    }, 200);
  } catch (error) {
    return json({
      ok: false,
      error: error.message || String(error),
      metrics: error.metrics || null,
      v112: { marker: MARKER, checkpointFirst: true }
    }, error.status || 500);
  }
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.pathname === "/api/state" && context.request.method === "PUT") return handleStatePut(context);
  return context.next();
}
