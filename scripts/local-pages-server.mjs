import { createServer } from "node:http";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { applySecurityHeaders, SECURITY_HEADERS } from "../functions/api/_shared.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(process.argv.slice(2).map(value => {
  const [key, ...rest] = value.replace(/^--/, "").split("=");
  return [key, rest.length ? rest.join("=") : true];
}));
const port = Number(args.get("port") || process.env.PORT || 8788);
const host = String(args.get("host") || "127.0.0.1");
const profile = String(args.get("profile") || "dev").replace(/[^a-zA-Z0-9_.-]/g, "_");
const dist = path.join(root, "dist");
const dataDir = path.join(root, ".local-d1");
const dbPath = path.join(dataDir, `${profile}.sqlite`);
const shouldReset = args.has("reset");
const shouldBuild = args.has("build");

if (shouldBuild) {
  for (const script of ["scripts/build-static.mjs", "scripts/verify-dist.mjs"]) {
    const result = spawnSync(process.execPath, [script], { cwd:root, stdio:"inherit" });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
if (!existsSync(dist)) throw new Error("dist ontbreekt. Voer eerst npm run build uit of gebruik --build.");
mkdirSync(dataDir, { recursive:true });
if (shouldReset) await rm(dbPath, { force:true });

const sqlite = new DatabaseSync(dbPath, { timeout:5_000 });
sqlite.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
sqlite.exec("CREATE TABLE IF NOT EXISTS _cws_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
for (const file of (await readdir(path.join(root, "migrations"))).filter(name => name.endsWith(".sql")).sort()) {
  const applied = sqlite.prepare("SELECT 1 AS ok FROM _cws_migrations WHERE name=?").get(file);
  if (applied) continue;
  const sql = await readFile(path.join(root, "migrations", file), "utf8");
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    sqlite.exec(sql);
    sqlite.prepare("INSERT INTO _cws_migrations (name) VALUES (?)").run(file);
    sqlite.exec("COMMIT");
  } catch (error) {
    try { sqlite.exec("ROLLBACK"); } catch (_) {}
    throw new Error(`Migratie ${file} mislukt: ${error.message}`, { cause:error });
  }
}

function normalizeBinding(value) {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "bigint") return Number(value);
  return value;
}

class LocalD1Statement {
  constructor(owner, sqlText, bindings = []) {
    this.owner = owner;
    this.sqlText = String(sqlText);
    this.bindings = bindings.map(normalizeBinding);
  }
  bind(...values) { return new LocalD1Statement(this.owner, this.sqlText, values); }
  first(column = null) {
    const row = this.owner.sqlite.prepare(this.sqlText).get(...this.bindings) || null;
    return Promise.resolve(column ? (row?.[column] ?? null) : row);
  }
  all() {
    const results = this.owner.sqlite.prepare(this.sqlText).all(...this.bindings);
    return Promise.resolve({ success:true, results, meta:{ changes:0, rows_read:results.length, rows_written:0 } });
  }
  run() {
    const result = this.owner.sqlite.prepare(this.sqlText).run(...this.bindings);
    const changes = Number(result.changes || 0);
    return Promise.resolve({
      success:true,
      meta:{ changes, rows_read:0, rows_written:changes, last_row_id:Number(result.lastInsertRowid || 0) },
      changes
    });
  }
}

class LocalD1Database {
  constructor(sqliteDb) { this.sqlite = sqliteDb; }
  prepare(sqlText) { return new LocalD1Statement(this, sqlText); }
  async batch(statements) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) {
        if (!(statement instanceof LocalD1Statement) || statement.owner !== this) throw new TypeError("Ongeldige lokale D1 statement.");
        const sqlText = statement.sqlText.trim();
        if (/^(?:SELECT|PRAGMA|WITH\s+.+?SELECT)\b/is.test(sqlText)) {
          const rows = this.sqlite.prepare(sqlText).all(...statement.bindings);
          results.push({ success:true, results:rows, meta:{ changes:0, rows_read:rows.length, rows_written:0 } });
        } else {
          const result = this.sqlite.prepare(sqlText).run(...statement.bindings);
          const changes = Number(result.changes || 0);
          results.push({ success:true, meta:{ changes, rows_read:0, rows_written:changes, last_row_id:Number(result.lastInsertRowid || 0) }, changes });
        }
      }
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      try { this.sqlite.exec("ROLLBACK"); } catch (_) {}
      throw error;
    }
  }
}

const DB = new LocalD1Database(sqlite);
const env = {
  DB,
  CWS_LOCAL_AUTH_BYPASS:"true",
  CWS_BOOTSTRAP_ADMIN_EMAIL:"local-admin@cws.test",
  CWS_MAINTENANCE_TOKEN:"local-maintenance-token",
  ...(process.env.CWS_BOOTSTRAP_ADMIN_EMAIL ? { CWS_BOOTSTRAP_ADMIN_EMAIL:process.env.CWS_BOOTSTRAP_ADMIN_EMAIL } : {}),
  ...(process.env.CWS_MAINTENANCE_TOKEN ? { CWS_MAINTENANCE_TOKEN:process.env.CWS_MAINTENANCE_TOKEN } : {})
};

const apiModules = new Map([
  ["/api/audit", "functions/api/audit.js"],
  ["/api/d1-cleanup", "functions/api/d1-cleanup.js"],
  ["/api/gantt-save", "functions/api/gantt-save.js"],
  ["/api/health", "functions/api/health.js"],
  ["/api/identity", "functions/api/identity.js"],
  ["/api/revision-delete", "functions/api/revision-delete.js"],
  ["/api/revision-save", "functions/api/revision-save.js"],
  ["/api/revisions", "functions/api/revisions.js"],
  ["/api/state-reset", "functions/api/state-reset.js"],
  ["/api/state", "functions/api/state.js"],
  ["/api/users", "functions/api/users.js"]
]);
const moduleCache = new Map();

async function loadApiModule(relative) {
  if (!moduleCache.has(relative)) moduleCache.set(relative, import(pathToFileURL(path.join(root, relative)).href));
  return moduleCache.get(relative);
}

function headersFromNode(request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach(item => headers.append(name, item));
    else if (value != null) headers.set(name, String(value));
  }
  return headers;
}

async function bodyFromNode(request) {
  if (["GET", "HEAD"].includes(String(request.method || "GET").toUpperCase())) return undefined;
  const parts = [];
  let bytes = 0;
  for await (const part of request) {
    bytes += part.length;
    if (bytes > 6_000_000) throw Object.assign(new Error("Request is te groot."), { status:413 });
    parts.push(part);
  }
  return parts.length ? Buffer.concat(parts) : undefined;
}

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"], [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"], [".ico", "image/x-icon"], [".woff", "font/woff"], [".woff2", "font/woff2"],
  [".pdf", "application/pdf"], [".csv", "text/csv; charset=utf-8"]
]);

function setNodeHeaders(response, webResponse) {
  for (const [name, value] of webResponse.headers) response.setHeader(name, value);
}

async function handleApi(nodeRequest, nodeResponse, url, relative) {
  try {
    const body = await bodyFromNode(nodeRequest);
    const init = { method:nodeRequest.method, headers:headersFromNode(nodeRequest) };
    if (body !== undefined) init.body = body;
    const request = new Request(url, init);
    const module = await loadApiModule(relative);
    const method = String(nodeRequest.method || "GET").toUpperCase();
    const methodName = `onRequest${method === "HEAD" ? "Get" : method.charAt(0) + method.slice(1).toLowerCase()}`;
    const handler = module[methodName] || module.onRequest;
    if (typeof handler !== "function") {
      nodeResponse.writeHead(405, { Allow:"GET,OPTIONS", ...SECURITY_HEADERS });
      nodeResponse.end();
      return;
    }
    const context = { request, env, params:{}, data:{}, waitUntil() {}, passThroughOnException() {} };
    let result = await handler(context);
    if (!(result instanceof Response)) result = Response.json(result ?? null);
    result = applySecurityHeaders(result);
    nodeResponse.statusCode = result.status;
    nodeResponse.statusMessage = result.statusText || nodeResponse.statusMessage;
    setNodeHeaders(nodeResponse, result);
    if (method === "HEAD" || result.status === 204 || result.status === 304) nodeResponse.end();
    else nodeResponse.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    nodeResponse.writeHead(Number(error?.status || 500), { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", ...SECURITY_HEADERS });
    nodeResponse.end(JSON.stringify({ ok:false, error:error?.message || String(error), code:error?.code || "LOCAL_SERVER_ERROR" }));
  }
}

async function handleStatic(nodeRequest, nodeResponse, url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch (_) { nodeResponse.writeHead(400, SECURITY_HEADERS); nodeResponse.end("Bad request"); return; }
  if (pathname === "/") pathname = "/index.html";
  const relative = pathname.replace(/^\/+/, "");
  const absolute = path.resolve(dist, relative);
  if (absolute !== dist && !absolute.startsWith(`${dist}${path.sep}`)) {
    nodeResponse.writeHead(403, SECURITY_HEADERS); nodeResponse.end("Forbidden"); return;
  }
  try {
    const info = await stat(absolute);
    if (!info.isFile()) throw new Error("not-file");
    const data = await readFile(absolute);
    const extension = path.extname(absolute).toLowerCase();
    nodeResponse.writeHead(200, {
      "Content-Type":contentTypes.get(extension) || "application/octet-stream",
      "Content-Length":String(data.length),
      "Cache-Control":extension === ".html" ? "no-store" : "public, max-age=300",
      ...SECURITY_HEADERS
    });
    nodeResponse.end(nodeRequest.method === "HEAD" ? undefined : data);
  } catch (_) {
    nodeResponse.writeHead(404, { "Content-Type":"text/plain; charset=utf-8", ...SECURITY_HEADERS });
    nodeResponse.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
  const relative = apiModules.get(url.pathname);
  if (relative) await handleApi(request, response, url, relative);
  else if (url.pathname.startsWith("/api/")) {
    response.writeHead(404, { "Content-Type":"application/json; charset=utf-8", ...SECURITY_HEADERS });
    response.end(JSON.stringify({ ok:false, error:"API-route niet gevonden." }));
  } else await handleStatic(request, response, url);
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, host, resolve);
});
console.log(`CWS_LOCAL_READY http://${host}:${port} profile=${profile} db=${dbPath}`);

function shutdown() {
  server.close(() => {
    try { sqlite.close(); } catch (_) {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 3_000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
