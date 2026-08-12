import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) failures.push(message); };

function list(directory) {
  const start = path.join(root, directory);
  if (!fs.existsSync(start)) return [];
  return fs.readdirSync(start, { recursive:true, withFileTypes:true })
    .filter(entry => entry.isFile())
    .map(entry => path.join(entry.parentPath || entry.path, entry.name));
}

const runtimeFiles = [path.join(root, "index.html"), ...list("functions"), ...list("js"), ...list("layers")]
  .filter(file => /\.(?:html|js|mjs)$/i.test(file));
const runtimeText = runtimeFiles.map(file => `\n/* ${path.relative(root, file)} */\n${fs.readFileSync(file, "utf8")}`).join("\n");

assert(/pages_build_output_dir\s*=\s*["']dist["']/.test(read("wrangler.toml")), "wrangler.toml moet uitsluitend dist als Pages-output gebruiken.");
assert(!/Access-Control-Allow-Origin["']?\s*[:=]\s*["']\*/i.test(runtimeText), "Wildcard-CORS is niet toegestaan.");
assert(!/\b(?:eval\s*\(|new\s+Function\s*\()/i.test(runtimeText), "eval/new Function is niet toegestaan.");
assert(!/postMessage\s*\([\s\S]{0,400}?,\s*["']\*["']\s*\)/i.test(runtimeText), "postMessage met targetOrigin * is niet toegestaan.");
assert(!/company\?*\.logo\?*\.dataUrl\s*\|\|/i.test(runtimeText), "Ruwe company.logo.dataUrl mag niet rechtstreeks worden gerenderd.");
assert(!/\b(?:CREATE|ALTER|DROP)\s+TABLE\b/i.test(list("functions").map(file => fs.readFileSync(file,"utf8")).join("\n")), "Pages Functions mogen geen runtime-DDL uitvoeren.");

const headers = read("_headers");
for (const required of ["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security"]) {
  assert(headers.includes(required), `_headers mist ${required}.`);
}
assert(!headers.includes("unsafe-eval"), "CSP mag unsafe-eval niet toestaan.");

const stateApi = read("functions/api/state.js");
const storage = read("functions/api/_state_storage.js");
assert(stateApi.includes("STATE_VERSION_CONFLICT") && stateApi.includes("baseVersion"), "State-API mist expliciete conflictbehandeling.");
assert(storage.includes("db.batch(statements)"), "State-opslag moet één atomische D1-batch gebruiken.");
assert(storage.includes("stateVersionPredicate"), "State-opslag mist conditionele compare-and-swap.");
assert(!storage.includes("INSERT OR REPLACE INTO app_state_chunks"), "Statechunks moeten immutable worden geschreven.");

const auth = read("functions/api/_auth.js");
assert(auth.includes("Cf-Access-Jwt-Assertion") && auth.includes("crypto.subtle.verify"), "Cloudflare Access JWT-validatie ontbreekt.");
assert(read("functions/api/d1-cleanup.js").includes("export async function onRequestPost") && !read("functions/api/d1-cleanup.js").includes("onRequestGet"), "D1-cleanup moet POST-only zijn.");

const packageJson = JSON.parse(read("package.json"));
assert(/playwright\s+test/.test(packageJson.scripts?.["test:e2e"] || ""), "test:e2e moet daadwerkelijk Playwright uitvoeren.");
assert(Boolean(packageJson.devDependencies?.["@playwright/test"]), "@playwright/test moet gepind zijn.");
assert(Object.values(packageJson.scripts || {}).filter(Boolean).every(command => !/\bwrangler\b/.test(command) || /wrangler@4\.120\.0/.test(command)), "Elk Wrangler-commando moet exact op 4.120.0 zijn gepind.");

const forbiddenRoot = fs.readdirSync(root).filter(name => /(?:backup|oplevering|audit).*\.(?:sql|md|zip|log)$/i.test(name) || /\.sql$/i.test(name));
assert(forbiddenRoot.length === 0, `Vertrouwelijke/historische rootbestanden aangetroffen: ${forbiddenRoot.join(", ")}`);

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log(`Securitycontrole geslaagd voor ${runtimeFiles.length} runtimebestanden.`);
