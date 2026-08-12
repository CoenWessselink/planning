import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const forbiddenExtensions = new Set([".sql", ".sqlite", ".db", ".zip", ".md", ".log", ".env", ".toml", ".json"]);
const forbiddenNames = /(^|\/)(node_modules|functions|migrations|scripts|tests|test-results|artifacts|docs|\.git)(\/|$)|backup|oplevering|(?:audit|file)[_-]?manifest/i;
const files = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes:true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute);
    else files.push(path.relative(dist, absolute).split(path.sep).join("/"));
  }
}

await walk(dist);
const violations = files.filter(file => forbiddenExtensions.has(path.extname(file).toLowerCase()) || forbiddenNames.test(file));
if (violations.length) throw new Error(`Verboden bestanden in dist:\n${violations.join("\n")}`);

const required = ["index.html", "_headers", "assets", "css", "js", "layers"];
for (const entry of required) {
  try { await stat(path.join(dist, entry)); }
  catch (_) { throw new Error(`Vereist builditem ontbreekt: ${entry}`); }
}

const htmlFiles = files.filter(file => file.endsWith(".html"));
const missing = [];
for (const htmlFile of htmlFiles) {
  const html = await readFile(path.join(dist, htmlFile), "utf8");
  const baseDir = path.dirname(htmlFile);
  const refs = [...html.matchAll(/(?:src|href)=["']([^"'#?]+)(?:[?#][^"']*)?["']/gi)].map(match => match[1]);
  for (const ref of refs) {
    // Dynamisch samengestelde attributen in inline templates zijn geen statische bestandsverwijzingen.
    if (ref.includes("${") || ref.includes("{{") || ref.includes("<%")) continue;
    if (/^(?:https?:|data:|blob:|mailto:|tel:|javascript:|#)/i.test(ref)) continue;
    const relative = ref.startsWith("/") ? ref.slice(1) : path.normalize(path.join(baseDir, ref)).split(path.sep).join("/");
    if (relative.startsWith("../")) {
      missing.push(`${htmlFile} -> ${ref} (buiten dist)`);
      continue;
    }
    try { await stat(path.join(dist, relative)); }
    catch (_) { missing.push(`${htmlFile} -> ${ref}`); }
  }
}
if (missing.length) throw new Error(`Ontbrekende lokale HTML-referenties:\n${missing.slice(0, 100).join("\n")}`);

console.log(`Dist-verificatie geslaagd: ${files.length} bestanden; geen back-ups, bronbestanden of interne rapporten.`);
