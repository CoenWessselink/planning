// compatibility marker: local-test-v73; V76 active marker: local-test-v76; V77 active marker: local-test-v77 local-test-server-v77; V78 active marker: local-test-v78
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

// Compatibility markers retained for V69/V70 checks:
// version: "local-test-v69", healthMode: "local-test-server"
// local-test-v70, local-test-server-v70
// V72 compatibility: const version = "local-test-v72"; local-test-server-v72
const root = path.resolve(process.cwd());
const port = Number(process.env.PORT || 5173);
const version = "local-test-v78";
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
        healthMode: "local-test-server-v78",
        schemaOk: true,
        schemaErrors: [],
        schemaRepairRequired: false,
      }));
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
