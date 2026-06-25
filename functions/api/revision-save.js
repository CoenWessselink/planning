import { TENANT_ID, getOrCreateUser, json, requireActorEmail, verifyRequiredSchema, ensureSchema } from "./_shared.js";

const MARKER = "v108-direct-revision-save";

async function prepare(db) {
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
    const projectId = String(body?.projectId || "");
    const revision = body?.revision || {};
    const revisionId = String(revision.id || "");
    if (!projectId || !revisionId) return json({ ok:false, error:"projectId/revisionId ontbreekt", marker:MARKER }, 400);
    await db.prepare(`INSERT OR REPLACE INTO app_revisions (tenant_id, project_id, revision_id, rev_no, revision_date, status, description, note, snapshot_json, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      TENANT_ID, projectId, revisionId, String(revision.revNo || ""), String(revision.revisionDate || ""), String(revision.status || ""), String(revision.description || ""), String(revision.note || ""), JSON.stringify(cleanSnapshot(revision.snapshot || {})), String(revision.createdAt || new Date().toISOString()), String(revision.createdBy || email)
    ).run();
    return json({ ok:true, projectId, revisionId, marker:MARKER }, 200);
  } catch (error) {
    return json({ ok:false, error:String(error.message || error), marker:MARKER }, 500);
  }
}
