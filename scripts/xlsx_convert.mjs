import fs from 'fs';
import path from 'path';
import process from 'process';
import XLSX from 'xlsx';

const args = process.argv.slice(2);
const idx = args.indexOf('--');
const file = idx>=0 ? args[idx+1] : args[0];
if(!file){
  console.error('Usage: npm run xlsx:convert -- yourfile.xlsx');
  process.exit(1);
}
const wb = XLSX.readFile(file);

const outDir = path.join(process.cwd(), 'out');
fs.mkdirSync(outDir, { recursive:true });

function writeSheet(sheetName, outName){
  const ws = wb.Sheets[sheetName];
  if(!ws){
    console.error(`Missing sheet: ${sheetName}`);
    return false;
  }
  const csv = XLSX.utils.sheet_to_csv(ws);
  fs.writeFileSync(path.join(outDir, outName), csv, 'utf-8');
  console.log('Wrote', outName);
  return true;
}

const ok1 = writeSheet('Projects','projects.csv');
const ok2 = writeSheet('Resources','resources.csv');
const ok3 = writeSheet('Allocations','allocations.csv');

if(ok1 && ok2 && ok3){
  console.log('Done. Import CSV files from /out in the app (Import/Export).');
} else {
  process.exit(2);
}
