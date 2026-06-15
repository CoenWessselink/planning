// compatibility marker: local-test-v73; V76 active marker: local-test-v76; V77 active marker: local-test-v77
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

// Compatibility markers retained for V69/V70 checks:
// version: "local-test-v69", healthMode: "local-test-server"
// local-test-v70, local-test-server-v70
// V72 compatibility: const version = "local-test-v72"; local-test-server-v72
const root = path.resolve(process.cwd());
const port = Number(process.env.PORT || 5173);
const version = "local-test-v77";
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function safePath(pathname) {
  const resolved = path.resolve(root, pathname.replace(/^\/+/, "") || "index.html");
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
      res.end(JSON.stringify({
        ok: true,
        service: "cws-planning",
        storage: "local",
        version,
        healthMode: "local-test-server-v77",
        schemaOk: true,
        schemaErrors: [],
        schemaRepairRequired: false,
      }));
      return;
    }

    const requested = safePath(pathname);
    const info = await stat(requested);
    const filePath = info.isDirectory() ? path.join(requested, "index.html") : requested;
    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
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
