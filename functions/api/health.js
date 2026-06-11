import { ensureSchema, json, verifyRequiredSchema } from "./_shared.js";

export async function onRequestGet(context) {
  if (!context.env?.DB) {
    return json({ ok: false, service: "cws-planning", storage: "missing", error: "D1-binding DB ontbreekt." }, 500);
  }
  try {
    await context.env.DB.prepare("SELECT 1 AS ok").first();
    await ensureSchema(context.env.DB);
    const schema = await verifyRequiredSchema(context.env.DB);
    return json({
      ok: schema.ok,
      service: "cws-planning",
      storage: "d1",
      version: "internal-test-v10",
      schemaOk: schema.ok,
      schemaErrors: schema.errors
    }, schema.ok ? 200 : 500);
  } catch (error) {
    return json({ ok: false, service: "cws-planning", storage: "d1", error: error.message, stack: error.stack || null }, 500);
  }
}

export function onRequestOptions() {
  return json({ ok: true });
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed." }, 405);
}
