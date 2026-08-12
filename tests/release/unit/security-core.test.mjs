import test from "node:test";
import assert from "node:assert/strict";

import { authenticateRequest } from "../../../functions/api/_auth.js";
import { assertSameOrigin } from "../../../functions/api/_shared.js";
import {
  assertJsonComplexity,
  normalizeSafeLogo,
  sanitizeStateObject
} from "../../../functions/api/_validation.js";
import {
  parseStateManifest,
  sha256Hex,
  splitStateIntoChunks
} from "../../../functions/api/_state_storage.js";
import { createXlsx, createZip, readXlsx, readZip } from "../../../scripts/xlsx-lite.mjs";

test("lokale authenticatie werkt alleen met expliciete bypass", async () => {
  const request = new Request("http://localhost/api/identity", {
    headers: { "X-CWS-Local-User-Email": "Admin@CWS.test" }
  });
  const identity = await authenticateRequest(request, { CWS_LOCAL_AUTH_BYPASS: "true" });
  assert.equal(identity.email, "admin@cws.test");
  assert.equal(identity.source, "local-explicit-bypass");

  await assert.rejects(
    authenticateRequest(new Request("https://planning.example/api/identity"), {}),
    error => error?.code === "ACCESS_JWT_MISSING" && error?.status === 401
  );
});

test("wijzigingsverzoeken vereisen dezelfde origin", () => {
  assert.equal(assertSameOrigin(new Request("https://planning.example/api/state", {
    method: "PUT",
    headers: { Origin: "https://planning.example" }
  })), true);

  assert.throws(
    () => assertSameOrigin(new Request("https://planning.example/api/state", {
      method: "PUT",
      headers: { Origin: "https://evil.example" }
    })),
    error => error?.code === "ORIGIN_FORBIDDEN" && error?.status === 403
  );
});

test("state-validatie accepteert lege datasets maar weigert onveilige logo's", () => {
  const png = { dataUrl: "data:image/png;base64,iVBORw0KGgo=", name: "logo.png", size: 10 };
  assert.equal(normalizeSafeLogo(png).type, "image/png");

  const state = sanitizeStateObject({
    schemaVersion: 12,
    projects: { order: [], byId: {}, deptHours: [] },
    settings: { logo: png }
  });
  assert.deepEqual(state.projects.order, []);
  assert.equal(state.settings.logo.type, "image/png");

  assert.throws(
    () => sanitizeStateObject({
      schemaVersion: 12,
      settings: { logo: { dataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" } }
    }),
    error => error?.code === "LOGO_INVALID"
  );
  assert.throws(() => sanitizeStateObject({ projects: {} }), error => error?.code === "STATE_INVALID");
});

test("JSON-complexiteit en logo-omvang zijn begrensd", () => {
  let deep = {};
  let cursor = deep;
  for (let index = 0; index < 45; index += 1) cursor = cursor.next = {};
  assert.throws(() => assertJsonComplexity(deep), error => error?.code === "JSON_TOO_DEEP");

  const oversized = { dataUrl: `data:image/png;base64,${"A".repeat(1_600_001)}` };
  assert.throws(() => normalizeSafeLogo(oversized), error => error?.code === "LOGO_INVALID");
});

test("statechunks en checksum zijn deterministisch", async () => {
  const raw = JSON.stringify({ schemaVersion: 12, text: "x".repeat(500_000) });
  const chunks = splitStateIntoChunks(raw);
  assert.ok(chunks.length >= 3);
  assert.equal(chunks.join(""), raw);
  assert.match(await sha256Hex(raw), /^[a-f0-9]{64}$/);

  const legacy = JSON.stringify({ __cwsChunkedState: true, version: 9, chunkCount: 3, bytes: raw.length });
  const parsed = parseStateManifest(legacy);
  assert.equal(parsed.version, 9);
  assert.equal(parsed.chunkCount, 3);
});

test("ingebouwde XLSX-code schrijft en leest zonder externe package", () => {
  const workbook = createXlsx([
    { name: "Projecten", rows: [["Nummer", "Naam"], ["P-001", "Project, met komma"], ["P-002", "=2+2"]] },
    { name: "Uren", rows: [["Project", "Uren"], ["P-001", "12.5"]] }
  ]);
  assert.ok(workbook.length > 1_000);
  const sheets = readXlsx(workbook);
  assert.equal(sheets.length, 2);
  assert.deepEqual(sheets[0].rows[1], ["P-001", "Project, met komma"]);
  assert.equal(sheets[0].rows[2][1], "=2+2");
  assert.ok(readZip(workbook).has("xl/workbook.xml"));

  assert.throws(
    () => createZip([{ name: "../outside.txt", data: "blocked" }]),
    /Ongeldige ZIP-naam/
  );
});
