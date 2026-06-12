import {
  canViewAudit,
  canWriteState,
  ensureSchema,
  getOrCreateUser,
  json,
  requireActorEmail,
  verifyRequiredSchema,
  writeAudit
} from "./_shared.js";

async function prepareDb(db) {
  // V57: verify first and only repair schema when necessary.
  let schema = await verifyRequiredSchema(db);
  if (!schema.ok) schema = await ensureSchema(db);
  return schema;
}

export async function onRequestGet(context) {
  const db = context.env?.DB;
  if (!db) return json({ ok: false, error: "D1-binding DB ontbreekt." }, 500);

  const email = requireActorEmail(context.request);
  if (!email) return json({ ok: false, error: "Cloudflare Access-identiteit ontbreekt." }, 401);

  try {
    const schema = await prepareDb(db);
    if (!schema.ok) return json({ ok: false, error: "D1-schema kon niet automatisch worden hersteld.", schemaErrors: schema.errors }, 500);

    const user = await getOrCreateUser(db, email);
    if (!canViewAudit(user)) return json({ ok: false, error: "Geen rechten voor audit." }, 403);

    const result = await db.prepare(
      `SELECT id, actor_email, action, entity_type, entity_id, metadata_json, created_at
       FROM audit_log WHERE tenant_id = 'internal'
       ORDER BY id DESC LIMIT 200`
    ).all();
    return json({
      ok: true,
      items: (result.results || []).map(row => ({
        ...row,
        metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {}
      }))
    });
  } catch (error) {
    return json({ ok: false, error: error.message }, 500);
  }
}

export async function onRequestPost(context) {
  const db = context.env?.DB;
  if (!db) return json({ ok: false, error: "D1-binding DB ontbreekt." }, 500);

  const email = requireActorEmail(context.request);
  if (!email) return json({ ok: false, error: "Cloudflare Access-identiteit ontbreekt." }, 401);

  try {
    const schema = await prepareDb(db);
    if (!schema.ok) return json({ ok: false, error: "D1-schema kon niet automatisch worden hersteld.", schemaErrors: schema.errors }, 500);

    const user = await getOrCreateUser(db, email);
    if (!canWriteState(user)) return json({ ok: false, error: "Geen schrijfrechten." }, 403);
    const body = await context.request.json();
    if (!body?.action) return json({ ok: false, error: "action ontbreekt." }, 400);
    await writeAudit(db, email, String(body.action), body.metadata || {}, body.entityType || null, body.entityId || null);
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: error.message }, 500);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed." }, 405);
}
