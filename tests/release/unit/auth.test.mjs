import assert from "node:assert/strict";
import test from "node:test";
import { authenticateRequest, isLocalRequest } from "../../../functions/api/_auth.js";
import { assertSameOrigin } from "../../../functions/api/_shared.js";

function b64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

test("lokale bypass werkt uitsluitend expliciet op een lokaal adres", async () => {
  const local = new Request("http://127.0.0.1/api/identity", { headers: { "X-CWS-Local-User-Email": "ADMIN@EXAMPLE.TEST" } });
  assert.equal(isLocalRequest(local), true);
  const identity = await authenticateRequest(local, { CWS_LOCAL_AUTH_BYPASS: "true" });
  assert.equal(identity.email, "admin@example.test");

  const remote = new Request("https://planning.example.test/api/identity", { headers: { "X-CWS-Local-User-Email": "admin@example.test" } });
  await assert.rejects(() => authenticateRequest(remote, { CWS_LOCAL_AUTH_BYPASS: "true" }), error => error?.code === "ACCESS_JWT_MISSING");
});

test("een Access e-mailheader zonder JWT wordt geweigerd", async () => {
  const request = new Request("https://planning.example.test/api/identity", {
    headers: { "CF-Access-Authenticated-User-Email": "admin@example.test" }
  });
  await assert.rejects(() => authenticateRequest(request, {}), error => error?.status === 401 && error?.code === "ACCESS_JWT_MISSING");
});

test("niet-RS256 of onvolledige JWT's worden vóór netwerkvalidatie geweigerd", async () => {
  const token = `${b64url({ alg: "none", kid: "x" })}.${b64url({ email: "admin@example.test" })}.x`;
  const request = new Request("https://planning.example.test/api/identity", { headers: { "Cf-Access-Jwt-Assertion": token } });
  await assert.rejects(
    () => authenticateRequest(request, { ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com", ACCESS_AUD: "aud" }),
    error => error?.code === "ACCESS_JWT_ALGORITHM"
  );
});

test("mutaties vereisen exact dezelfde origin", () => {
  const same = new Request("https://planning.example.test/api/state", { method: "PUT", headers: { Origin: "https://planning.example.test" } });
  assert.equal(assertSameOrigin(same), true);
  const cross = new Request("https://planning.example.test/api/state", { method: "PUT", headers: { Origin: "https://evil.example" } });
  assert.throws(() => assertSameOrigin(cross), error => error?.code === "ORIGIN_FORBIDDEN");
  const absent = new Request("https://planning.example.test/api/state", { method: "PUT" });
  assert.throws(() => assertSameOrigin(absent), error => error?.code === "ORIGIN_REQUIRED");
});
