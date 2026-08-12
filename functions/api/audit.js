import {
  assertSameOrigin,
  canViewAudit,
  canWriteState,
  errorResponse,
  getAuthorizedUser,
  httpError,
  json,
  optionsResponse,
  requireIdentity,
  requireRuntimeSchema,
  writeAudit
} from "./_shared.js";
import { cleanString, readJsonBody, safeMetadata } from "./_validation.js";

async function guard(context, mode) {
  const db = context.env?.DB;
  if (!db) throw httpError("D1-binding DB ontbreekt.", 500, "D1_BINDING_MISSING");
  await requireRuntimeSchema(db);
  const identity = await requireIdentity(context);
  const user = await getAuthorizedUser(db, identity.email, context.env || {});
  if (mode === "view" && !canViewAudit(user)) throw httpError("Geen rechten voor audit.", 403, "AUDIT_FORBIDDEN");
  if (mode === "write" && !canWriteState(user)) throw httpError("Geen schrijfrechten.", 403, "WRITE_FORBIDDEN");
  return { db, identity, user };
}

export async function onRequestGet(context) {
  try {
    const { db } = await guard(context, "view");
    const result = await db.prepare(
      `SELECT id, actor_email, action, entity_type, entity_id, metadata_json, created_at
         FROM audit_log
        WHERE tenant_id = ?
        ORDER BY id DESC
        LIMIT 200`
    ).bind("internal").all();
    const items = (result.results || []).map(row => {
      let metadata = {};
      try { metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {}; } catch (_) { metadata = { parseError:true }; }
      const { metadata_json, ...rest } = row;
      return { ...rest, metadata };
    });
    return json({ ok:true, items });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost(context) {
  try {
    assertSameOrigin(context.request, context.env || {});
    const { db, identity } = await guard(context, "write");
    const body = await readJsonBody(context.request, 32_000);
    const event = cleanString(body.action || body.event, {
      max:80,
      field:"Audit-event",
      allowEmpty:false,
      pattern:/^[a-zA-Z0-9_.:-]+$/
    });
    const metadata = safeMetadata(body.metadata || {});
    await writeAudit(db, identity.email, "client_event", { event, metadata }, "client", null);
    return json({ ok:true });
  } catch (error) {
    return errorResponse(error);
  }
}

export function onRequestOptions(context) {
  return optionsResponse("GET,POST,OPTIONS", context.request);
}

export function onRequest() {
  return json({ ok:false, error:"Method not allowed." }, 405, { Allow:"GET,POST,OPTIONS" });
}
