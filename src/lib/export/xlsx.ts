// A minimal .xlsx writer (activity-log design D10, rental-billing design
// D9): sheets of text, number and date cells, a bold header row, wrapped
// cells. No library: the OOXML parts are small and node:zlib zips them.
// Text is an inline string, so a value starting with "=" is text, never a
// formula.
import { crc32, deflateRawSync } from "node:zlib";

export interface XlsxColumn {
  header: string;
  /** Column width in characters. */
  width: number;
}

/** A calendar date (YYYY-MM-DD), written as an Excel date dd/mm/yyyy. */
export interface XlsxDate {
  date: string;
}

/** Text, a number (money, quantity) or a date; null is an empty cell. */
export type XlsxValue = string | number | XlsxDate | null;

export interface XlsxSheet {
  sheetName: string;
  columns: readonly XlsxColumn[];
  rows: readonly (readonly XlsxValue[])[];
}

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// XML 1.0 allows tab, newline, carriage return and these ranges only.
const INVALID_XML = /[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu;

function escapeXml(text: string): string {
  return text
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function columnName(index: number): string {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rest = (n - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function cell(ref: string, value: string, style: number): string {
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

const HEADER_STYLE = 1;
const BODY_STYLE = 2;
const NUMBER_STYLE = 3;
const DATE_STYLE = 4;

/** Days since 30/12/1899, the Excel date of a YYYY-MM-DD. */
export function excelSerial(date: string): number {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return Math.round(
    (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000,
  );
}

function valueCell(ref: string, value: XlsxValue): string {
  if (value === null) return `<c r="${ref}" s="${BODY_STYLE}"/>`;
  if (typeof value === "number") {
    return `<c r="${ref}" s="${NUMBER_STYLE}"><v>${value}</v></c>`;
  }
  if (typeof value === "object") {
    return `<c r="${ref}" s="${DATE_STYLE}"><v>${excelSerial(value.date)}</v></c>`;
  }
  return cell(ref, value, BODY_STYLE);
}

function sheetXml({ columns, rows }: XlsxSheet): string {
  const cols = columns
    .map(
      (column, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${column.width}" customWidth="1"/>`,
    )
    .join("");
  const header = `<row r="1">${columns
    .map((column, i) => cell(`${columnName(i)}1`, column.header, HEADER_STYLE))
    .join("")}</row>`;
  const body = rows
    .map((values, r) => {
      const n = r + 2;
      const cells = columns
        .map((_, c) => valueCell(`${columnName(c)}${n}`, values[c] ?? ""))
        .join("");
      return `<row r="${n}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${header}${body}</sheetData></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1" applyNumberFormat="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment vertical="top"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function parts(sheets: readonly XlsxSheet[]): [string, string][] {
  const numbers = sheets.map((_, i) => i + 1);
  return [
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${numbers
        .map(
          (n) =>
            `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join(
          "",
        )}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
        .map(
          (sheet, i) =>
            `<sheet name="${escapeXml(sheet.sheetName.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
        )
        .join("")}</sheets></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${numbers
        .map(
          (n) =>
            `<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`,
        )
        .join(
          "",
        )}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    ["xl/styles.xml", STYLES],
    ...sheets.map((sheet, i): [string, string] => [
      `xl/worksheets/sheet${i + 1}.xml`,
      sheetXml(sheet),
    ]),
  ];
}

// ZIP (PKWARE APPNOTE): a local header + deflated data per entry, then the
// central directory and its end record. Dates are fixed: the file is built
// from data, and a stable output is easier to test.
const DOS_TIME = 0;
// 01/01/2026 in MS-DOS date format: year since 1980, month, day.
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const UTF8_FLAG = 0x0800;

function zip(entries: readonly [string, string][]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [path, text] of entries) {
    const name = Buffer.from(path, "utf8");
    const raw = Buffer.from(text, "utf8");
    const data = deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

/** One-sheet workbook: header row, then `rows`. */
export function buildXlsx(sheet: XlsxSheet): Uint8Array {
  return zip(parts([sheet]));
}

/** A workbook of several sheets, in this order. */
export function buildXlsxBook(sheets: readonly XlsxSheet[]): Uint8Array {
  return zip(parts(sheets));
}
