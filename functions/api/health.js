import { json, optionsResponse, verifyRequiredSchema } from "./_shared.js";

export async function onRequestGet(context) {
  const db = context.env?.DB;
  if (!db) return json({ ok:false, service:"cws-planning", storage:"missing", error:"D1-binding DB ontbreekt." }, 500);
  try {
    await db.prepare("SELECT 1 AS ok").first();
    const schema = await verifyRequiredSchema(db);
    return json({
      ok:schema.ok,
      service:"cws-planning",
      storage:"d1",
      version:"cws-atomic-security-v1",
      healthMode:"lightweight-schema-verification",
      schemaOk:schema.ok,
      migrationRequired:!schema.ok
    }, schema.ok ? 200 : 503);
  } catch (error) {
    return json({ ok:false, service:"cws-planning", storage:"d1", error:"D1-healthcheck mislukt." }, 500);
  }
}

export function onRequestOptions(context) {
  return optionsResponse("GET,OPTIONS", context.request);
}

export function onRequest() {
  return json({ ok:false, error:"Method not allowed." }, 405, { Allow:"GET,OPTIONS" });
}
