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
import { MAX_REVISION_BODY_BYTES, assertJsonComplexity, byteLength, cleanString, readJsonBody } from "./_validation.js";

const MARKER = "cws-revision-save-v1";

function cleanSnapshot(snapshot) {
  const clean = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? JSON.parse(JSON.stringify(snapshot)) : {};
  delete clean.capacity;
  delete clean.gantt;
  delete clean.hoursByDay;
  delete clean.sourcesByDay;
  delete clean.projectDeptHoursValidation;
  clean.meta = { ...(clean.meta || {}), capacityExcludedFromRevision:true, capacityRevisionIsolation:MARKER };
  assertJsonComplexity(clean, { maxDepth:30, maxNodes:100_000, maxStringLength:300_000, maxArrayLength:50_000 });
  const raw = JSON.stringify(clean);
  if (byteLength(raw) > 1_500_000) throw httpError("Revisiesnapshot is te groot.", 413, "REVISION_TOO_LARGE");
  return raw;
}

export async function onRequestPost(context) {
  try {
    assertSameOrigin(context.request, context.env || {});
    const db = context.env?.DB;
    if (!db) throw httpError("D1-binding DB ontbreekt.", 500, "D1_BINDING_MISSING");
    await requireRuntimeSchema(db);
    const identity = await requireIdentity(context);
    const user = await getAuthorizedUser(db, identity.email, context.env || {});
    if (!canWriteState(user)) throw httpError("Geen schrijfrechten.", 403, "WRITE_FORBIDDEN");
    const body = await readJsonBody(context.request, MAX_REVISION_BODY_BYTES);
    const revision = body.revision && typeof body.revision === "object" ? body.revision : {};
    const projectId = cleanString(body.projectId, { max:120, field:"projectId", allowEmpty:false, pattern:/^[a-zA-Z0-9_.:-]+$/ });
    const revisionId = cleanString(revision.id, { max:120, field:"revisionId", allowEmpty:false, pattern:/^[a-zA-Z0-9_.:-]+$/ });
    const revNo = cleanString(revision.revNo, { max:40, field:"Revisienummer" });
    const revisionDate = cleanString(revision.revisionDate, { max:40, field:"Revisiedatum" });
    const status = cleanString(revision.status, { max:60, field:"Status" });
    const description = cleanString(revision.description, { max:2_000, field:"Omschrijving" });
    const note = cleanString(revision.note, { max:8_000, field:"Notitie" });
    const snapshotJson = cleanSnapshot(revision.snapshot || {});

    await db.batch([
      db.prepare(
        `INSERT INTO app_revisions
          (tenant_id, project_id, revision_id, rev_no, revision_date, status, description, note, snapshot_json, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(tenant_id, project_id, revision_id) DO UPDATE SET
           rev_no=excluded.rev_no,
           revision_date=excluded.revision_date,
           status=excluded.status,
           description=excluded.description,
           note=excluded.note,
           snapshot_json=excluded.snapshot_json,
           created_at=CURRENT_TIMESTAMP,
           created_by=excluded.created_by`
      ).bind(TENANT_ID, projectId, revisionId, revNo, revisionDate, status, description, note, snapshotJson, identity.email),
      db.prepare(
        `DELETE FROM app_revisions
          WHERE tenant_id = ? AND project_id = ?
            AND revision_id NOT IN (
              SELECT revision_id FROM app_revisions
               WHERE tenant_id = ? AND project_id = ?
               ORDER BY created_at DESC, revision_date DESC, revision_id DESC
               LIMIT 100
            )`
      ).bind(TENANT_ID, projectId, TENANT_ID, projectId)
    ]);
    await writeAudit(db, identity.email, "revision_saved", { projectId, revisionId, snapshotBytes:byteLength(snapshotJson), retention:100, marker:MARKER }, "app_revision", `${projectId}/${revisionId}`);
    return json({ ok:true, projectId, revisionId, createdAt:new Date().toISOString(), createdBy:identity.email, marker:MARKER });
  } catch (error) {
    return errorResponse(error, 500, { marker:MARKER });
  }
}

export function onRequestOptions(context) {
  return optionsResponse("POST,OPTIONS", context.request);
}

export function onRequest() {
  return json({ ok:false, error:"Method not allowed.", marker:MARKER }, 405, { Allow:"POST,OPTIONS" });
}
