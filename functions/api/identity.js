import { errorResponse, getAuthorizedUser, json, optionsResponse, requireIdentity, requireRuntimeSchema, httpError } from "./_shared.js";

export async function onRequestGet(context) {
  try {
    const db = context.env?.DB;
    if (!db) throw httpError("D1-binding DB ontbreekt.", 500, "D1_BINDING_MISSING");
    await requireRuntimeSchema(db);
    const identity = await requireIdentity(context);
    const user = await getAuthorizedUser(db, identity.email, context.env || {});
    return json({
      ok:true,
      present:true,
      email:user.email,
      displayName:user.display_name || user.email,
      role:user.role,
      active:Boolean(Number(user.active)),
      source:identity.source,
      version:"cws-secure-identity-v1"
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export function onRequestOptions(context) {
  return optionsResponse("GET,OPTIONS", context.request);
}

export function onRequest() {
  return json({ ok:false, error:"Method not allowed." }, 405, { Allow:"GET,OPTIONS" });
}
