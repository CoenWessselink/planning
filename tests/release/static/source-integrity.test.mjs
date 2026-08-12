import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function walk(directory, extensions = null) {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walk(absolute, extensions));
    else if (!extensions || extensions.has(path.extname(entry.name).toLowerCase())) output.push(absolute);
  }
  return output;
}

function attrs(tag) {
  const result = {};
  const body = tag.replace(/^<\/?[a-z0-9:-]+/i, "").replace(/>$/, "");
  const pattern = /([^\s"'=<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of body.matchAll(pattern)) result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  return result;
}

function lineAt(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

const htmlFiles = [path.join(root, "index.html"), ...walk(path.join(root, "layers"), new Set([".html"]))];

test("HTML-id's zijn per document uniek", () => {
  const duplicates = [];
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    const seen = new Map();
    for (const match of html.matchAll(/(?:^|\s)id\s*=\s*["']([^"']+)["']/gi)) {
      const id = match[1];
      if (seen.has(id)) duplicates.push(`${path.relative(root, file)}:${lineAt(html, match.index)} dubbel id=${id}`);
      else seen.set(id, match.index);
    }
  }
  assert.deepEqual(duplicates, []);
});

test("alle zichtbare form-controls hebben een toegankelijke naam", () => {
  const missing = [];
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    const explicitLabels = new Set([...html.matchAll(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(match => match[1]));
    let labelDepth = 0;
    const tokenPattern = /<\/label\s*>|<label\b[^>]*>|<(?:input|select|textarea)\b[^>]*>/gi;
    for (const match of html.matchAll(tokenPattern)) {
      const tag = match[0];
      if (/^<\/label/i.test(tag)) { labelDepth = Math.max(0, labelDepth - 1); continue; }
      if (/^<label\b/i.test(tag)) { labelDepth += 1; continue; }
      const values = attrs(tag);
      const type = String(values.type || "").toLowerCase();
      if (["hidden", "button", "submit", "reset", "image"].includes(type) || "hidden" in values || "data-cws-a11y-ignore" in values) continue;
      const named = labelDepth > 0 ||
        (values.id && explicitLabels.has(values.id)) ||
        Boolean(String(values["aria-label"] || "").trim()) ||
        Boolean(String(values["aria-labelledby"] || "").trim()) ||
        Boolean(String(values.title || "").trim());
      if (!named) missing.push(`${path.relative(root, file)}:${lineAt(html, match.index)} ${tag.slice(0, 180)}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("runtimebestanden bevatten geen wildcard-postMessage, eval of publiceerbare back-upreferenties", () => {
  const runtimeFiles = [
    path.join(root, "index.html"),
    ...walk(path.join(root, "js"), new Set([".js", ".mjs"])),
    ...walk(path.join(root, "layers"), new Set([".html", ".js", ".mjs"])),
    ...walk(path.join(root, "functions"), new Set([".js", ".mjs"]))
  ];
  const text = runtimeFiles.map(file => fs.readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(text, /\b(?:eval\s*\(|new\s+Function\s*\()/i);
  assert.doesNotMatch(text, /postMessage\s*\([\s\S]{0,400}?,\s*["']\*["']\s*\)/i);
  assert.doesNotMatch(text, /Access-Control-Allow-Origin["']?\s*[:=]\s*["']\*/i);
});

test("import-, logo- en spreadsheetbeveiliging blijven actief", () => {
  const validation = fs.readFileSync(path.join(root, "functions/api/_validation.js"), "utf8");
  const importExcel = fs.readFileSync(path.join(root, "js/core/import_excel.js"), "utf8");
  const store = fs.readFileSync(path.join(root, "js/core/store.js"), "utf8");
  const exports = fs.readFileSync(path.join(root, "js/core/export.js"), "utf8");
  assert.ok(validation.includes("/^data:image\\/(png|jpeg);base64"));
  assert.match(validation, /MAX_LOGO_DATA_URL_BYTES\s*=\s*1_600_000/);
  assert.match(importExcel, /MAX_(?:ZIP|XLSX)_BYTES|10\s*\*\s*1024\s*\*\s*1024/);
  assert.match(importExcel, /compression|compressieratio|ratio/i);
  assert.match(store, /MAX_IMPORT_FILE_BYTES|8\s*\*\s*1024\s*\*\s*1024/);
  assert.match(exports, /spreadsheet|formula|^[^\n]*[=+@-]/im);
});

test("releasebuild gebruikt een vaste allowlist en dist als enige Pages-output", () => {
  const build = fs.readFileSync(path.join(root, "scripts/build-static.mjs"), "utf8");
  const wrangler = fs.readFileSync(path.join(root, "wrangler.toml"), "utf8");
  assert.match(build, /allowlist\s*=\s*\["index\.html",\s*"_headers",\s*"assets",\s*"css",\s*"js",\s*"layers"\]/);
  assert.match(wrangler, /pages_build_output_dir\s*=\s*"dist"/);
});

test("een lege of kleine geldige D1-state blijft de gedeelde bron", () => {
  const store = fs.readFileSync(path.join(root, "js/core/store.js"), "utf8");
  assert.match(store, /const stateIsValidRemoteDocument\s*=\s*\(candidate\)/);
  assert.match(store, /const remoteStateValid\s*=\s*stateIsValidRemoteDocument\(incoming\)/);
  assert.match(store, /if\(remoteStateValid\)\{/);
  assert.doesNotMatch(store, /if\(stateHasAuthoritativeBusinessData\(incoming,/);
  assert.match(store, /Cloudflare D1 - nieuwe gedeelde planning/);
  assert.match(store, /preserveLocalCandidateBeforeRemoteHydration/);
});

test("uitsluitend de actuele release-tests en scripts blijven in het pakket", () => {
  const testEntries = fs.readdirSync(path.join(root, "tests"), { withFileTypes:true });
  assert.deepEqual(testEntries.map(entry => entry.name).sort(), ["release"]);
  const scripts = fs.readdirSync(path.join(root, "scripts")).sort();
  assert.deepEqual(scripts, [
    "build-static.mjs",
    "clean.mjs",
    "export_to_xlsx.mjs",
    "local-pages-server.mjs",
    "security-static-check.mjs",
    "serve.mjs",
    "syntax-check.mjs",
    "verify-dist.mjs",
    "xlsx-lite.mjs",
    "xlsx_convert.mjs"
  ]);
});
