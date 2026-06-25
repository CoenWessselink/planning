import { TENANT_ID, ensureSchema, getOrCreateUser, json, requireActorEmail, verifyRequiredSchema } from "./_shared.js";

const MARKER = "v114-api-middleware-state-pass-through";

async function prepareRevisions(db) {
  let schema = await verifyRequiredSchema(db);
  if (!schema.ok) schema = await ensureSchema(db);
  await db.prepare(`CREATE TABLE IF NOT EXISTS app_revisions (
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    revision_id TEXT NOT NULL,
    rev_no TEXT,
    revision_date TEXT,
    status TEXT,
    description TEXT,
    note TEXT,
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    PRIMARY KEY (tenant_id, project_id, revision_id)
  )`).run();
}

function cleanSnapshot(snapshot) {
  const clean = JSON.parse(JSON.stringify(snapshot || {}));
  delete clean.capacity;
  delete clean.gantt;
  delete clean.hoursByDay;
  delete clean.sourcesByDay;
  delete clean.projectDeptHoursValidation;
  clean.meta = clean.meta && typeof clean.meta === "object" ? clean.meta : {};
  clean.meta.capacityExcludedFromRevision = true;
  clean.meta.capacityRevisionIsolation = MARKER;
  return clean;
}

async function handleRevisions(context) {
  const db = context.env?.DB;
  if (!db) return json({ ok:false, error:"D1-binding DB ontbreekt.", v114:{ marker:MARKER } }, 500);
  const email = requireActorEmail(context.request);
  if (!email) return json({ ok:false, error:"Cloudflare Access-identiteit ontbreekt.", v114:{ marker:MARKER } }, 401);
  try {
    await prepareRevisions(db);
    const user = await getOrCreateUser(db, email);
    if (!user.active) return json({ ok:false, error:"Gebruiker is inactief.", v114:{ marker:MARKER } }, 403);
    const url = new URL(context.request.url);
    const projectId = String(url.searchParams.get("projectId") || "").trim();
    if (!projectId) return json({ ok:false, error:"projectId ontbreekt.", v114:{ marker:MARKER } }, 400);
    const result = await db.prepare(`SELECT revision_id, rev_no, revision_date, status, description, note, snapshot_json, created_at, created_by
      FROM app_revisions WHERE tenant_id = ? AND project_id = ? ORDER BY revision_date DESC, created_at DESC`)
      .bind(TENANT_ID, projectId).all();
    const revisions = (result.results || []).map(row => {
      let snapshot = {};
      try { snapshot = cleanSnapshot(JSON.parse(row.snapshot_json || "{}") || {}); } catch (_) { snapshot = cleanSnapshot({}); }
      return {
        id: row.revision_id,
        revNo: row.rev_no,
        revisionDate: row.revision_date,
        status: row.status,
        description: row.description,
        note: row.note,
        createdAt: row.created_at,
        createdBy: row.created_by,
        snapshot,
        _durableRevision: true
      };
    });
    return json({ ok:true, projectId, revisions, v114:{ marker:MARKER, statePassThrough:true } }, 200);
  } catch (error) {
    return json({ ok:false, error:error.message || String(error), v114:{ marker:MARKER } }, error.status || 500);
  }
}

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Critical: never intercept /api/state here. The canonical checkpoint-first save route
  // lives in functions/api/state.js. Older middleware interception caused recurring 500s.
  if (url.pathname === "/api/state") return context.next();

  if (url.pathname === "/api/revisions") {
    if (context.request.method === "GET") return handleRevisions(context);
    if (context.request.method === "OPTIONS") return new Response(null, { status:204 });
    return json({ ok:false, error:"Method not allowed.", v114:{ marker:MARKER } }, 405);
  }

  return context.next();
}
