import {
  STATE_KEY,
  TENANT_ID,
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
import { RETAIN_VERSIONS } from "./_state_storage.js";

const MARKER = "cws-d1-maintenance-v1";

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ""));
  const b = new TextEncoder().encode(String(right || ""));
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) diff |= (a[index] || 0) ^ (b[index] || 0);
  return diff === 0;
}

async function describe(db) {
  const state = await db.prepare(
    `SELECT version, updated_at, updated_by, length(state_json) AS state_chars
       FROM app_state WHERE tenant_id = ? AND state_key = ?`
  ).bind(TENANT_ID, STATE_KEY).first();
  const chunks = await db.prepare(
    `SELECT COUNT(*) AS row_count,
            COUNT(DISTINCT version) AS version_count,
            COALESCE(SUM(length(chunk_text)),0) AS total_chars,
            MIN(version) AS min_version,
            MAX(version) AS max_version
       FROM app_state_chunks WHERE tenant_id = ? AND state_key = ?`
  ).bind(TENANT_ID, STATE_KEY).first();
  const commits = await db.prepare(
    `SELECT COUNT(*) AS row_count, MIN(version) AS min_version, MAX(version) AS max_version
       FROM app_state_commits WHERE tenant_id = ? AND state_key = ?`
  ).bind(TENANT_ID, STATE_KEY).first();
  const revisions = await db.prepare(
    `SELECT COUNT(*) AS row_count, COALESCE(SUM(length(snapshot_json)),0) AS total_chars
       FROM app_revisions WHERE tenant_id = ?`
  ).bind(TENANT_ID).first();
  return {
    state:{
      version:Number(state?.version || 0),
      updatedAt:state?.updated_at || null,
      updatedBy:state?.updated_by || null,
      stateChars:Number(state?.state_chars || 0)
    },
    chunks:{
      rowCount:Number(chunks?.row_count || 0),
      versionCount:Number(chunks?.version_count || 0),
      totalChars:Number(chunks?.total_chars || 0),
      minVersion:chunks?.min_version ?? null,
      maxVersion:chunks?.max_version ?? null
    },
    commits:{
      rowCount:Number(commits?.row_count || 0),
      minVersion:commits?.min_version ?? null,
      maxVersion:commits?.max_version ?? null
    },
    revisions:{ rowCount:Number(revisions?.row_count || 0), totalChars:Number(revisions?.total_chars || 0) }
  };
}

async function requireAdmin(context) {
  const db = context.env?.DB;
  if (!db) throw httpError("D1-binding DB ontbreekt.", 500, "D1_BINDING_MISSING");
  await requireRuntimeSchema(db);
  const identity = await requireIdentity(context);
  const user = await getAuthorizedUser(db, identity.email, context.env || {});
  if (!canManageUsers(user)) throw httpError("Alleen een actieve admin mag D1-onderhoud uitvoeren.", 403, "ADMIN_REQUIRED");
  return { db, identity, user };
}

export async function onRequestPost(context) {
  try {
    assertSameOrigin(context.request, context.env || {});
    const { db, identity } = await requireAdmin(context);
    const body = await readJsonBody(context.request, 8_000);
    const confirm = String(body.confirm || "");
    const dryRun = body.dryRun !== false;
    const requestedKeep = Number(body.keepVersions ?? RETAIN_VERSIONS);
    if (!Number.isInteger(requestedKeep) || requestedKeep < 2 || requestedKeep > RETAIN_VERSIONS) {
      throw httpError(`keepVersions moet een geheel getal tussen 2 en ${RETAIN_VERSIONS} zijn.`, 400, "KEEP_VERSIONS_INVALID");
    }
    const keepVersions = requestedKeep;
    if (confirm !== "CLEANUP_D1") throw httpError("Bevestiging ontbreekt. Gebruik confirm: CLEANUP_D1.", 400, "MAINTENANCE_CONFIRM_REQUIRED");

    const before = await describe(db);
    const currentVersion = before.state.version;
    const minKeepVersion = Math.max(1, currentVersion - keepVersions + 1);
    const plan = {
      currentVersion,
      keepVersions,
      minKeepVersion,
      deleteChunkVersionsBelow:minKeepVersion,
      deleteCommitVersionsBelow:minKeepVersion,
      deleteOrphanChunksWithoutCommit:true
    };

    if (dryRun) {
      await writeAudit(db, identity.email, "d1_cleanup_dry_run", { plan, marker:MARKER }, "maintenance", STATE_KEY);
      return json({ ok:true, dryRun:true, marker:MARKER, plan, before });
    }

    const configuredToken = String(context.env?.CWS_MAINTENANCE_TOKEN || "");
    const suppliedToken = String(context.request.headers.get("X-CWS-Maintenance-Token") || "");
    if (!configuredToken) throw httpError("CWS_MAINTENANCE_TOKEN is niet ingesteld.", 503, "MAINTENANCE_TOKEN_NOT_CONFIGURED");
    if (!constantTimeEqual(configuredToken, suppliedToken)) throw httpError("Onderhoudstoken is ongeldig.", 403, "MAINTENANCE_TOKEN_INVALID");

    const results = await db.batch([
      db.prepare(
        `DELETE FROM app_state_chunks
          WHERE tenant_id = ? AND state_key = ? AND version < ?`
      ).bind(TENANT_ID, STATE_KEY, minKeepVersion),
      db.prepare(
        `DELETE FROM app_state_chunks
          WHERE tenant_id = ? AND state_key = ?
            AND NOT EXISTS (
              SELECT 1 FROM app_state_commits c
               WHERE c.tenant_id = app_state_chunks.tenant_id
                 AND c.state_key = app_state_chunks.state_key
                 AND c.version = app_state_chunks.version
            )`
      ).bind(TENANT_ID, STATE_KEY),
      db.prepare(
        `DELETE FROM app_state_commits
          WHERE tenant_id = ? AND state_key = ? AND version < ?`
      ).bind(TENANT_ID, STATE_KEY, minKeepVersion),
      db.prepare(
        `INSERT INTO audit_log
          (tenant_id, actor_email, action, entity_type, entity_id, metadata_json)
         VALUES (?, ?, 'd1_cleanup_executed', 'maintenance', ?, ?)`
      ).bind(TENANT_ID, identity.email, STATE_KEY, JSON.stringify({ plan, marker:MARKER }))
    ]);
    const changes = results.slice(0, 3).map(result => Number(result?.meta?.changes ?? result?.changes ?? 0));
    const after = await describe(db);
    return json({ ok:true, dryRun:false, marker:MARKER, plan, deleted:{ oldChunks:changes[0], orphanChunks:changes[1], oldCommits:changes[2] }, before, after });
  } catch (error) {
    return errorResponse(error, 500, { marker:MARKER });
  }
}

export function onRequestOptions(context) {
  return optionsResponse("POST,OPTIONS", context.request);
}

export function onRequest() {
  return json({ ok:false, error:"Method not allowed.", marker:MARKER }, 405, { Allow:"POST,OPTIONS" });
}
