import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

const root = process.cwd();
const failures = [];
const skippedDirectories = new Set([".git", "node_modules", "dist", ".wrangler", "playwright-report", "playwright-artifacts", "test-results", "artifacts"]);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes:true }).flatMap(entry => {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) return [];
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

for (const file of walk(root)) {
  const rel = path.relative(root, file);
  if (/\.(?:c?js|mjs)$/i.test(file)) {
    const checked = spawnSync(process.execPath, ["--check", file], { encoding:"utf8" });
    if (checked.status !== 0) failures.push(`${rel}: ${(checked.stderr || checked.stdout).trim()}`);
  }
  if (file.endsWith(".html")) {
    const html = fs.readFileSync(file, "utf8");
    const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type=["']application\/(?:json|ld\+json)["'])[^>]*>([\s\S]*?)<\/script>/gi)];
    scripts.forEach((match, index) => {
      try { new vm.Script(match[1], { filename:`${rel}#inline-${index + 1}` }); }
      catch (error) { failures.push(`${rel}#inline-${index + 1}: ${error.message}`); }
    });
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Syntaxcontrole geslaagd voor JavaScript, modules en inline HTML-scripts.");
