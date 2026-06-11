import { ensureSeedState, json, verifyRequiredSchema } from "./_shared.js";

export async function onRequestGet(context) {
  if (!context.env?.DB) {
    return json({ ok: false, service: "cws-planning", storage: "missing", error: "D1-binding DB ontbreekt." }, 500);
  }
  try {
    await context.env.DB.prepare("SELECT 1 AS ok").first();
    const schema = await verifyRequiredSchema(context.env.DB);
    if (schema.ok) await ensureSeedState(context.env.DB);
    return json({
      ok: schema.ok,
      service: "cws-planning",
      storage: "d1",
      version: "internal-test-v9",
      schemaOk: schema.ok,
      schemaErrors: schema.errors
    }, schema.ok ? 200 : 500);
  } catch (error) {
    return json({ ok: false, service: "cws-planning", storage: "d1", error: error.message }, 500);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed." }, 405);
}
