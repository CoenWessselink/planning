import { STATE_KEY, TENANT_ID, json, requireActorEmail } from "./_shared.js";

const MARKER = "v131-d1-cleanup-no-schema-writes";

async function tableExists(db, name) {
  const row = await db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).bind(name).first();
  return Boolean(row?.name);
}

async function chunkStats(db) {
  const hasChunks = await tableExists(db, "app_state_chunks");
  if (!hasChunks) return { exists: false, versionCount: 0, rowCount: 0, totalChars: 0, minVersion: null, maxVersion: null, versions: [] };
  const summary = await db.prepare(
    `SELECT COUNT(DISTINCT version) AS version_count,
            COUNT(*) AS row_count,
            COALESCE(SUM(length(chunk_text)), 0) AS total_chars,
            MIN(version) AS min_version,
            MAX(version) AS max_version
       FROM app_state_chunks
      WHERE tenant_id = ? AND state_key = ?`
  ).bind(TENANT_ID, STATE_KEY).first();
  const versionsResult = await db.prepare(
    `SELECT version, COUNT(*) AS chunk_count, COALESCE(SUM(length(chunk_text)), 0) AS total_chars
       FROM app_state_chunks
      WHERE tenant_id = ? AND state_key = ?
      GROUP BY version
      ORDER BY version DESC
      LIMIT 25`
  ).bind(TENANT_ID, STATE_KEY).all();
  return {
    exists: true,
    versionCount: Number(summary?.version_count || 0),
    rowCount: Number(summary?.row_count || 0),
    totalChars: Number(summary?.total_chars || 0),
    minVersion: summary?.min_version ?? null,
    maxVersion: summary?.max_version ?? null,
    versions: versionsResult.results || []
  };
}

async function currentStateVersion(db) {
  if (!(await tableExists(db, "app_state"))) return { exists: false, version: 0, hasState: false, stateJsonLength: 0 };
  const row = await db.prepare(`SELECT version, state_json FROM app_state WHERE tenant_id = ? AND state_key = ?`).bind(TENANT_ID, STATE_KEY).first();
  return { exists: Boolean(row), version: Number(row?.version || 0), hasState: Boolean(row?.state_json), stateJsonLength: row?.state_json ? String(row.state_json).length : 0 };
}

async function revisionStats(db) {
  const has = await tableExists(db, "app_revisions");
  if (!has) return { exists: false, count: 0, totalChars: 0 };
  const row = await db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(length(snapshot_json)), 0) AS total_chars FROM app_revisions`).first();
  return { exists: true, count: Number(row?.count || 0), totalChars: Number(row?.total_chars || 0) };
}

async function saveLogStats(db) {
  const has = await tableExists(db, "app_state_save_log");
  if (!has) return { exists: false, count: 0 };
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM app_state_save_log WHERE tenant_id = ? AND state_key = ?`).bind(TENANT_ID, STATE_KEY).first();
  return { exists: true, count: Number(row?.count || 0) };
}

async function userCanCleanup(db, email) {
  const hasUsers = await tableExists(db, "app_users");
  if (!hasUsers) return { ok: true, reason: "app_users table ontbreekt; Access identiteit aanwezig", role: "unknown" };
  const user = await db.prepare(`SELECT email, role, active FROM app_users WHERE lower(email) = lower(?) LIMIT 1`).bind(email).first();
  if (!user) return { ok: true, reason: "user record ontbreekt; Access identiteit aanwezig", role: "unknown" };
  if (!user.active) return { ok: false, reason: "Gebruiker is inactief", role: user.role || "unknown" };
  if (String(user.role || "").toLowerCase() === "viewer") return { ok: false, reason: "Viewer heeft geen cleanup-rechten", role: user.role || "viewer" };
  return { ok: true, reason: "user authorized", role: user.role || "unknown" };
}

async function describe(db) {
  return {
    state: await currentStateVersion(db),
    chunks: await chunkStats(db),
    revisions: await revisionStats(db),
    saveLog: await saveLogStats(db)
  };
}

async function cleanup(db, keepVersions = 1) {
  const before = await describe(db);
  const currentVersion = Number(before.state.version || before.chunks.maxVersion || 0);
  const keep = Math.max(1, Math.min(3, Number(keepVersions || 1)));
  const minKeepVersion = Math.max(0, currentVersion - keep + 1);

  let deletedOldChunkRows = 0;
  let deletedLogRows = 0;
  let deletedOrphanChunkRows = 0;

  if (await tableExists(db, "app_state_chunks")) {
    const old = await db.prepare(
      `DELETE FROM app_state_chunks
        WHERE tenant_id = ?
          AND state_key = ?
          AND version < ?`
    ).bind(TENANT_ID, STATE_KEY, minKeepVersion).run();
    deletedOldChunkRows = Number(old?.meta?.changes || old?.changes || 0);

    const orphan = await db.prepare(
      `DELETE FROM app_state_chunks
        WHERE tenant_id = ?
          AND state_key = ?
          AND version > ?`
    ).bind(TENANT_ID, STATE_KEY, Math.max(currentVersion, 0)).run();
    deletedOrphanChunkRows = Number(orphan?.meta?.changes || orphan?.changes || 0);
  }

  if (await tableExists(db, "app_state_save_log")) {
    const logDel = await db.prepare(
      `DELETE FROM app_state_save_log
        WHERE tenant_id = ?
          AND state_key = ?
          AND mutation_id NOT IN (
            SELECT mutation_id FROM app_state_save_log
             WHERE tenant_id = ? AND state_key = ?
             ORDER BY created_at DESC
             LIMIT 25
          )`
    ).bind(TENANT_ID, STATE_KEY, TENANT_ID, STATE_KEY).run();
    deletedLogRows = Number(logDel?.meta?.changes || logDel?.changes || 0);
  }

  const after = await describe(db);
  return {
    ok: true,
    marker: MARKER,
    noSchemaWrites: true,
    keepVersions: keep,
    currentVersion,
    minKeepVersion,
    deletedOldChunkRows,
    deletedOrphanChunkRows,
    deletedLogRows,
    before,
    after
  };
}

export async function onRequest(context) {
  const db = context.env?.DB;
  if (!db) return json({ ok: false, error: "D1-binding DB ontbreekt.", marker: MARKER }, 500);

  const method = String(context.request.method || "GET").toUpperCase();
  if (method === "OPTIONS") return new Response(null, { status: 204 });
  if (method !== "POST" && method !== "GET") return json({ ok: false, error: "Method not allowed", marker: MARKER }, 405);

  const email = requireActorEmail(context.request);
  if (!email) return json({ ok: false, error: "Cloudflare Access-identiteit ontbreekt.", marker: MARKER }, 401);

  try {
    const auth = await userCanCleanup(db, email);
    if (!auth.ok) return json({ ok: false, error: auth.reason, role: auth.role, marker: MARKER }, 403);

    const url = new URL(context.request.url);
    const confirm = url.searchParams.get("confirm") || context.request.headers.get("X-CWS-D1-Cleanup-Confirm") || "";
    if (confirm !== "CLEANUP_D1") {
      return json({
        ok: false,
        error: "Bevestiging ontbreekt. Gebruik confirm=CLEANUP_D1.",
        marker: MARKER,
        auth,
        current: await describe(db)
      }, 400);
    }

    const keepVersions = Number(url.searchParams.get("keepVersions") || 1);
    const result = await cleanup(db, keepVersions);
    return json({ ...result, auth }, 200);
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error), marker: MARKER }, error.status || 500);
  }
}
