import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));
const stateApi = read("functions/api/state.js");
const middleware = read("functions/_middleware.js");

function check(label, ok) {
  if (!ok) throw new Error(`[preflight:v147] ${label}`);
  console.log(`OK - ${label}`);
}

check("package.json bevat preflight:v147", pkg.scripts?.["preflight:v147"] === "node scripts/v147-d1-invalid-chunk-recovery-preflight.mjs");
check("state API valideert chunk-manifest chunks", stateApi.includes("recoverChunkManifestIfNeeded") && stateApi.includes("readChunksAsJson(db, currentVersion, expectedCount)"));
check("state API herstelt naar laatste geldige chunkversie", stateApi.includes("findLatestRecoverableChunkVersion(db, currentVersion)") && stateApi.includes("recoveredFromInvalidChunkSet"));
check("state API meldt invalid-chunk herstel in headers", stateApi.includes('"X-CWS-Recovered-Invalid-Chunks"'));
check("root middleware laat /api/state door naar canonical route", middleware.includes("context.next()") && middleware.includes("canonical D1-state route staat in functions/api/state.js") && !middleware.includes("app_state_chunks"));

console.log("[preflight:v147] invalid D1 chunk recovery checks OK");
