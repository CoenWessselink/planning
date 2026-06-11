import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

const root = process.cwd();
const failures = [];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "playwright", "test-results"].includes(entry.name)) return [];
      return walk(full);
    }
    return [full];
  });
}

for (const file of walk(root)) {
  const rel = path.relative(root, file);
  if (file.endsWith(".js")) {
    const checked = spawnSync(process.execPath, ["--check", file], { encoding:"utf8" });
    if(checked.status !== 0) failures.push(`${rel}: ${(checked.stderr || checked.stdout).trim()}`);
  }
  if (file.endsWith(".html")) {
    const html = fs.readFileSync(file, "utf8");
    const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
    scripts.forEach((match, index) => {
      try { new vm.Script(match[1], { filename: `${rel}#inline-${index + 1}` }); }
      catch (error) { failures.push(`${rel}#inline-${index + 1}: ${error.message}`); }
    });
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Syntaxcontrole geslaagd.");
}
