import { STATE_KEY, TENANT_ID, ensureSchema, getOrCreateUser, json, requireActorEmail, verifyRequiredSchema } from "./_shared.js";

const MARKER = "v130-d1-cleanup-recover-full-db";

async function prepare(db) {
  let schema = await verifyRequiredSchema(db);
  if (!schema.ok) schema = await ensureSchema(db);
  await db.prepare(`CREATE TABLE IF NOT EXISTS app_state_chunks (
    tenant_id TEXT NOT NULL,
    state_key TEXT NOT NULL,
    version INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, state_key, version, chunk_index)
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS app_state_save_log (
    tenant_id TEXT NOT NULL,
    state_key TEXT NOT NULL,
    mutation_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    base_version INTEGER NOT NULL DEFAULT 0,
    bytes INTEGER NOT NULL DEFAULT 0,
    project_count INTEGER NOT NULL DEFAULT 0,
    gantt_row_count INTEGER NOT NULL DEFAULT 0,
    actor_email TEXT,
    status TEXT NOT NULL DEFAULT 'checkpointed',
    error_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, state_key, mutation_id)
  )`).run();
  return schema;
}

async function tableExists(db, name) {
  const row = await db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).bind(name).first();
  return Boolean(row?.name);
}

async function chunkStats(db) {
  const hasChunks = await tableExists(db, "app_state_chunks");
  if (!hasChunks) return { versionCount: 0, rowCount: 0, totalChars: 0, minVersion: null, maxVersion: null, versions: [] };
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
    versionCount: Number(summary?.version_count || 0),
    rowCount: Number(summary?.row_count || 0),
    totalChars: Number(summary?.total_chars || 0),
    minVersion: summary?.min_version ?? null,
    maxVersion: summary?.max_version ?? null,
    versions: versionsResult.results || []
  };
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

async function currentStateVersion(db) {
  const row = await db.prepare(`SELECT version, state_json FROM app_state WHERE tenant_id = ? AND state_key = ?`).bind(TENANT_ID, STATE_KEY).first();
  return { version: Number(row?.version || 0), hasState: Boolean(row?.state_json), stateJsonLength: row?.state_json ? String(row.state_json).length : 0 };
}

async function cleanup(db, keepVersions = 1) {
  const before = {
    state: await currentStateVersion(db),
    chunks: await chunkStats(db),
    revisions: await revisionStats(db),
    saveLog: await saveLogStats(db)
  };

  const currentVersion = Number(before.state.version || before.chunks.maxVersion || 0);
  const keep = Math.max(1, Math.min(5, Number(keepVersions || 1)));
  const minKeepVersion = Math.max(0, currentVersion - keep + 1);

  let deletedOldChunkRows = 0;
  let deletedLogRows = 0;

  if (await tableExists(db, "app_state_chunks")) {
    const del = await db.prepare(
      `DELETE FROM app_state_chunks
        WHERE tenant_id = ?
          AND state_key = ?
          AND version < ?`
    ).bind(TENANT_ID, STATE_KEY, minKeepVersion).run();
    deletedOldChunkRows = Number(del?.meta?.changes || del?.changes || 0);
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
             LIMIT 100
          )`
    ).bind(TENANT_ID, STATE_KEY, TENANT_ID, STATE_KEY).run();
    deletedLogRows = Number(logDel?.meta?.changes || logDel?.changes || 0);
  }

  const after = {
    state: await currentStateVersion(db),
    chunks: await chunkStats(db),
    revisions: await revisionStats(db),
    saveLog: await saveLogStats(db)
  };

  return {
    ok: true,
    marker: MARKER,
    keepVersions: keep,
    currentVersion,
    minKeepVersion,
    deletedOldChunkRows,
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
    await prepare(db);
    const user = await getOrCreateUser(db, email);
    if (!user.active || String(user.role || "").toLowerCase() === "viewer") {
      return json({ ok: false, error: "Geen schrijfrechten voor D1 cleanup.", marker: MARKER }, 403);
    }

    const url = new URL(context.request.url);
    const confirm = url.searchParams.get("confirm") || context.request.headers.get("X-CWS-D1-Cleanup-Confirm") || "";
    if (confirm !== "CLEANUP_D1") {
      return json({
        ok: false,
        error: "Bevestiging ontbreekt. Gebruik confirm=CLEANUP_D1.",
        marker: MARKER,
        current: {
          state: await currentStateVersion(db),
          chunks: await chunkStats(db),
          revisions: await revisionStats(db),
          saveLog: await saveLogStats(db)
        }
      }, 400);
    }

    const keepVersions = Number(url.searchParams.get("keepVersions") || 1);
    const result = await cleanup(db, keepVersions);
    return json(result, 200);
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error), marker: MARKER }, error.status || 500);
  }
}
