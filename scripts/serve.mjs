// compatibility marker: local-test-v73; V76 active marker: local-test-v76; V77 active marker: local-test-v77
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const requestedPort = process.argv.find((arg) => arg.startsWith("--port="))?.split("=")[1];
const port = Number(requestedPort || process.env.PORT || 4173);
const version = "local-test-v77";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Ongeldige serverpoort: ${requestedPort || process.env.PORT}`);
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function resolveStaticPath(pathname) {
  const relativePath = pathname.replace(/^\/+/, "") || "index.html";
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Path traversal geblokkeerd");
  }
  return resolved;
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const pathname = decodeURIComponent(requestUrl.pathname);

    if (pathname === "/api/health") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ ok: true, version, mode: "static-local-server" }));
      return;
    }

    const requested = resolveStaticPath(pathname);
    const info = await stat(requested);
    const filePath = info.isDirectory() ? path.join(requested, "index.html") : requested;
    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(body);
  } catch {
    res.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`CWS Planning ${version}: http://127.0.0.1:${port}`);
});
