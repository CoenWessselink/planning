import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const preflights = Object.entries(packageJson.scripts || {})
  .filter(([name]) => /^preflight:v\d+$/.test(name))
  .sort(([left], [right]) => Number(left.slice(11)) - Number(right.slice(11)));

if (!preflights.length) {
  throw new Error("Geen preflight-scripts gevonden.");
}

for (const [name, command] of preflights) {
  const scriptPath = command.match(/^node\s+(.+\.mjs)$/)?.[1];
  if (!scriptPath) {
    throw new Error(`${name} gebruikt geen ondersteund Node-script: ${command}`);
  }

  console.log(`\n[preflight:all] ${name}`);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log(`\n[preflight:all] ${preflights.length} controles geslaagd.`);
