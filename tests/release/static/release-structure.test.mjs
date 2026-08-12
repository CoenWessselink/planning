import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("../../../", import.meta.url).pathname);
const read = relative => readFileSync(path.join(root, relative), "utf8");

function walk(directory, { skip = new Set() } = {}) {
  const absolute = path.join(root, directory);
  if (!statSync(absolute, { throwIfNoEntry: false })) return [];
  const files = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (entry.isDirectory() && skip.has(entry.name)) continue;
    const rel = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(rel, { skip }));
    else files.push(rel.split(path.sep).join("/"));
  }
  return files;
}

test("Pages publiceert uitsluitend de allowlisted dist-map", () => {
  assert.match(read("wrangler.toml"), /pages_build_output_dir\s*=\s*"dist"/);
  const distFiles = walk("dist");
  assert.ok(distFiles.includes("dist/index.html"));
  assert.ok(distFiles.includes("dist/_headers"));
  const forbidden = distFiles.filter(file => /(?:^|\/)(?:functions|migrations|scripts|tests|docs|artifacts)(?:\/|$)|\.(?:sql|sqlite|db|zip|md|log|toml|env|json)$/i.test(file));
  assert.deepEqual(forbidden, []);
});

test("bronpakket bevat geen databaseback-up of historische opleverballast", () => {
  const files = walk(".", { skip: new Set([".git", "dist", "node_modules", ".local-d1", ".wrangler"]) });
  const backups = files.filter(file => /(?:backup|oplevering).*\.(?:sql|md|zip|log)$/i.test(file));
  assert.deepEqual(backups, []);
  const sqlOutsideMigrations = files.filter(file => file.endsWith(".sql") && !file.startsWith("migrations/"));
  assert.deepEqual(sqlOutsideMigrations, []);
});

test("runtime bevat CAS, transactionele batch, JWT-validatie en veilige origins", () => {
  const functions = walk("functions").map(read).join("\n");
  const browser = [...walk("js"), ...walk("layers").filter(file => file.endsWith(".html")), "index.html"].map(read).join("\n");
  const storage = read("functions/api/_state_storage.js");
  const auth = read("functions/api/_auth.js");

  assert.doesNotMatch(functions, /Access-Control-Allow-Origin["']?\s*[:=]\s*["']\*/i);
  assert.doesNotMatch(functions, /\b(?:CREATE|ALTER|DROP)\s+TABLE\b/i);
  assert.doesNotMatch(browser, /postMessage\s*\([\s\S]{0,300}?,\s*["']\*["']\s*\)/i);
  assert.match(storage, /db\.batch\(statements\)/);
  assert.match(storage, /baseVersion/);
  assert.match(storage, /STATE_VERSION_CONFLICT|CWS_VERSION_CONFLICT/);
  assert.match(auth, /Cf-Access-Jwt-Assertion/);
  assert.match(auth, /crypto\.subtle\.verify/);
  assert.doesNotMatch(browser, /fetch\s*\(\s*["']\/api\/gantt-save["']/);
});

test("securityheaders en importlimieten zijn aanwezig", () => {
  const headers = read("_headers");
  for (const name of ["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security"]) {
    assert.ok(headers.includes(name), `${name} ontbreekt`);
  }
  assert.doesNotMatch(headers, /unsafe-eval/);

  assert.match(read("js/core/import_excel.js"), /MAX_XLSX_IMPORT_BYTES/);
  assert.match(read("js/core/import_excel.js"), /MAX_ZIP_ENTRIES/);
  assert.match(read("js/core/store.js"), /MAX_STATE_IMPORT_BYTES/);
  assert.match(read("layers/laag11_io.html"), /MAX_CSV_IMPORT_BYTES/);
  assert.match(read("js/core/ui.js"), /neutralizeSpreadsheetFormula/);
});

test("statische formuliercontrols hebben een toegankelijke naam", () => {
  const htmlFiles = ["index.html", ...walk("layers").filter(file => file.endsWith(".html"))];
  const missing = [];
  for (const file of htmlFiles) {
    // Dynamische controls worden via de browsertest beoordeeld; hier controleren we de werkelijk statische DOM.
    const html = read(file).replace(/<script\b[\s\S]*?<\/script>/gi, "");
    for (const match of html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
      const tag = match[0];
      const type = (/\btype=["']?([^\s"'>]+)/i.exec(tag)?.[1] || "").toLowerCase();
      if (["hidden", "submit", "button", "reset", "image"].includes(type)) continue;
      if (/\b(?:aria-label|aria-labelledby|title)\s*=/i.test(tag)) continue;
      const id = /\bid=["']([^"']+)["']/i.exec(tag)?.[1];
      const escaped = id?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (escaped && new RegExp(`<label\\b[^>]*\\bfor=["']${escaped}["']`, "i").test(html)) continue;
      const before = html.slice(Math.max(0, match.index - 500), match.index);
      if (/<label\b[^>]*>(?:(?!<\/label>).)*$/is.test(before)) continue;
      missing.push(`${file}: ${tag.slice(0, 180)}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("test- en deploymentcommando's zijn exact gepind", () => {
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(pkg.devDependencies["@playwright/test"], "1.62.1");
  assert.equal(lock.packages["node_modules/@playwright/test"].version, "1.62.1");
  assert.match(pkg.scripts["test:e2e"], /playwright test/);
  assert.match(pkg.scripts.deploy, /wrangler@4\.120\.0/);
});
