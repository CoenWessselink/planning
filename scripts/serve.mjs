import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

function arg(name, fallback="") {
  const value = process.argv.find(item => item.startsWith(`--${name}=`));
  return value ? value.slice(name.length + 3) : fallback;
}

const root = path.resolve(process.cwd(), arg("root", "dist"));
const port = Number(arg("port", process.env.PORT || "5173"));
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Ongeldige serverpoort.");

const types = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"], [".webp", "image/webp"], [".ico", "image/x-icon"],
  [".woff", "font/woff"], [".woff2", "font/woff2"]
]);

const securityHeaders = {
  "Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff",
  "X-Frame-Options":"SAMEORIGIN",
  "Referrer-Policy":"strict-origin-when-cross-origin",
  "Permissions-Policy":"camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy":"same-origin",
  "Cross-Origin-Resource-Policy":"same-origin",
  "Content-Security-Policy":"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; worker-src 'self' blob:; manifest-src 'self'"
};

function resolvePath(urlPath) {
  const decoded = decodeURIComponent(urlPath).replace(/\\/g, "/");
  if (decoded.includes("\0")) throw new Error("invalid path");
  const relative = decoded.replace(/^\/+/, "") || "index.html";
  const absolute = path.resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) throw new Error("path traversal");
  return absolute;
}

const server = http.createServer(async (request, response) => {
  try {
    if (!request.url || !["GET", "HEAD"].includes(request.method || "GET")) {
      response.writeHead(405, { ...securityHeaders, Allow:"GET,HEAD", "Content-Type":"text/plain; charset=utf-8" });
      response.end("Method not allowed");
      return;
    }
    const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
    let file = resolvePath(url.pathname);
    const info = await stat(file);
    if (info.isDirectory()) file = path.join(file, "index.html");
    const body = await readFile(file);
    response.writeHead(200, { ...securityHeaders, "Content-Type":types.get(path.extname(file).toLowerCase()) || "application/octet-stream" });
    if (request.method === "HEAD") response.end(); else response.end(body);
  } catch (_) {
    response.writeHead(404, { ...securityHeaders, "Content-Type":"text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => console.log(`CWS static release build: http://127.0.0.1:${port} (${root})`));
