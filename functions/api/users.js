import {
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
import { cleanString, normalizeEmail, readJsonBody } from "./_validation.js";

async function requireAdmin(context) {
  const db = context.env?.DB;
  if (!db) throw httpError("D1-binding DB ontbreekt.", 500, "D1_BINDING_MISSING");
  await requireRuntimeSchema(db);
  const identity = await requireIdentity(context);
  const user = await getAuthorizedUser(db, identity.email, context.env || {});
  if (!canManageUsers(user)) throw httpError("Alleen een actieve admin mag gebruikers beheren.", 403, "ADMIN_REQUIRED");
  return { db, identity, user };
}

export async function onRequestGet(context) {
  try {
    const { db } = await requireAdmin(context);
    const result = await db.prepare(
      "SELECT email, display_name, role, active, created_at FROM app_users ORDER BY created_at ASC, email ASC"
    ).all();
    return json({ ok:true, users:result.results || [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPut(context) {
  try {
    assertSameOrigin(context.request, context.env || {});
    const { db, identity } = await requireAdmin(context);
    const body = await readJsonBody(context.request, 16_000);
    const email = normalizeEmail(body.email);
    const role = cleanString(body.role || "viewer", { max:20, field:"Rol", allowEmpty:false }).toLowerCase();
    if (!["admin", "planner", "viewer"].includes(role)) throw httpError("Ongeldige rol.", 400, "ROLE_INVALID");
    const active = body.active === false ? 0 : 1;
    const displayName = cleanString(body.displayName || email.split("@")[0], { max:100, field:"Weergavenaam", allowEmpty:false });

    const existing = await db.prepare("SELECT email, role, active FROM app_users WHERE lower(email)=lower(?)").bind(email).first();
    if (existing && String(existing.role) === "admin" && Number(existing.active) === 1 && (role !== "admin" || active !== 1)) {
      const count = await db.prepare("SELECT COUNT(*) AS count FROM app_users WHERE role='admin' AND active=1").first();
      if (Number(count?.count || 0) <= 1) throw httpError("De laatste actieve admin kan niet worden gedeactiveerd of gedegradeerd.", 409, "LAST_ADMIN_REQUIRED");
    }

    try {
      if (existing) {
        await db.prepare(
          `UPDATE app_users
              SET display_name = ?, role = ?, active = ?
            WHERE lower(email) = lower(?)`
        ).bind(displayName, role, active, email).run();
      } else {
        await db.prepare(
          `INSERT INTO app_users (email, display_name, role, active)
           VALUES (?, ?, ?, ?)`
        ).bind(email, displayName, role, active).run();
      }
    } catch (error) {
      if (/(?:CWS_LAST_ADMIN_REQUIRED|last_active_admin)/i.test(String(error?.message || error))) {
        throw httpError("De laatste actieve admin kan niet worden gedeactiveerd of gedegradeerd.", 409, "LAST_ADMIN_REQUIRED");
      }
      throw error;
    }
    await writeAudit(db, identity.email, existing ? "user_updated" : "user_created", { targetEmail:email, role, active:Boolean(active) }, "app_user", email);
    return json({ ok:true, user:{ email, displayName, role, active:Boolean(active) } });
  } catch (error) {
    return errorResponse(error);
  }
}

export function onRequestOptions(context) {
  return optionsResponse("GET,PUT,OPTIONS", context.request);
}

export function onRequest() {
  return json({ ok:false, error:"Method not allowed." }, 405, { Allow:"GET,PUT,OPTIONS" });
}
