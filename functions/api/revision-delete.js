import {
  TENANT_ID,
  assertSameOrigin,
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
import { cleanString } from "./_validation.js";

const MARKER = "cws-revision-delete-v1";

export async function onRequestDelete(context) {
  try {
    assertSameOrigin(context.request, context.env || {});
    const db = context.env?.DB;
    if (!db) throw httpError("D1-binding DB ontbreekt.", 500, "D1_BINDING_MISSING");
    await requireRuntimeSchema(db);
    const identity = await requireIdentity(context);
    const user = await getAuthorizedUser(db, identity.email, context.env || {});
    if (!canWriteState(user)) throw httpError("Geen schrijfrechten.", 403, "WRITE_FORBIDDEN");
    const url = new URL(context.request.url);
    const projectId = cleanString(url.searchParams.get("projectId"), { max:120, field:"projectId", allowEmpty:false, pattern:/^[a-zA-Z0-9_.:-]+$/ });
    const revisionId = cleanString(url.searchParams.get("revisionId"), { max:120, field:"revisionId", allowEmpty:false, pattern:/^[a-zA-Z0-9_.:-]+$/ });
    const result = await db.prepare(
      `DELETE FROM app_revisions
        WHERE tenant_id = ? AND project_id = ? AND revision_id = ?`
    ).bind(TENANT_ID, projectId, revisionId).run();
    const deleted = Number(result?.meta?.changes ?? result?.changes ?? 0) > 0;
    await writeAudit(db, identity.email, "revision_deleted", { projectId, revisionId, deleted, marker:MARKER }, "app_revision", `${projectId}/${revisionId}`);
    return json({ ok:true, deleted, projectId, revisionId, marker:MARKER });
  } catch (error) {
    return errorResponse(error, 500, { marker:MARKER });
  }
}

export function onRequestOptions(context) {
  return optionsResponse("DELETE,OPTIONS", context.request);
}

export function onRequest() {
  return json({ ok:false, error:"Method not allowed.", marker:MARKER }, 405, { Allow:"DELETE,OPTIONS" });
}
