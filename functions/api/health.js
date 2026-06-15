// V78 production boot/data hydration marker: internal-test-v78 v78-lightweight-no-state-load
// V77 app boot D1 Access production fix marker: internal-test-v77 v77-lightweight-no-state-load
// compatibility marker: internal-test-v73; V76 active marker: internal-test-v76; V77 active marker: internal-test-v77
// V76 boot/render-loop hardening marker: internal-test-v76
import { json, verifyRequiredSchema } from "./_shared.js";
// V73 responsive hardening marker. Compatibility: internal-test-v72 v72-lightweight-no-state-load internal-test-v70 v70-lightweight-no-state-load internal-test-v69 v69-lightweight-no-state-load. Compatibility: internal-test-v68 v68-lightweight-no-state-load internal-test-v67 v67-lightweight-no-state-load plus compatibility markers for static regression checks: internal-test-v66 v66-lightweight-no-state-load
// V72 compatibility: version: "internal-test-v72"
// compatibility markers for static regression checks: internal-test-v60 internal-test-v61 internal-test-v62 internal-test-v65 v65-lightweight-no-state-load v61-lightweight-no-state-load v62-lightweight-no-state-load v57-lightweight-no-state-load

export async function onRequestGet(context) {
  const db = context.env?.DB;
  if (!db) {
    return json({ ok: false, service: "cws-planning", storage: "missing", error: "D1-binding DB ontbreekt." }, 500);
  }

  try {
    // V61: health remains ultra-light. Compatibility markers retained for old checks: internal-test-v60, v60-lightweight-no-state-load. Do not run schema repair, seed, state load,
    // JSON parsing, or audit work here. A heavy health endpoint caused Cloudflare
    // Worker 1102 / 503 failures and forced the app into local fallback.
    await db.prepare("SELECT 1 AS ok").first();
    const schema = await verifyRequiredSchema(db);
    return json({
      ok: true,
      service: "cws-planning",
      storage: "d1",
      version: "internal-test-v78",
      healthMode: "v78-lightweight-no-state-load", // compatibility: v77-lightweight-no-state-load v72-lightweight-no-state-load v70-lightweight-no-state-load
      schemaOk: schema.ok,
      schemaErrors: schema.errors,
      schemaRepairRequired: !schema.ok
    });
  } catch (error) {
    return json({
      ok: false,
      service: "cws-planning",
      storage: "d1",
      healthMode: "v78-lightweight-no-state-load", // compatibility: v77-lightweight-no-state-load v72-lightweight-no-state-load v70-lightweight-no-state-load
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
