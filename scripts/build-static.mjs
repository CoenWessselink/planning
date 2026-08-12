import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const allowlist = ["index.html", "_headers", "assets", "css", "js", "layers"];

await rm(dist, { recursive:true, force:true });
await mkdir(dist, { recursive:true });

for (const entry of allowlist) {
  const source = path.join(root, entry);
  try {
    const info = await stat(source);
    await cp(source, path.join(dist, entry), { recursive:info.isDirectory(), force:true });
  } catch (error) {
    if (entry === "_headers") throw new Error("_headers ontbreekt; veilige build afgebroken.");
    throw error;
  }
}

console.log(`CWS static build gereed: ${dist}`);
