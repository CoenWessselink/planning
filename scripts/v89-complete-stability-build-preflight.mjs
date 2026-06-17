import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));
const e2e = read("tests/e2e/complete-stability.mjs");
const store = read("js/core/store.js");
const index = read("index.html");
const gantt = read("layers/laag4_gantt.html");
const capacity = read("layers/laag5_capaciteit.html");

function check(label, ok) {
  if (!ok) throw new Error(`[preflight:v89] ${label}`);
  console.log(`OK - ${label}`);
}

check("package bevat preflight:v89", pkg.scripts?.["preflight:v89"] === "node scripts/v89-complete-stability-build-preflight.mjs");
check("test:e2e draait complete stability Chrome test", String(pkg.scripts?.["test:e2e"] || "").includes("tests/e2e/complete-stability.mjs"));
check("complete stability test gebruikt echte CDP muis-events", e2e.includes("Input.dispatchMouseEvent") && e2e.includes("dragFrameTarget") && e2e.includes("doubleClickFrameTarget"));
check("complete stability test dekt snelle Gantt drag/resize", e2e.includes("10 snelle Gantt drag/resize-acties") && e2e.includes('firstTaskTarget("right")') && e2e.includes('firstTaskTarget("left")'));
check("complete stability test dekt refresh behoud", e2e.includes("Refresh behoudt Gantt wijziging") && e2e.includes("index.html`"));
check("complete stability test dekt capaciteit WHY/details", e2e.includes("Capaciteit leest Gantt sources") && e2e.includes("WHY"));
check("complete stability test dekt verplichte viewports", ["390, 844", "844, 390", "360, 740", "768, 1024", "1024, 768", "1180, 820", "1440, 900"].every(item => e2e.includes(item)));
check("complete stability test dekt auditlog X en Escape", e2e.includes("Auditlog modal sluit via X") && e2e.includes("Auditlog modal sluit via Escape"));
check("D1 conflictflow heeft expliciete acties", store.includes("conflictActionRequired") && store.includes("retryRemoteSave") && store.includes("loadServerVersion") && index.includes("Serverversie laden") && index.includes("Mijn wijziging opnieuw proberen"));
check("Gantt pointer lifecycle bewaart V74/V75 fixes", gantt.includes("finishPointerMutation") && gantt.includes("setPointerCapture") && gantt.includes("releasePointerCapture") && gantt.includes("deferPersistence:true"));
check("Gantt geeft capaciteit/save feedback na pointer commit", gantt.includes("Capaciteit opnieuw berekend") && gantt.includes("Uren opnieuw verdeeld over werkbare dagen"));
check("Capaciteit blijft uit Gantt sourcesByDay lezen", capacity.includes("state().gantt?.sourcesByDay") && capacity.includes("plannedFor") && capacity.includes("showWhy"));

console.log("[preflight:v89] complete stability build checks OK");
