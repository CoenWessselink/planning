import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = async (path) => readFile(new URL(path, root), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(`[V85 preflight] ${message}`);
};

const stateApi = await read("functions/api/state.js");
const store = await read("js/core/store.js");
const health = await read("functions/api/health.js");
const server = await read("playwright/server.js");
const pkg = JSON.parse(await read("package.json"));

assert(pkg.scripts?.["preflight:v85"] === "node scripts/v85-d1-chunked-state-streaming-load-preflight.mjs", "package.json mist preflight:v85.");
assert(health.includes("internal-test-v85"), "health.js mist internal-test-v85.");
assert(server.includes("local-test-v85"), "playwright/server.js mist local-test-v85.");
assert(stateApi.includes("v118-latest-valid-chunk-recovery") || stateApi.includes("v85-d1-chunked-state-streaming-load-fix"), "state.js mist chunked state marker.");
assert(stateApi.includes("wantsChunkManifestResponse"), "state.js mist chunk manifest response helper.");
assert(stateApi.includes("readStateChunkResponse"), "state.js mist losse chunk response helper.");
assert(stateApi.includes("writeCheckpoint") && stateApi.includes("splitStateIntoChunks") && stateApi.includes("buildChunkManifest"), "state.js mist inline-to-chunks savepad.");
assert(stateApi.includes("X-CWS-Chunked-Manifest"), "state.js mist chunk manifest header.");
assert(stateApi.includes("chunkIndex"), "state.js mist chunkIndex endpoint.");
assert(store.includes("v85-d1-chunked-state-streaming-load-fix"), "store.js mist V85 marker.");
assert(store.includes("loadChunkedRemoteStateBody"), "store.js mist chunked load reassembly.");
assert(store.includes("chunks=auto"), "store.js vraagt niet om chunk-manifest bij state load.");
assert(store.includes("X-CWS-Chunked-Manifest"), "store.js detecteert chunk-manifest header niet.");
assert(store.includes("chunkIndex="), "store.js haalt chunks niet afzonderlijk op.");
assert(!stateApi.includes("return rawStateResponse(fullStateJson || \"\", 200") || stateApi.indexOf("wantsChunkManifestResponse") < stateApi.indexOf("return rawStateResponse(fullStateJson || \"\", 200"), "raw full-state response staat vóór manifest-route.");

console.log("[V85 preflight] D1 chunked state streaming load fix OK");
