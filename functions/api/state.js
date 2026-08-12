import {
  MAX_STATE_BYTES,
  STATE_KEY,
  TENANT_ID,
  assertSameOrigin,
  canWriteState,
  errorResponse,
  getAuthorizedUser,
  json,
  optionsResponse,
  rawStateResponse,
  requireIdentity,
  requireRuntimeSchema,
  stateResponseHeaders,
  writeAudit
} from "./_shared.js";
import { byteLength, httpError, readTextBody } from "./_validation.js";
import {
  isDestructiveReplacement,
  parseStateManifest,
  readActiveState,
  readStateChunk,
  stateMetrics,
  writeStateCAS
} from "./_state_storage.js";

const MARKER = "cws-state-api-v2-atomic-cas";

function safeHeader(value) {
  return String(value ?? "").replace(/[\r\n]/g, " ");
}

function rawRequested(request, url) {
  return request.headers.get("X-CWS-State-Response") === "raw-state" || url.searchParams.get("payload") === "raw-state";
}

function parseBaseVersion(request, url, body = null) {
  const candidates = [
    request.headers.get("X-CWS-Base-Version"),
    url.searchParams.get("baseVersion"),
    body?.baseVersion
  ];
  const supplied = candidates.find(value => value !== null && value !== undefined && String(value).trim() !== "");
  const parsed = Number(supplied);
  if (!Number.isInteger(parsed) || parsed < 0) throw httpError("baseVersion ontbreekt of is ongeldig.", 428, "BASE_VERSION_REQUIRED");
  return parsed;
}

async function readIncomingState(context) {
  const url = new URL(context.request.url);
  const rawMode = context.request.headers.get("X-CWS-State-Payload") === "raw-state" || url.searchParams.get("payload") === "raw-state";
  const text = await readTextBody(context.request, MAX_STATE_BYTES + 128_000);
  if (rawMode) {
    let state;
    try { state = JSON.parse(text); }
    catch (_) { throw httpError("Inkomende state is geen geldige JSON.", 400, "STATE_JSON_INVALID"); }
    return { state, baseVersion: parseBaseVersion(context.request, url), rawMode: true, bytes: byteLength(text) };
  }
  let body;
  try { body = JSON.parse(text || "{}"); }
  catch (_) { throw httpError("Ongeldige JSON-body.", 400, "JSON_INVALID"); }
  if (!body?.state || typeof body.state !== "object" || Array.isArray(body.state)) throw httpError("Body moet een state-object bevatten.", 400, "STATE_BODY_REQUIRED");
  return { state: body.state, baseVersion: parseBaseVersion(context.request, url, body), rawMode: false, bytes: byteLength(JSON.stringify(body.state)) };
}

function destructiveIntentAllowed(request, user, baseVersion, assessment) {
  if (!assessment.destructive) return true;
  if (String(user?.role || "").toLowerCase() !== "admin") throw httpError("Grote gegevensverwijdering vereist een beheerder.", 403, "DESTRUCTIVE_ADMIN_REQUIRED", assessment);
  const intent = String(request.headers.get("X-CWS-Destructive-Intent") || "").trim().toLowerCase();
  const confirm = String(request.headers.get("X-CWS-Destructive-Confirm") || "").trim();
  const allowed = new Set(["import", "restore", "reset-demo", "recovery"]);
  if (!allowed.has(intent) || confirm !== String(baseVersion)) {
    throw httpError("Grote gegevensverwijdering is geblokkeerd zonder expliciete bevestiging.", 409, "DESTRUCTIVE_CONFIRM_REQUIRED", {
      ...assessment,
      requiredIntent: Array.from(allowed),
      requiredConfirm: String(baseVersion)
    });
  }
  return true;
}

async function authenticate(context, { write = false } = {}) {
  const db = context.env?.DB;
  if (!db) throw httpError("D1-binding DB ontbreekt.", 500, "D1_BINDING_MISSING");
  const identity = await requireIdentity(context);
  await requireRuntimeSchema(db);
  const user = await getAuthorizedUser(db, identity.email, context.env || {});
  if (write && !canWriteState(user)) throw httpError("Gebruiker heeft alleen leesrechten.", 403, "STATE_WRITE_FORBIDDEN");
  return { db, identity, user };
}

function responseMeta(resolved, user) {
  return stateResponseHeaders({
    exists: resolved.exists,
    version: resolved.activeVersion ?? resolved.version,
    updatedAt: resolved.row?.updated_at || "",
    updatedBy: resolved.row?.updated_by || "",
    user,
    bytes: resolved.bytes,
    chunked: resolved.chunked,
    chunkCount: resolved.chunkCount,
    checksum: resolved.checksum
  });
}

export async function onRequestGet(context) {
  try {
    const { db, user } = await authenticate(context);
    const url = new URL(context.request.url);
    const resolved = await readActiveState(db, { recover: true });
    const headers = responseMeta(resolved, user);
    headers["X-CWS-Marker"] = MARKER;
    headers["X-CWS-Recovered-Truncated-State"] = resolved.recovered ? "1" : "0";
    headers["X-CWS-Unrecoverable-Invalid-Chunks"] = "0";

    const chunkIndexValue = url.searchParams.get("chunkIndex");
    if (chunkIndexValue !== null) {
      if (!resolved.exists || !resolved.chunked || resolved.recovered) throw httpError("Statechunk is niet beschikbaar.", 404, "STATE_CHUNK_NOT_AVAILABLE");
      const index = Number(chunkIndexValue);
      const version = Number(url.searchParams.get("version") || resolved.version);
      if (!Number.isInteger(index) || index < 0 || index >= resolved.chunkCount || version !== resolved.version) throw httpError("Statechunkparameters zijn ongeldig.", 400, "STATE_CHUNK_PARAMETERS");
      const chunk = await readStateChunk(db, { version, index });
      return rawStateResponse(chunk, 200, {
        ...headers,
        "Content-Type": "text/plain; charset=utf-8",
        "X-CWS-Chunk-Index": String(index),
        "X-CWS-Chunk-Version": String(version)
      });
    }

    if (rawRequested(context.request, url)) {
      if (resolved.exists && resolved.chunked && !resolved.recovered && (url.searchParams.get("chunks") === "auto" || url.searchParams.get("manifest") === "1")) {
        return rawStateResponse(JSON.stringify(resolved.manifest), 200, {
          ...headers,
          "X-CWS-Chunked-Manifest": "1"
        });
      }
      return rawStateResponse(resolved.raw || "", 200, {
        ...headers,
        "X-CWS-Chunked-Manifest": "0"
      });
    }

    return json({
      ok: true,
      exists: resolved.exists,
      tenantId: TENANT_ID,
      stateKey: STATE_KEY,
      version: Number(resolved.activeVersion ?? resolved.version ?? 0),
      stateJson: resolved.exists ? resolved.raw : null,
      stateEncoding: resolved.exists ? "json-string" : "empty",
      bytes: resolved.bytes,
      checksum: resolved.checksum || null,
      updatedAt: resolved.row?.updated_at || null,
      updatedBy: resolved.row?.updated_by || null,
      recovered: Boolean(resolved.recovered),
      recoveredFromVersion: resolved.recoveredFromVersion || null,
      user: { email: user.email, displayName: user.display_name, role: user.role, active: Boolean(Number(user.active)) },
      storage: { chunked: resolved.chunked, chunkCount: resolved.chunkCount, marker: MARKER }
    }, 200, headers);
  } catch (error) {
    return errorResponse(error, 500, { marker: MARKER });
  }
}

export async function onRequestPut(context) {
  try {
    assertSameOrigin(context.request, context.env || {});
    const { db, identity, user } = await authenticate(context, { write: true });
    const incoming = await readIncomingState(context);
    const current = await readActiveState(db, { recover: true });
    const assessment = isDestructiveReplacement(current.state || {}, incoming.state);
    destructiveIntentAllowed(context.request, user, incoming.baseVersion, assessment);

    const result = await writeStateCAS(db, {
      state: incoming.state,
      baseVersion: incoming.baseVersion,
      email: identity.email
    });
    if (result.conflict) {
      return json({
        ok: false,
        error: "State is gewijzigd door een andere gebruiker. Herlaad eerst de actuele versie.",
        code: "STATE_VERSION_CONFLICT",
        currentVersion: result.currentVersion,
        baseVersion: result.baseVersion,
        marker: MARKER
      }, 409);
    }

    try {
      await writeAudit(db, identity.email, "state_saved", {
        version: result.version,
        baseVersion: result.baseVersion,
        bytes: result.bytes,
        checksum: result.checksum,
        chunked: result.chunked,
        chunkCount: result.chunkCount,
        rawMode: incoming.rawMode,
        metrics: stateMetrics(result.state),
        destructiveAssessment: assessment,
        marker: MARKER
      }, "app_state", STATE_KEY);
    } catch (_) {}

    return json({
      ok: true,
      version: result.version,
      updatedBy: identity.email,
      bytes: result.bytes,
      checksum: result.checksum,
      storage: { chunked: result.chunked, chunkCount: result.chunkCount, marker: MARKER },
      v82: { marker: MARKER, chunked: result.chunked, chunkCount: result.chunkCount }
    }, 200, {
      "X-CWS-Version": String(result.version),
      "X-CWS-Checksum": safeHeader(result.checksum)
    });
  } catch (error) {
    return errorResponse(error, 500, { marker: MARKER });
  }
}

export function onRequestOptions(context) {
  return optionsResponse("GET,PUT,OPTIONS", context.request);
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed.", code: "METHOD_NOT_ALLOWED", marker: MARKER }, 405, { Allow: "GET,PUT,OPTIONS" });
}
