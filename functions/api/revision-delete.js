import { TENANT_ID, getOrCreateUser, json, requireActorEmail, verifyRequiredSchema, ensureSchema, writeAudit } from "./_shared.js";

const MARKER = "v105-direct-revision-delete";

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
  return schema;
}

function cors() {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Accept",
      "Access-Control-Expose-Headers": "X-CWS-OK,X-CWS-V105"
    }
  });
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return cors();
  if (context.request.method !== "DELETE") {
    return json({ ok:false, error:"Method not allowed.", v105:{ marker:MARKER } }, 405);
  }

  const db = context.env?.DB;
  if (!db) return json({ ok:false, error:"D1-binding DB ontbreekt.", v105:{ marker:MARKER } }, 500);

  const email = requireActorEmail(context.request);
  if (!email) return json({ ok:false, error:"Cloudflare Access-identiteit ontbreekt.", v105:{ marker:MARKER } }, 401);

  try {
    await prepare(db);
    const user = await getOrCreateUser(db, email);
    if (!user.active) return json({ ok:false, error:"Gebruiker is inactief.", v105:{ marker:MARKER } }, 403);
    if (user.role === "viewer") return json({ ok:false, error:"Viewer heeft alleen leesrechten.", v105:{ marker:MARKER } }, 403);

    const url = new URL(context.request.url);
    const projectId = String(url.searchParams.get("projectId") || "").trim();
    const revisionId = String(url.searchParams.get("revisionId") || "").trim();
    if (!projectId || !revisionId) {
      return json({ ok:false, error:"projectId en revisionId zijn verplicht.", v105:{ marker:MARKER } }, 400);
    }

    const before = await db.prepare(
      `SELECT revision_id FROM app_revisions WHERE tenant_id = ? AND project_id = ? AND revision_id = ?`
    ).bind(TENANT_ID, projectId, revisionId).first();

    await db.prepare(
      `DELETE FROM app_revisions WHERE tenant_id = ? AND project_id = ? AND revision_id = ?`
    ).bind(TENANT_ID, projectId, revisionId).run();

    try {
      await writeAudit(db, email, "revision_deleted_direct", { projectId, revisionId, existed:Boolean(before), marker:MARKER }, "app_revision", `${projectId}/${revisionId}`);
    } catch (_) {}

    return json({ ok:true, deleted:Boolean(before), projectId, revisionId, v105:{ marker:MARKER, directRevisionDelete:true } }, 200);
  } catch (error) {
    return json({ ok:false, error:error.message, v105:{ marker:MARKER } }, error.status || 500);
  }
}
