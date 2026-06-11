import {
  MAX_STATE_BYTES,
  STATE_KEY,
  TENANT_ID,
  canWriteState,
  ensureSeedState,
  getOrCreateUser,
  json,
  requireActorEmail,
  verifyRequiredSchema,
  writeAudit
} from "./_shared.js";

async function prepareDb(db) {
  const schema = await verifyRequiredSchema(db);
  if (!schema.ok) return schema;
  await ensureSeedState(db);
  return schema;
}

export async function onRequestGet(context) {
  const db = context.env?.DB;
  if (!db) return json({ ok: false, error: "D1-binding DB ontbreekt." }, 500);

  const email = requireActorEmail(context.request);
  if (!email) return json({ ok: false, error: "Cloudflare Access-identiteit ontbreekt." }, 401);

  try {
    const schema = await prepareDb(db);
    if (!schema.ok) return json({ ok: false, error: "D1-schema onjuist. Voer migrations/0002_reconcile_schema.sql uit.", schemaErrors: schema.errors }, 500);

    const user = await getOrCreateUser(db, email);
    if (!user.active) return json({ ok: false, error: "Gebruiker is inactief." }, 403);

    const row = await db.prepare(
      `SELECT state_json, version, updated_at, updated_by
       FROM app_state WHERE tenant_id = ? AND state_key = ?`
    ).bind(TENANT_ID, STATE_KEY).first();

    return json({
      ok: true,
      exists: Boolean(row),
      tenantId: TENANT_ID,
      stateKey: STATE_KEY,
      version: Number(row?.version || 0),
      state: row ? JSON.parse(row.state_json) : {},
      updatedAt: row?.updated_at || null,
      updatedBy: row?.updated_by || null,
      user: { email: user.email, displayName: user.display_name, role: user.role, active: Boolean(user.active) }
    });
  } catch (error) {
    return json({ ok: false, error: error.message }, 500);
  }
}

export async function onRequestPut(context) {
  const db = context.env?.DB;
  if (!db) return json({ ok: false, error: "D1-binding DB ontbreekt." }, 500);

  const email = requireActorEmail(context.request);
  if (!email) return json({ ok: false, error: "Cloudflare Access-identiteit ontbreekt." }, 401);

  try {
    const schema = await prepareDb(db);
    if (!schema.ok) return json({ ok: false, error: "D1-schema onjuist. Voer migrations/0002_reconcile_schema.sql uit.", schemaErrors: schema.errors }, 500);

    const user = await getOrCreateUser(db, email);
    if (!user.active) return json({ ok: false, error: "Gebruiker is inactief." }, 403);
    if (!canWriteState(user)) return json({ ok: false, error: "Viewer heeft alleen leesrechten." }, 403);

    const raw = await context.request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_STATE_BYTES) {
      return json({ ok: false, error: "State payload is te groot." }, 413);
    }
    const body = JSON.parse(raw);
    if (!body?.state || typeof body.state !== "object" || Array.isArray(body.state)) {
      return json({ ok: false, error: "Body moet een state-object bevatten." }, 400);
    }
    if (!Number(body.state.schemaVersion)) {
      return json({ ok: false, error: "schemaVersion ontbreekt." }, 400);
    }

    const current = await db.prepare(
      "SELECT version FROM app_state WHERE tenant_id = ? AND state_key = ?"
    ).bind(TENANT_ID, STATE_KEY).first();
    const currentVersion = Number(current?.version || 0);
    const baseVersion = Number(body.baseVersion ?? 0);
    if (currentVersion > 0 && baseVersion !== currentVersion) {
      return json({
        ok: false,
        error: "State is gewijzigd door een andere gebruiker.",
        currentVersion
      }, 409);
    }

    const nextVersion = currentVersion + 1;
    const stateJson = JSON.stringify(body.state);

    await db.prepare(
      `INSERT INTO app_state
        (tenant_id, state_key, state_json, version, updated_at, updated_by)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
       ON CONFLICT(tenant_id, state_key) DO UPDATE SET
         state_json = excluded.state_json,
         version = excluded.version,
         updated_at = CURRENT_TIMESTAMP,
         updated_by = excluded.updated_by`
    ).bind(TENANT_ID, STATE_KEY, stateJson, nextVersion, email).run();
    await writeAudit(db, email, "state_saved", { version: nextVersion, baseVersion, bytes: stateJson.length }, "app_state", STATE_KEY);

    return json({ ok: true, version: nextVersion, updatedBy: email });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ ok: false, error: "Ongeldige JSON-body." }, 400);
    return json({ ok: false, error: error.message }, 500);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed." }, 405);
}
