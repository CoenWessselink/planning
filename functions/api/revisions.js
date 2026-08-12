import {
  TENANT_ID,
  errorResponse,
  getAuthorizedUser,
  httpError,
  json,
  optionsResponse,
  requireIdentity,
  requireRuntimeSchema
} from "./_shared.js";
import { cleanString } from "./_validation.js";

const MARKER = "cws-revisions-v1";

function cleanSnapshot(snapshot) {
  const clean = snapshot && typeof snapshot === "object" ? JSON.parse(JSON.stringify(snapshot)) : {};
  delete clean.capacity;
  delete clean.gantt;
  delete clean.hoursByDay;
  delete clean.sourcesByDay;
  delete clean.projectDeptHoursValidation;
  clean.meta = { ...(clean.meta || {}), capacityExcludedFromRevision:true, capacityRevisionIsolation:MARKER };
  return clean;
}

export async function onRequestGet(context) {
  try {
    const db = context.env?.DB;
    if (!db) throw httpError("D1-binding DB ontbreekt.", 500, "D1_BINDING_MISSING");
    await requireRuntimeSchema(db);
    const identity = await requireIdentity(context);
    await getAuthorizedUser(db, identity.email, context.env || {});
    const url = new URL(context.request.url);
    const projectId = cleanString(url.searchParams.get("projectId"), { max:120, field:"projectId", allowEmpty:false, pattern:/^[a-zA-Z0-9_.:-]+$/ });
    const result = await db.prepare(
      `SELECT revision_id, rev_no, revision_date, status, description, note, snapshot_json, created_at, created_by
         FROM app_revisions
        WHERE tenant_id = ? AND project_id = ?
        ORDER BY revision_date DESC, created_at DESC
        LIMIT 250`
    ).bind(TENANT_ID, projectId).all();
    const revisions = (result.results || []).map(row => {
      let snapshot = {};
      try { snapshot = cleanSnapshot(JSON.parse(row.snapshot_json || "{}")); } catch (_) { snapshot = cleanSnapshot({}); }
      return {
        id:row.revision_id,
        revNo:row.rev_no || "",
        revisionDate:row.revision_date || "",
        status:row.status || "",
        description:row.description || "",
        note:row.note || "",
        createdAt:row.created_at,
        createdBy:row.created_by,
        snapshot,
        _durableRevision:true
      };
    });
    return json({ ok:true, projectId, revisions, marker:MARKER });
  } catch (error) {
    return errorResponse(error, 500, { marker:MARKER });
  }
}

export function onRequestOptions(context) {
  return optionsResponse("GET,OPTIONS", context.request);
}

export function onRequest() {
  return json({ ok:false, error:"Method not allowed.", marker:MARKER }, 405, { Allow:"GET,OPTIONS" });
}
