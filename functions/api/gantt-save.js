import {
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
import { assertJsonComplexity, cleanString, readJsonBody } from "./_validation.js";
import { readActiveState, writeStateCAS } from "./_state_storage.js";

const MARKER = "cws-gantt-save-v2-atomic-cas";

function cleanRevisionSnapshots(model) {
  const clean = model && typeof model === "object" && !Array.isArray(model) ? JSON.parse(JSON.stringify(model)) : {};
  clean.rows = Array.isArray(clean.rows) ? clean.rows : [];
  clean.sched = clean.sched && typeof clean.sched === "object" && !Array.isArray(clean.sched) ? clean.sched : {};
  clean.revisions = Array.isArray(clean.revisions) ? clean.revisions.map(revision => {
    if (!revision || typeof revision !== "object") return revision;
    const next = { ...revision };
    const snapshot = next.snapshot && typeof next.snapshot === "object" && !Array.isArray(next.snapshot) ? { ...next.snapshot } : {};
    delete snapshot.capacity;
    delete snapshot.gantt;
    delete snapshot.hoursByDay;
    delete snapshot.sourcesByDay;
    delete snapshot.projectDeptHoursValidation;
    snapshot.meta = { ...(snapshot.meta || {}), capacityExcludedFromRevision: true, capacityRevisionIsolation: MARKER };
    next.snapshot = snapshot;
    return next;
  }) : [];
  assertJsonComplexity(clean, { maxDepth: 35, maxNodes: 150_000, maxStringLength: 500_000, maxArrayLength: 75_000 });
  return clean;
}

function cleanGanttProjection(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const clean = JSON.parse(JSON.stringify(value));
  assertJsonComplexity(clean, { maxDepth: 30, maxNodes: 125_000, maxStringLength: 250_000, maxArrayLength: 75_000 });
  clean.hoursByDay = clean.hoursByDay && typeof clean.hoursByDay === "object" && !Array.isArray(clean.hoursByDay) ? clean.hoursByDay : {};
  clean.sourcesByDay = clean.sourcesByDay && typeof clean.sourcesByDay === "object" && !Array.isArray(clean.sourcesByDay) ? clean.sourcesByDay : {};
  return clean;
}

export async function onRequestPost(context) {
  try {
    assertSameOrigin(context.request, context.env || {});
    const db = context.env?.DB;
    if (!db) throw httpError("D1-binding DB ontbreekt.", 500, "D1_BINDING_MISSING");
    const identity = await requireIdentity(context);
    await requireRuntimeSchema(db);
    const user = await getAuthorizedUser(db, identity.email, context.env || {});
    if (!canWriteState(user)) throw httpError("Geen schrijfrechten.", 403, "WRITE_FORBIDDEN");

    const body = await readJsonBody(context.request, 2_500_000);
    const projectId = cleanString(body.projectId, { max: 120, field: "projectId", allowEmpty: false, pattern: /^[a-zA-Z0-9_.:-]+$/ });
    const baseVersion = Number(body.baseVersion ?? context.request.headers.get("X-CWS-Base-Version"));
    if (!Number.isInteger(baseVersion) || baseVersion < 0) throw httpError("baseVersion ontbreekt of is ongeldig.", 428, "BASE_VERSION_REQUIRED");
    const model = cleanRevisionSnapshots(body.model || {});
    const ganttProjection = cleanGanttProjection(body.gantt);

    const current = await readActiveState(db, { recover: true });
    if (!current.state || typeof current.state !== "object") throw httpError("Actuele D1-state ontbreekt of is ongeldig.", 503, "STATE_UNAVAILABLE");
    if (Number(current.activeVersion) !== baseVersion) {
      return json({
        ok: false,
        error: "De planning is intussen gewijzigd. Herlaad de nieuwste versie.",
        code: "STATE_VERSION_CONFLICT",
        currentVersion: Number(current.activeVersion || 0),
        baseVersion,
        marker: MARKER
      }, 409);
    }

    const state = JSON.parse(JSON.stringify(current.state));
    state.ganttV2 = state.ganttV2 && typeof state.ganttV2 === "object" && !Array.isArray(state.ganttV2) ? state.ganttV2 : { byProject: {}, ui: {} };
    state.ganttV2.byProject = state.ganttV2.byProject && typeof state.ganttV2.byProject === "object" && !Array.isArray(state.ganttV2.byProject) ? state.ganttV2.byProject : {};
    state.ganttV2.byProject[projectId] = model;
    if (ganttProjection) state.gantt = ganttProjection;
    state.meta = state.meta && typeof state.meta === "object" && !Array.isArray(state.meta) ? state.meta : {};
    state.meta.lastDirectProjectGanttSaveAt = new Date().toISOString();
    state.meta.lastDirectProjectGanttSaveProjectId = projectId;
    state.meta.lastDirectProjectGanttSaveMarker = MARKER;

    const result = await writeStateCAS(db, { state, baseVersion, email: identity.email });
    if (result.conflict) {
      return json({
        ok: false,
        error: "De planning is intussen gewijzigd. Herlaad de nieuwste versie.",
        code: "STATE_VERSION_CONFLICT",
        currentVersion: result.currentVersion,
        baseVersion,
        marker: MARKER
      }, 409);
    }

    try {
      await writeAudit(db, identity.email, "gantt_project_saved", {
        projectId,
        version: result.version,
        baseVersion,
        bytes: result.bytes,
        chunked: result.chunked,
        chunkCount: result.chunkCount,
        marker: MARKER
      }, "gantt_project", projectId);
    } catch (_) {}

    return json({
      ok: true,
      projectId,
      version: result.version,
      bytes: result.bytes,
      checksum: result.checksum,
      chunked: result.chunked,
      chunkCount: result.chunkCount,
      marker: MARKER
    }, 200, { "X-CWS-Version": String(result.version) });
  } catch (error) {
    return errorResponse(error, 500, { marker: MARKER });
  }
}

export function onRequestOptions(context) {
  return optionsResponse("POST,OPTIONS", context.request);
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed.", marker: MARKER }, 405, { Allow: "POST,OPTIONS" });
}
