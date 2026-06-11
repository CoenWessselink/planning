import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

// Convert all CSV exports found in ./out into one XLSX workbook.
const outDir = path.join(process.cwd(), 'out');
if(!fs.existsSync(outDir)){
  console.error("Missing ./out folder. Create it and place CSV files inside (e.g. projecten.csv, capaciteit.csv, rapport.csv).");
  process.exit(1);
}
const files = fs.readdirSync(outDir).filter(f=>f.toLowerCase().endsWith('.csv'));
if(!files.length){
  console.error("No CSV files in ./out.");
  process.exit(1);
}

const wb = XLSX.utils.book_new();

for(const f of files){
  const p = path.join(outDir, f);
  const csv = fs.readFileSync(p, 'utf8');
  const ws = XLSX.utils.csv_to_sheet(csv);
  const name = path.basename(f, '.csv').slice(0, 31) || 'Sheet';
  XLSX.utils.book_append_sheet(wb, ws, name);
}

const dest = path.join(outDir, 'cws_exports.xlsx');
XLSX.writeFile(wb, dest);
console.log("Wrote:", dest);
