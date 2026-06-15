import { readFileSync, existsSync } from "node:fs";

const read = file => readFileSync(file, "utf8");
let failed = false;
function check(label, pass, detail="") {
  console.log(`${pass ? "OK" : "FAIL"} - ${label}${detail ? `: ${detail}` : ""}`);
  if(!pass) failed = true;
}

const pkg = JSON.parse(read("package.json"));
const gantt = read("layers/laag4_gantt.html");
const store = read("js/core/store.js");
const headless = existsSync("scripts/headless-v72-smoke.mjs") ? read("scripts/headless-v72-smoke.mjs") : "";
const responsive = existsSync("tests/responsive/v73-responsive-smoke.mjs") ? read("tests/responsive/v73-responsive-smoke.mjs") : "";

check("package bevat preflight:v74", pkg.scripts?.["preflight:v74"] === "node scripts/v74-gantt-drag-resize-freeze-preflight.mjs");
check("V74 marker in store", /v74-gantt-drag-resize-freeze-fix/.test(store));
check("deferred persistence voorkomt pointerup-freeze", /scheduleDeferredPersistence/.test(store) && /deferPersistence/.test(store));
check("Gantt pointermove deep-clonet model niet meer", !/window\.addEventListener\(\"pointermove\"[\s\S]{0,1800}getModel\(drag\.projectId\)/.test(gantt));
check("Gantt pointermove gebruikt requestAnimationFrame", /requestAnimationFrame/.test(gantt) && /UI\.dragFrame/.test(gantt));
check("Gantt preview gebruikt tijdelijk workdays-schema", /dragPreviewGeometry/.test(gantt) && /sc\?\.workdays/.test(gantt));
check("Gantt resize preview prefereert schedule workdays", /scheduleDirect/.test(gantt) && /rowWorkdayDuration/.test(gantt));
check("Gantt save krijgt deferPersistence", /deferPersistence:true/.test(gantt) && /v74DragResizeFreezeFix:true/.test(gantt));
check("Pointer capture veilig vrijgegeven", /releasePointerCapture/.test(gantt) && /pointercancel/.test(gantt) && /blur/.test(gantt));
check("Drag CSS feedback aanwezig", /gantt-dragging/.test(gantt) && /drag-preview/.test(gantt));
check("Headless Chrome gebruikt no-sandbox waar nodig", /--no-sandbox/.test(headless) && /--no-sandbox/.test(responsive));

if(failed) process.exit(1);
console.log("V74 Gantt drag/resize freeze preflight geslaagd.");
