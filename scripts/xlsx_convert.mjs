import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { readXlsx } from "./xlsx-lite.mjs";

const args = process.argv.slice(2).filter(value => value !== "--");
const file = args[0];
if (!file || !/\.xlsx$/i.test(file)) {
  console.error("Gebruik: npm run xlsx:to-csv -- pad/naar/bestand.xlsx");
  process.exit(1);
}
const sheets = readXlsx(await readFile(file));
const outDir = path.join(process.cwd(), "out");
await mkdir(outDir, { recursive:true });
const targets = new Map([["projects", "projects.csv"], ["resources", "resources.csv"], ["allocations", "allocations.csv"]]);
let written = 0;
const csvCell = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
for (const sheet of sheets) {
  const output = targets.get(sheet.name.toLowerCase());
  if (!output) continue;
  const csv = `${sheet.rows.map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
  await writeFile(path.join(outDir, output), csv, "utf8");
  console.log(`CSV geschreven: ${output}`);
  written += 1;
}
if (!written) {
  console.error(`Geen werkblad Projects, Resources of Allocations gevonden. Beschikbaar: ${sheets.map(sheet => sheet.name).join(", ")}`);
  process.exit(2);
}
