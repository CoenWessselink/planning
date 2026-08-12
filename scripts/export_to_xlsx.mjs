import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createXlsx } from "./xlsx-lite.mjs";

const outDir = path.join(process.cwd(), "out");
await mkdir(outDir, { recursive:true });
const files = (await readdir(outDir)).filter(file => file.toLowerCase().endsWith(".csv")).sort();
if (!files.length) {
  console.error("Geen CSV-bestanden gevonden in ./out.");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const firstLine = String(text).split(/\r?\n/, 1)[0] || "";
  const delimiter = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some(value => String(value).length)) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some(value => String(value).length)) rows.push(row);
  return rows;
}

const sheets = [];
for (const file of files) {
  const text = await readFile(path.join(outDir, file), "utf8");
  sheets.push({ name:path.basename(file, path.extname(file)), rows:parseCsv(text) });
}
const destination = path.join(outDir, "cws_exports.xlsx");
await writeFile(destination, createXlsx(sheets));
console.log(`XLSX geschreven: ${destination}`);
