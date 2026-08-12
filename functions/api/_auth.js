const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);
const JWKS_TTL_MS = 5 * 60 * 1000;
const jwksCache = new Map();

function authError(message, status = 401, code = "AUTH_ERROR") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function isLocalRequest(request) {
  try {
    const hostname = new URL(request.url).hostname.toLowerCase();
    return LOCAL_HOSTS.has(hostname) || hostname.endsWith(".local");
  } catch (_) {
    return false;
  }
}

function normalizeIssuer(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  return (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).replace(/\/+$/, "");
}

function parseAudiences(value) {
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
  return String(value || "").split(/[\s,]+/).map(v => v.trim()).filter(Boolean);
}

function base64UrlToBytes(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  let binary;
  try { binary = atob(padded); }
  catch (_) { throw authError("Cloudflare Access JWT is ongeldig gecodeerd.", 401, "ACCESS_JWT_ENCODING"); }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJsonPart(part, label) {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
  } catch (_) {
    throw authError(`Cloudflare Access JWT bevat een ongeldige ${label}.`, 401, "ACCESS_JWT_FORMAT");
  }
}

async function fetchJwks(issuer) {
  const cached = jwksCache.get(issuer);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;
  let response;
  try {
    response = await fetch(`${issuer}/cdn-cgi/access/certs`, {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 300, cacheEverything: true }
    });
  } catch (_) {
    throw authError("Cloudflare Access certificaten konden niet worden opgehaald.", 503, "ACCESS_JWKS_UNAVAILABLE");
  }
  if (!response.ok) throw authError("Cloudflare Access certificaten konden niet worden opgehaald.", 503, "ACCESS_JWKS_UNAVAILABLE");
  const body = await response.json().catch(() => null);
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  if (!keys.length) throw authError("Cloudflare Access certificaten ontbreken.", 503, "ACCESS_JWKS_EMPTY");
  jwksCache.set(issuer, { keys, expiresAt: Date.now() + JWKS_TTL_MS });
  return keys;
}

async function verifyRs256(signingInput, signature, jwk) {
  let key;
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
  } catch (_) {
    return false;
  }
  return crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    signature,
    new TextEncoder().encode(signingInput)
  );
}

function validateClaims(payload, issuer, audiences) {
  const now = Math.floor(Date.now() / 1000);
  const skew = 60;
  const tokenIssuer = normalizeIssuer(payload?.iss);
  if (!tokenIssuer || tokenIssuer !== issuer) throw authError("Cloudflare Access issuer is ongeldig.", 401, "ACCESS_ISSUER_INVALID");
  const tokenAudiences = Array.isArray(payload?.aud) ? payload.aud.map(String) : [String(payload?.aud || "")];
  if (!audiences.some(audience => tokenAudiences.includes(audience))) {
    throw authError("Cloudflare Access audience is ongeldig.", 401, "ACCESS_AUDIENCE_INVALID");
  }
  if (!Number.isFinite(Number(payload?.exp)) || Number(payload.exp) < now - skew) {
    throw authError("Cloudflare Access JWT is verlopen.", 401, "ACCESS_JWT_EXPIRED");
  }
  if (payload?.nbf != null && Number(payload.nbf) > now + skew) {
    throw authError("Cloudflare Access JWT is nog niet geldig.", 401, "ACCESS_JWT_NOT_YET_VALID");
  }
  if (payload?.iat != null && Number(payload.iat) > now + skew) {
    throw authError("Cloudflare Access JWT heeft een ongeldige uitgiftetijd.", 401, "ACCESS_JWT_IAT_INVALID");
  }
}

function localIdentity(request, env) {
  if (!isLocalRequest(request) || String(env?.CWS_LOCAL_AUTH_BYPASS || "").toLowerCase() !== "true") return null;
  const email = String(
    request.headers.get("X-CWS-Local-User-Email") ||
    env?.CWS_BOOTSTRAP_ADMIN_EMAIL ||
    "local-admin@cws.test"
  ).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw authError("Lokale testidentiteit is ongeldig.", 401, "LOCAL_IDENTITY_INVALID");
  return { email, source: "local-explicit-bypass", claims: { email } };
}

export async function authenticateRequest(request, env = {}) {
  const local = localIdentity(request, env);
  if (local) return local;

  const token = String(request.headers.get("Cf-Access-Jwt-Assertion") || "").trim();
  if (!token) throw authError("Cloudflare Access JWT ontbreekt.", 401, "ACCESS_JWT_MISSING");

  const issuer = normalizeIssuer(env.ACCESS_TEAM_DOMAIN);
  const audiences = parseAudiences(env.ACCESS_AUD || env.POLICY_AUD);
  if (!issuer || !audiences.length) {
    throw authError("Cloudflare Access-configuratie ontbreekt (ACCESS_TEAM_DOMAIN/ACCESS_AUD).", 500, "ACCESS_CONFIG_MISSING");
  }

  const parts = token.split(".");
  if (parts.length !== 3) throw authError("Cloudflare Access JWT heeft een ongeldig formaat.", 401, "ACCESS_JWT_FORMAT");
  const header = decodeJsonPart(parts[0], "header");
  const payload = decodeJsonPart(parts[1], "payload");
  if (header?.alg !== "RS256" || !header?.kid) throw authError("Cloudflare Access JWT gebruikt geen toegestane sleutel.", 401, "ACCESS_JWT_ALGORITHM");

  const keys = await fetchJwks(issuer);
  const candidates = keys.filter(key => key?.kid === header.kid && (!key.alg || key.alg === "RS256"));
  if (!candidates.length) {
    jwksCache.delete(issuer);
    const refreshed = await fetchJwks(issuer);
    candidates.push(...refreshed.filter(key => key?.kid === header.kid && (!key.alg || key.alg === "RS256")));
  }
  if (!candidates.length) throw authError("Cloudflare Access ondertekeningssleutel is onbekend.", 401, "ACCESS_JWT_KEY_UNKNOWN");

  const signingInput = `${parts[0]}.${parts[1]}`;
  const signature = base64UrlToBytes(parts[2]);
  let verified = false;
  for (const jwk of candidates) {
    if (await verifyRs256(signingInput, signature, jwk)) { verified = true; break; }
  }
  if (!verified) throw authError("Cloudflare Access JWT-handtekening is ongeldig.", 401, "ACCESS_JWT_SIGNATURE");

  validateClaims(payload, issuer, audiences);
  const email = String(payload.email || payload.sub || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw authError("Cloudflare Access JWT bevat geen geldig e-mailadres.", 401, "ACCESS_EMAIL_MISSING");
  const headerEmail = String(request.headers.get("CF-Access-Authenticated-User-Email") || "").trim().toLowerCase();
  if (headerEmail && headerEmail !== email) throw authError("Cloudflare Access identiteit komt niet overeen met de JWT.", 401, "ACCESS_IDENTITY_MISMATCH");
  return { email, source: "cloudflare-access-jwt", claims: payload };
}
