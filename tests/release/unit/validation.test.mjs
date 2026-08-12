import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_LOGO_DATA_URL_BYTES,
  assertJsonComplexity,
  normalizeSafeLogo,
  safeMetadata,
  sanitizeStateObject
} from "../../../functions/api/_validation.js";

const tinyPng = "data:image/png;base64,iVBORw0KGgo=";
const tinyJpeg = "data:image/jpeg;base64,/9j/2Q==";

test("alleen begrensde PNG/JPEG-logo's worden geaccepteerd", () => {
  const png = normalizeSafeLogo({ dataUrl: tinyPng, name: "logo.png", type: "image/svg+xml" });
  assert.equal(png.type, "image/png");
  assert.equal(png.name, "logo.png");
  const jpeg = normalizeSafeLogo({ dataUrl: tinyJpeg, name: "foto.jpg" });
  assert.equal(jpeg.type, "image/jpeg");
});

test("actieve inhoud, SVG en attribuutinjectie worden geweigerd", () => {
  for (const dataUrl of [
    "javascript:alert(1)",
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "data:image/png;base64,AAAA\" onerror=alert(1)"
  ]) {
    assert.throws(() => normalizeSafeLogo({ dataUrl }), error => error?.code === "LOGO_INVALID");
  }
});

test("te grote logo's worden geweigerd", () => {
  const oversized = `data:image/png;base64,${"A".repeat(MAX_LOGO_DATA_URL_BYTES)}`;
  assert.throws(() => normalizeSafeLogo({ dataUrl: oversized }), error => error?.code === "LOGO_INVALID");
});

test("state-sanitizer verwijdert geen geldige gegevens en valideert logo's", () => {
  const source = { schemaVersion: 12, settings: { logo: { dataUrl: tinyPng, name: "<cws>.png" } }, projects: { order: ["p1"], byId: { p1: { name: "Test" } } } };
  const clean = sanitizeStateObject(source);
  assert.notEqual(clean, source);
  assert.equal(clean.projects.byId.p1.name, "Test");
  assert.equal(clean.settings.logo.name, "_cws_.png");
});

test("JSON-complexiteit en auditmetadata zijn begrensd", () => {
  assert.throws(() => assertJsonComplexity({ a: { b: { c: true } } }, { maxDepth: 1 }), error => error?.code === "JSON_TOO_DEEP");
  assert.throws(() => safeMetadata({ value: "x".repeat(20_000) }), error => ["JSON_STRING_TOO_LONG", "AUDIT_METADATA_TOO_LARGE"].includes(error?.code));
  const circular = {}; circular.self = circular;
  assert.throws(() => assertJsonComplexity(circular), error => error?.code === "JSON_CIRCULAR");
});
