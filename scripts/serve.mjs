// compatibility marker: local-test-v73; V76 active marker: local-test-v76; V77 active marker: local-test-v77; V78 active marker: local-test-v78
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const requestedPort = process.argv.find((arg) => arg.startsWith("--port="))?.split("=")[1];
const port = Number(requestedPort || process.env.PORT || 4173);
const version = "local-test-v78";

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

function createRemoteMockState() {
  const projects = { order:[], byId:{}, deptHours:[] };
  const ganttV2 = { expanded:{}, byProject:{}, ui:{ showCritical:false, showDeps:true, viewMode:"both", zoom:"week" } };
  for (let i = 1; i <= 76; i += 1) {
    const id = `REMOTE-${String(i).padStart(3, "0")}`;
    projects.order.push(id);
    projects.byId[id] = { id, nr:`R-${String(i).padStart(3, "0")}`, name:`Remote D1 project ${i}`, status:"Ingepland", start:"2026-06-15" };
    ganttV2.byProject[id] = {
      rows:[{ id:`${id}-T1`, name:"Remote taak", type:"task", level:1, department:"Engineering", hoursMode:"auto", hours:0 }],
      sched:{ [`${id}-T1`]:{ start:"2026-06-15", end:"2026-06-19", workdays:5 } }
    };
  }
  return {
    schemaVersion:12,
    meta:{ dirty:false, updatedAt:null, lastAction:null, fixture:"v78-remote-d1-mock" },
    ui:{ role:"Admin", lastApp:"projecten", lastTab:"Alle", week:{ year:2026, week:25 }, planView:"week", scroll:{} },
    user:{ name:"Remote test", role:"admin", dept:"" },
    projects,
    resources:{ order:[], byId:{} },
    departments:{ order:[], byId:{} },
    tasks:{ byProject:{} },
    allocations:{ byWeek:{} },
    planbord:{ byDeptWeek:{} },
    settings:{ tables:{}, datasets:{} },
    gantt:{ hoursByDay:{}, sourcesByDay:{} },
    ganttV2
  };
}

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

    if (pathname === "/api/identity") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ ok:true, present:true, email:"local-dev@cws.test", source:"local-test", version }));
      return;
    }

    if (pathname === "/api/state") {
      const bootTest = requestUrl.searchParams.get("bootTest");
      if (bootTest === "remote-d1") {
        await new Promise(resolve => setTimeout(resolve, 450));
        const body = JSON.stringify(createRemoteMockState());
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-CWS-OK": "true",
          "X-CWS-State-Exists": "1",
          "X-CWS-Version": "78",
          "X-CWS-User-Email": "remote-test@cws.test",
          "X-CWS-User-Role": "admin",
          "X-CWS-User-Display-Name": "Remote test",
          "X-CWS-Bytes": String(Buffer.byteLength(body))
        });
        res.end(body);
        return;
      }
      if (bootTest === "fallback") {
        res.writeHead(503, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ ok:false, error:"V78 geforceerde state-fout." }));
        return;
      }
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
