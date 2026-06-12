import { json, verifyRequiredSchema } from "./_shared.js";

export async function onRequestGet(context) {
  const db = context.env?.DB;
  if (!db) {
    return json({ ok: false, service: "cws-planning", storage: "missing", error: "D1-binding DB ontbreekt." }, 500);
  }

  try {
    // V57: health must stay ultra-light. Do not run schema repair, seed, state load,
    // JSON parsing, or audit work here. A heavy health endpoint caused Cloudflare
    // Worker 1102 / 503 failures and forced the app into local fallback.
    await db.prepare("SELECT 1 AS ok").first();
    const schema = await verifyRequiredSchema(db);
    return json({
      ok: true,
      service: "cws-planning",
      storage: "d1",
      version: "internal-test-v57",
      healthMode: "v57-lightweight-no-state-load",
      schemaOk: schema.ok,
      schemaErrors: schema.errors,
      schemaRepairRequired: !schema.ok
    });
  } catch (error) {
    return json({
      ok: false,
      service: "cws-planning",
      storage: "d1",
      healthMode: "v57-lightweight-no-state-load",
      error: error.message
    }, 500);
  }
}

export function onRequestOptions() {
  return json({ ok: true });
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed." }, 405);
}
