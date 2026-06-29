import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));
const stateApi = read("functions/api/state.js");
const shared = read("functions/api/_shared.js");

function check(label, ok) {
  if (!ok) throw new Error(`[preflight:v151] ${label}`);
  console.log(`OK - ${label}`);
}

check("package.json bevat preflight:v151", pkg.scripts?.["preflight:v151"] === "node scripts/v151-d1-corrupt-chunk-hard-recovery-preflight.mjs");
check("state API heeft v151 marker", stateApi.includes("v151-d1-corrupt-chunk-hard-recovery"));
check("state API retourneert default state bij onherstelbare corrupte chunks", stateApi.includes("unrecoverableInvalidChunkSet:true") && stateApi.includes("if (resolved.unrecoverable) return DEFAULT_STATE_JSON"));
check("state API geeft geen 500 meer bij ontbrekende oudere chunk-set", !stateApi.includes("geen herstelbare oudere chunk-set gevonden"));
check("state API bewaart meerdere chunkversies", stateApi.includes("RETAIN_CHUNK_VERSIONS = 8") && stateApi.includes("pruneOldChunkVersions"));
check("state API verwijdert niet alle andere chunkversies", !stateApi.includes("version <> ?"));
check("chunk-endpoint wordt overgeslagen bij onherstelbare manifesten", stateApi.includes("!resolved.unrecoverable && chunkIndexFromUrl(url) >= 0"));
check("unrecoverable header wordt gezet en geexposed", stateApi.includes('"X-CWS-Unrecoverable-Invalid-Chunks"') && shared.includes("X-CWS-Unrecoverable-Invalid-Chunks"));

console.log("[preflight:v151] D1 corrupt chunk hard recovery checks OK");
