import {
  DEFAULT_STATE_JSON,
  STATE_KEY,
  assertSameOrigin,
  canManageUsers,
  errorResponse,
  getAuthorizedUser,
  httpError,
  json,
  optionsResponse,
  requireIdentity,
  requireRuntimeSchema,
  writeAudit
} from "./_shared.js";
import { readJsonBody } from "./_validation.js";
import { writeStateCAS } from "./_state_storage.js";

const MARKER = "cws-state-reset-v1";

export async function onRequestPost(context) {
  try {
    assertSameOrigin(context.request, context.env || {});
    const db = context.env?.DB;
    if (!db) throw httpError("D1-binding DB ontbreekt.", 500, "D1_BINDING_MISSING");
    const identity = await requireIdentity(context);
    await requireRuntimeSchema(db);
    const user = await getAuthorizedUser(db, identity.email, context.env || {});
    if (!canManageUsers(user)) throw httpError("Alleen een actieve admin mag de planning leegmaken.", 403, "ADMIN_REQUIRED");

    const body = await readJsonBody(context.request, 8_000);
    if (String(body.confirm || "") !== "RESET_PLANNING") throw httpError("Bevestiging ontbreekt. Gebruik confirm: RESET_PLANNING.", 400, "RESET_CONFIRM_REQUIRED");
    const baseVersion = Number(body.baseVersion ?? context.request.headers.get("X-CWS-Base-Version"));
    if (!Number.isInteger(baseVersion) || baseVersion < 0) throw httpError("baseVersion ontbreekt of is ongeldig.", 428, "BASE_VERSION_REQUIRED");

    const state = JSON.parse(DEFAULT_STATE_JSON);
    state.meta = { ...(state.meta || {}), resetAt: new Date().toISOString(), resetBy: identity.email, resetMarker: MARKER };
    const result = await writeStateCAS(db, { state, baseVersion, email: identity.email });
    if (result.conflict) {
      return json({
        ok: false,
        error: "De planning is intussen gewijzigd. Herlaad de nieuwste versie voordat u wist.",
        code: "STATE_VERSION_CONFLICT",
        currentVersion: result.currentVersion,
        baseVersion,
        marker: MARKER
      }, 409);
    }
    await writeAudit(db, identity.email, "state_reset", { version: result.version, baseVersion, marker: MARKER }, "app_state", STATE_KEY);
    return json({ ok: true, version: result.version, marker: MARKER }, 200, { "X-CWS-Version": String(result.version) });
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
