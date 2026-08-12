import { deflateRawSync, inflateRawSync } from "node:zlib";

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_ENTRIES = 500;
const MAX_ENTRY_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_BYTES = 250 * 1024 * 1024;
const MAX_RATIO = 250;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    table[index] = crc >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time:((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | (Math.floor(date.getSeconds() / 2) & 31),
    date:(((year - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31)
  };
}

export function createZip(entries) {
  if (!Array.isArray(entries) || entries.length > MAX_ENTRIES) throw new Error("Te veel ZIP-onderdelen.");
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const stamp = dosDateTime();
  for (const entry of entries) {
    const name = String(entry.name || "").replace(/\\/g, "/");
    if (!name || name.startsWith("/") || name.includes("../") || /[\0]/.test(name)) throw new Error(`Ongeldige ZIP-naam: ${name}`);
    const nameBytes = Buffer.from(name, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data ?? ""), "utf8");
    if (data.length > MAX_ENTRY_BYTES) throw new Error(`ZIP-onderdeel te groot: ${name}`);
    const compressed = deflateRawSync(data, { level:6 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBytes, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + compressed.length;
  }
  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function findEocd(buffer) {
  const min = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("ZIP-eindrecord ontbreekt.");
}

export function readZip(bufferInput) {
  const buffer = Buffer.isBuffer(bufferInput) ? bufferInput : Buffer.from(bufferInput);
  if (buffer.length > MAX_ARCHIVE_BYTES) throw new Error("XLSX-bestand is te groot.");
  const eocd = findEocd(buffer);
  const count = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES || centralOffset + centralSize > buffer.length) throw new Error("ZIP-directory is ongeldig.");
  const entries = new Map();
  let offset = centralOffset;
  let totalBytes = 0;
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("ZIP-directoryrecord is ongeldig.");
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const expectedCrc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8").replace(/\\/g, "/");
    offset += 46 + nameLength + extraLength + commentLength;
    if ((flags & 1) !== 0) throw new Error("Versleutelde XLSX-onderdelen zijn niet toegestaan.");
    if (![0, 8].includes(method)) throw new Error(`Niet-ondersteunde ZIP-compressie in ${name}.`);
    if (!name || name.startsWith("/") || name.includes("../") || name.includes("\0")) throw new Error("Onveilig ZIP-pad.");
    if (entries.has(name)) throw new Error(`Dubbel ZIP-onderdeel: ${name}`);
    if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error(`ZIP-onderdeel te groot: ${name}`);
    if (compressedSize > 0 && uncompressedSize / compressedSize > MAX_RATIO) throw new Error(`Verdachte compressieverhouding: ${name}`);
    totalBytes += uncompressedSize;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("XLSX bevat te veel uitgepakte gegevens.");
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("ZIP-localheader is ongeldig.");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) throw new Error("ZIP-onderdeel valt buiten het bestand.");
    const compressed = buffer.subarray(dataStart, dataEnd);
    const data = method === 8 ? inflateRawSync(compressed) : Buffer.from(compressed);
    if (data.length !== uncompressedSize || crc32(data) !== expectedCrc) throw new Error(`ZIP-integriteitscontrole mislukt: ${name}`);
    entries.set(name, data);
  }
  return entries;
}

export function xmlEscape(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function xmlDecode(value) {
  return String(value ?? "").replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => String.fromCodePoint(code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : parseInt(code, 10)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function columnName(index) {
  let name = "";
  for (let value = index; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  return name;
}

function safeSheetName(value, used) {
  const base = String(value || "Blad").replace(/[\\/*?:\[\]]/g, "_").slice(0, 31) || "Blad";
  let name = base;
  let suffix = 2;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, Math.max(1, 28 - String(suffix).length))}_${suffix++}`.slice(0, 31);
  used.add(name.toLowerCase());
  return name;
}

function worksheetXml(rows) {
  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
      const text = String(value ?? "");
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetData>${rowXml}</sheetData></worksheet>`;
}

export function createXlsx(sheetsInput) {
  if (!Array.isArray(sheetsInput) || !sheetsInput.length || sheetsInput.length > 100) throw new Error("Ongeldige werkbladset.");
  const used = new Set();
  const sheets = sheetsInput.map((sheet, index) => ({ name:safeSheetName(sheet.name, used), rows:Array.isArray(sheet.rows) ? sheet.rows : [], id:index + 1 }));
  const now = new Date().toISOString();
  const entries = [
    { name:"[Content_Types].xml", data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${sheets.map(sheet => `<Override PartName="/xl/worksheets/sheet${sheet.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
    { name:"_rels/.rels", data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name:"docProps/core.xml", data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>CWS Planning</dc:creator><cp:lastModifiedBy>CWS Planning</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>` },
    { name:"docProps/app.xml", data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>CWS Planning</Application></Properties>` },
    { name:"xl/workbook.xml", data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map(sheet => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${sheet.id}" r:id="rId${sheet.id}"/>`).join("")}</sheets></workbook>` },
    { name:"xl/_rels/workbook.xml.rels", data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map(sheet => `<Relationship Id="rId${sheet.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheet.id}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name:"xl/styles.xml", data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>` },
    ...sheets.map(sheet => ({ name:`xl/worksheets/sheet${sheet.id}.xml`, data:worksheetXml(sheet.rows) }))
  ];
  return createZip(entries);
}

function attr(tag, name) {
  const match = new RegExp(`\\b${name.replace(":", "\\:")}=["']([^"']*)["']`, "i").exec(tag);
  return match ? xmlDecode(match[1]) : "";
}

function normalizeTarget(target) {
  const value = String(target || "").replace(/\\/g, "/");
  return value.startsWith("/") ? value.slice(1) : `xl/${value.replace(/^\.\//, "")}`.replace(/\/[^/]+\/\.\.\//g, "/");
}

function cellColumn(reference) {
  const letters = String(reference || "").match(/^[A-Z]+/i)?.[0]?.toUpperCase() || "A";
  let value = 0;
  for (const char of letters) value = value * 26 + char.charCodeAt(0) - 64;
  return Math.max(1, value);
}

function textNodes(xml) {
  return [...String(xml).matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map(match => xmlDecode(match[1])).join("");
}

export function readXlsx(buffer) {
  const entries = readZip(buffer);
  const getText = name => {
    const value = entries.get(name);
    if (!value) throw new Error(`XLSX-onderdeel ontbreekt: ${name}`);
    const text = value.toString("utf8");
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("Onveilige XML-definitie in XLSX.");
    return text;
  };
  const workbook = getText("xl/workbook.xml");
  const relationships = getText("xl/_rels/workbook.xml.rels");
  const relMap = new Map([...relationships.matchAll(/<Relationship\b[^>]*\/>/gi)].map(match => [attr(match[0], "Id"), normalizeTarget(attr(match[0], "Target"))]));
  const shared = entries.has("xl/sharedStrings.xml")
    ? [...getText("xl/sharedStrings.xml").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map(match => textNodes(match[1]))
    : [];
  const sheets = [];
  for (const match of workbook.matchAll(/<sheet\b[^>]*\/>/gi)) {
    const name = attr(match[0], "name") || `Blad ${sheets.length + 1}`;
    const relationshipId = attr(match[0], "r:id");
    const target = relMap.get(relationshipId);
    if (!target || !entries.has(target)) throw new Error(`Werkbladonderdeel ontbreekt voor ${name}.`);
    const xml = getText(target);
    const rows = [];
    let cellCount = 0;
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
      const row = [];
      for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
        cellCount += 1;
        if (cellCount > 1_000_000) throw new Error(`Werkblad ${name} bevat te veel cellen.`);
        const tag = `<c ${cellMatch[1]}>`;
        const column = cellColumn(attr(tag, "r"));
        const type = attr(tag, "t");
        const body = cellMatch[2];
        let value = "";
        if (type === "inlineStr") value = textNodes(body);
        else {
          const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(body)?.[1] ?? "";
          value = type === "s" ? (shared[Number(raw)] ?? "") : xmlDecode(raw);
        }
        while (row.length < column - 1) row.push("");
        row[column - 1] = value;
      }
      rows.push(row);
      if (rows.length > 200_000) throw new Error(`Werkblad ${name} bevat te veel rijen.`);
    }
    sheets.push({ name, rows });
  }
  if (!sheets.length) throw new Error("XLSX bevat geen werkbladen.");
  return sheets;
}
