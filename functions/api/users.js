import { ensureSchema, getOrCreateUser, json, requireActorEmail, verifyRequiredSchema } from "./_shared.js";

async function requireAdmin(context) {
  const db = context.env?.DB;
  if (!db) return { error: json({ ok:false, error:"D1-binding DB ontbreekt." }, 500) };
  await ensureSchema(db);
  const schema = await verifyRequiredSchema(db);
  if (!schema.ok) return { error: json({ ok:false, error:"D1-schema onjuist.", schemaErrors:schema.errors }, 500) };
  const email = requireActorEmail(context.request);
  if (!email) return { error: json({ ok:false, error:"Cloudflare Access-identiteit ontbreekt." }, 401) };
  const user = await getOrCreateUser(db, email);
  if (!user.active || user.role !== "admin") return { error: json({ ok:false, error:"Alleen admin mag gebruikers beheren." }, 403) };
  return { db, email, user };
}

export async function onRequestGet(context) {
  const guard = await requireAdmin(context);
  if (guard.error) return guard.error;
  const result = await guard.db.prepare(
    "SELECT email, display_name, role, active, created_at FROM app_users ORDER BY created_at ASC, email ASC"
  ).all();
  return json({ ok:true, users:result.results || [] });
}

export async function onRequestPut(context) {
  const guard = await requireAdmin(context);
  if (guard.error) return guard.error;
  try {
    const body = await context.request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "viewer").trim().toLowerCase();
    const active = body.active === false ? 0 : 1;
    if (!email || !email.includes("@")) return json({ ok:false, error:"Geldig e-mailadres verplicht." }, 400);
    if (!["admin", "planner", "viewer"].includes(role)) return json({ ok:false, error:"Ongeldige rol." }, 400);
    await guard.db.prepare(
      `INSERT INTO app_users (email, display_name, role, active)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET role=excluded.role, active=excluded.active, display_name=excluded.display_name`
    ).bind(email, body.displayName || email.split("@")[0], role, active).run();
    return json({ ok:true });
  } catch (error) {
    return json({ ok:false, error:error.message }, 500);
  }
}

export function onRequest() {
  return json({ ok:false, error:"Method not allowed." }, 405);
}
