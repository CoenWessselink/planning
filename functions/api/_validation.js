export const MAX_JSON_BODY_BYTES = 64_000;
export const MAX_REVISION_BODY_BYTES = 1_250_000;
export const MAX_AUDIT_METADATA_BYTES = 16_000;
export const MAX_LOGO_DATA_URL_BYTES = 1_600_000;

export function byteLength(value) {
  return new TextEncoder().encode(String(value ?? "")).byteLength;
}

export function httpError(message, status = 400, code = "INVALID_REQUEST", details = null) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details !== null) error.details = details;
  return error;
}

export function cleanString(value, { max = 255, min = 0, field = "waarde", allowEmpty = true, pattern = null } = {}) {
  const text = String(value ?? "").trim();
  if (!allowEmpty && !text) throw httpError(`${field} ontbreekt.`, 400, "FIELD_REQUIRED");
  if (text.length < min || text.length > max) throw httpError(`${field} heeft een ongeldige lengte.`, 400, "FIELD_LENGTH");
  if (pattern && text && !pattern.test(text)) throw httpError(`${field} heeft een ongeldig formaat.`, 400, "FIELD_FORMAT");
  return text;
}

export function normalizeEmail(value, field = "e-mailadres") {
  const email = cleanString(value, { max: 254, field, allowEmpty: false }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(`${field} is ongeldig.`, 400, "EMAIL_INVALID");
  return email;
}

export async function readTextBody(request, maxBytes = MAX_JSON_BODY_BYTES) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared && declared > maxBytes) throw httpError("Request is te groot.", 413, "PAYLOAD_TOO_LARGE");
  const text = await request.text();
  if (byteLength(text) > maxBytes) throw httpError("Request is te groot.", 413, "PAYLOAD_TOO_LARGE");
  return text;
}

export async function readJsonBody(request, maxBytes = MAX_JSON_BODY_BYTES) {
  const text = await readTextBody(request, maxBytes);
  if (!text) return {};
  try { return JSON.parse(text); }
  catch (_) { throw httpError("Ongeldige JSON-body.", 400, "JSON_INVALID"); }
}

function inspectValue(value, limits, depth, counter, seen) {
  if (depth > limits.maxDepth) throw httpError("JSON is te diep genest.", 400, "JSON_TOO_DEEP");
  counter.nodes += 1;
  if (counter.nodes > limits.maxNodes) throw httpError("JSON bevat te veel onderdelen.", 400, "JSON_TOO_COMPLEX");
  if (typeof value === "string" && value.length > limits.maxStringLength) throw httpError("JSON bevat een te lange tekstwaarde.", 400, "JSON_STRING_TOO_LONG");
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) throw httpError("JSON bevat een circulaire structuur.", 400, "JSON_CIRCULAR");
  seen.add(value);
  if (Array.isArray(value) && value.length > limits.maxArrayLength) throw httpError("JSON bevat een te grote lijst.", 400, "JSON_ARRAY_TOO_LARGE");
  for (const child of (Array.isArray(value) ? value : Object.values(value))) inspectValue(child, limits, depth + 1, counter, seen);
  seen.delete(value);
}

export function assertJsonComplexity(value, overrides = {}) {
  const limits = {
    maxDepth: 40,
    maxNodes: 250_000,
    maxStringLength: MAX_LOGO_DATA_URL_BYTES,
    maxArrayLength: 100_000,
    ...overrides
  };
  inspectValue(value, limits, 0, { nodes: 0 }, new Set());
  return value;
}

export function safeMetadata(value) {
  const metadata = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  assertJsonComplexity(metadata, { maxDepth: 12, maxNodes: 2_000, maxStringLength: 4_000, maxArrayLength: 500 });
  const raw = JSON.stringify(metadata);
  if (byteLength(raw) > MAX_AUDIT_METADATA_BYTES) throw httpError("Auditmetadata is te groot.", 413, "AUDIT_METADATA_TOO_LARGE");
  return JSON.parse(raw);
}

export function normalizeSafeLogo(value, { rejectInvalid = true } = {}) {
  if (value == null || value === "") return null;
  const fail = message => {
    if (rejectInvalid) throw httpError(message, 400, "LOGO_INVALID");
    return null;
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("Logo heeft een ongeldig formaat.");
  const dataUrl = String(value.dataUrl || "");
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) return fail("Alleen PNG- en JPEG-logo's zijn toegestaan.");
  if (byteLength(dataUrl) > MAX_LOGO_DATA_URL_BYTES) return fail("Logo is te groot.");
  const type = match[1] === "png" ? "image/png" : "image/jpeg";
  const extension = match[1] === "png" ? "png" : "jpg";
  const name = cleanString(value.name || `logo.${extension}`, { max: 120, field: "Logonaam" }).replace(/[<>"'`\\/]/g, "_");
  return {
    dataUrl,
    name,
    type,
    size: Math.max(0, Math.min(Number(value.size || 0) || 0, MAX_LOGO_DATA_URL_BYTES)),
    updatedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(value.updatedAt || value.uploadedAt || "")) ? String(value.updatedAt || value.uploadedAt) : new Date().toISOString()
  };
}

export function sanitizeStateObject(state) {
  if (!state || typeof state !== "object" || Array.isArray(state) || !Number(state.schemaVersion)) {
    throw httpError("State moet een object met schemaVersion zijn.", 400, "STATE_INVALID");
  }
  assertJsonComplexity(state);
  const clean = JSON.parse(JSON.stringify(state));
  if (clean.company && typeof clean.company === "object" && !Array.isArray(clean.company) && Object.prototype.hasOwnProperty.call(clean.company, "logo")) {
    clean.company.logo = normalizeSafeLogo(clean.company.logo, { rejectInvalid: true });
  }
  clean.settings = clean.settings && typeof clean.settings === "object" && !Array.isArray(clean.settings) ? clean.settings : {};
  if (Object.prototype.hasOwnProperty.call(clean.settings, "logo")) clean.settings.logo = normalizeSafeLogo(clean.settings.logo, { rejectInvalid: true });
  if (Object.prototype.hasOwnProperty.call(clean, "logo")) clean.logo = normalizeSafeLogo(clean.logo, { rejectInvalid: true });
  return clean;
}

export function parsePositiveInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, field = "getal" } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw httpError(`${field} is ongeldig.`, 400, "INTEGER_INVALID");
  return number;
}
