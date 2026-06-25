import { TENANT_ID, STATE_KEY, ensureSchema, getOrCreateUser, json, requireActorEmail, verifyRequiredSchema } from "./_shared.js";

const MARKER = "v133-durable-project-gantt-save-tolerant-chunks";
const CHUNK_SIZE = 60000;
const CHUNK_THRESHOLD_BYTES = 240000;
const enc = (value) => new TextEncoder().encode(String(value || "")).byteLength;

function split(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) chunks.push(text.slice(i, i + CHUNK_SIZE));
  return chunks;
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

async function readChunksAsJson(db, version, expectedCount = null) {
  const rows = await readChunkRows(db, version);
  if (!rows.length) throw new Error(`Geen chunks gevonden voor versie ${version}.`);

  const expected = expectedCount == null ? null : Number(expectedCount || 0);
  const selected = expected && rows.length >= expected ? rows.slice(0, expected) : rows;

  if (expected && rows.length < expected) {
    throw new Error(`Chunks incompleet voor versie ${version}: ${rows.length}/${expected}.`);
  }

  for (let i = 0; i < selected.length; i += 1) {
    if (Number(selected[i].chunk_index) !== i) throw new Error(`Chunk-index ontbreekt voor versie ${version}, index ${i}.`);
  }

  let raw = selected.map(row => row.chunk_text || "").join("");
  try {
    JSON.parse(raw);
  } catch (firstError) {
    if (expected && rows.length > expected) {
      raw = rows.map(row => row.chunk_text || "").join("");
      try { JSON.parse(raw); }
      catch (_) { throw firstError; }
    } else {
      throw firstError;
    }
  }
  return raw;
}

async function readCurrentState(db) {
  const row = await db.prepare(
    `SELECT state_json, version, updated_at, updated_by FROM app_state WHERE tenant_id = ? AND state_key = ?`
  ).bind(TENANT_ID, STATE_KEY).first();
  if (!row?.state_json) return { state:null, version:0, row:null };
  const manifest = parseManifest(row.state_json);
  let raw = "";
  if (manifest) raw = await readChunksAsJson(db, Number(manifest.version || row.version || 0), Number(manifest.chunkCount || 0) || null);
  else raw = row.state_json;
  const state = JSON.parse(raw);
  return { state, version:Number(row.version || manifest?.version || 0), row };
}

function cleanRevisionSnapshots(model) {
  const clean = JSON.parse(JSON.stringify(model || {}));
  clean.rows = Array.isArray(clean.rows) ? clean.rows : [];
  clean.sched = clean.sched && typeof clean.sched === "object" && !Array.isArray(clean.sched) ? clean.sched : {};
  clean.revisions = Array.isArray(clean.revisions) ? clean.revisions.map((rev) => {
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
  }) : [];
  return clean;
}

function cleanGanttProjection(gantt) {
  if (!gantt || typeof gantt !== "object" || Array.isArray(gantt)) return null;
  return {
    ...gantt,
    hoursByDay: gantt.hoursByDay && typeof gantt.hoursByDay === "object" && !Array.isArray(gantt.hoursByDay) ? gantt.hoursByDay : {},
    sourcesByDay: gantt.sourcesByDay && typeof gantt.sourcesByDay === "object" && !Array.isArray(gantt.sourcesByDay) ? gantt.sourcesByDay : {},
    directProjectGanttProjectionMarker: MARKER,
    directProjectGanttProjectionAt: new Date().toISOString()
  };
}

function projectCount(state) {
  const order = Array.isArray(state?.projects?.order) ? state.projects.order.length : 0;
  const byId = state?.projects?.byId && typeof state.projects.byId === "object" && !Array.isArray(state.projects.byId) ? Object.keys(state.projects.byId).length : 0;
  const legacy = Array.isArray(state?.projects) ? state.projects.length : 0;
  return Math.max(order, byId, legacy);
}

async function writeState(db, state, version, email) {
  const raw = JSON.stringify(state);
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
    return { chunked:false, chunkCount:0, bytes };
  }

  const chunks = split(raw);
  const manifest = makeManifest(version, bytes, chunks.length, email, { projectGanttSave:true });
  await db.prepare(`DELETE FROM app_state_chunks WHERE tenant_id = ? AND state_key = ? AND version <= ?`).bind(TENANT_ID, STATE_KEY, Math.max(0, version - 10)).run();
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
  return { chunked:true, chunkCount:chunks.length, bytes };
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return new Response(null, { status:204 });
  if (context.request.method !== "POST") return json({ ok:false, error:"Method not allowed", marker:MARKER }, 405);
  const db = context.env?.DB;
  if (!db) return json({ ok:false, error:"DB ontbreekt", marker:MARKER }, 500);
  const email = requireActorEmail(context.request);
  if (!email) return json({ ok:false, error:"Access identiteit ontbreekt", marker:MARKER }, 401);

  try {
    await prepare(db);
    const user = await getOrCreateUser(db, email);
    if (!user.active || user.role === "viewer") return json({ ok:false, error:"Geen schrijfrechten", marker:MARKER }, 403);

    const body = await context.request.json();
    const projectId = String(body?.projectId || "").trim();
    const model = cleanRevisionSnapshots(body?.model || {});
    const ganttProjection = cleanGanttProjection(body?.gantt || null);
    if (!projectId) return json({ ok:false, error:"projectId ontbreekt", marker:MARKER }, 400);
    if (!Array.isArray(model.rows)) return json({ ok:false, error:"model.rows ontbreekt", marker:MARKER }, 400);

    const current = await readCurrentState(db);
    if (!current.state || typeof current.state !== "object") return json({ ok:false, error:"Huidige D1-state ontbreekt of is ongeldig", marker:MARKER }, 409);
    if (projectCount(current.state) <= 5) return json({ ok:false, error:"Directe Gantt-save geblokkeerd: D1-state lijkt leeg/demo", marker:MARKER }, 409);

    current.state.ganttV2 = current.state.ganttV2 && typeof current.state.ganttV2 === "object" ? current.state.ganttV2 : { byProject:{}, ui:{} };
    current.state.ganttV2.byProject = current.state.ganttV2.byProject && typeof current.state.ganttV2.byProject === "object" ? current.state.ganttV2.byProject : {};
    current.state.ganttV2.byProject[projectId] = model;
    if (ganttProjection) current.state.gantt = ganttProjection;
    current.state.meta = current.state.meta && typeof current.state.meta === "object" ? current.state.meta : {};
    current.state.meta.lastDirectProjectGanttSaveAt = new Date().toISOString();
    current.state.meta.lastDirectProjectGanttSaveProjectId = projectId;
    current.state.meta.lastDirectProjectGanttSaveMarker = MARKER;

    const nextVersion = Number(current.version || 0) + 1;
    const write = await writeState(db, current.state, nextVersion, email);
    return json({ ok:true, projectId, version:nextVersion, marker:MARKER, capacityProjectionSaved:Boolean(ganttProjection), ...write }, 200);
  } catch (error) {
    return json({ ok:false, error:String(error.message || error), marker:MARKER }, 500);
  }
}
