export function makeRequest(url, {
  method = "GET",
  email = "admin@example.test",
  body,
  headers = {},
  origin = true
} = {}) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("X-CWS-Local-User-Email", email);
  if (origin && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
    requestHeaders.set("Origin", new URL(url).origin);
  }
  if (body !== undefined && !requestHeaders.has("Content-Type")) requestHeaders.set("Content-Type", "application/json");
  return new Request(url, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body))
  });
}

export function makeContext(db, request, extraEnv = {}) {
  return {
    request,
    env: {
      DB: db,
      CWS_LOCAL_AUTH_BYPASS: "true",
      CWS_BOOTSTRAP_ADMIN_EMAIL: "admin@example.test",
      ...extraEnv
    },
    waitUntil() {},
    next: async () => new Response("next")
  };
}

export async function jsonBody(response) {
  return JSON.parse(await response.text());
}
