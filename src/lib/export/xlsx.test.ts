import { inflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { buildXlsx, columnName } from "./xlsx";

/** Reads a ZIP back through its central directory. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const buffer = Buffer.from(bytes);
  const endAt = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(endAt + 10);
  let at = buffer.readUInt32LE(endAt + 16);
  const files = new Map<string, string>();
  for (let i = 0; i < count; i += 1) {
    expect(buffer.readUInt32LE(at)).toBe(0x02014b50);
    const size = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.toString("utf8", at + 46, at + 46 + nameLength);
    const localName = buffer.readUInt16LE(local + 26);
    const start = local + 30 + localName;
    files.set(
      name,
      inflateRawSync(buffer.subarray(start, start + size)).toString("utf8"),
    );
    at += 46 + nameLength;
  }
  return files;
}

/** Cell text by reference ("B2") from sheet1.xml. */
function cells(sheet: string): Map<string, string> {
  const unescape = (text: string) =>
    text
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");
  return new Map(
    [
      ...sheet.matchAll(
        /<c r="([A-Z]+\d+)" t="inlineStr"[^>]*><is><t[^>]*>([\s\S]*?)<\/t><\/is><\/c>/g,
      ),
    ].map((match) => [match[1] ?? "", unescape(match[2] ?? "")]),
  );
}

const COLUMNS = [
  { header: "Thời điểm", width: 20 },
  { header: "Người làm", width: 18 },
  { header: "Thay đổi", width: 40 },
];

describe("buildXlsx", () => {
  const file = buildXlsx({
    sheetName: "Nhật ký",
    columns: COLUMNS,
    rows: [
      [
        "28/10/2026 22:47:13",
        "Thu Hà",
        "Đơn giá GG-K17: 190.000 ₫ → 185.000 ₫\nTổng tiền: 52.942.500 ₫ → 51.942.500 ₫",
      ],
      ["27/10/2026 23:05:00", 'Đức "Thắng" & <Co>', "=SUM(A1)"],
      ["x\u0000y\u0007z", "", ""],
    ],
  });
  const parts = unzip(file);
  const sheet = parts.get("xl/worksheets/sheet1.xml") ?? "";
  const values = cells(sheet);

  it("contains the six OOXML parts", () => {
    expect([...parts.keys()].sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    expect(parts.get("xl/workbook.xml")).toContain('name="Nhật ký"');
  });

  it("has a header row and one row per record", () => {
    expect(sheet.match(/<row /g)).toHaveLength(4);
  });

  it("reads each cell back, Vietnamese and line breaks intact", () => {
    expect(values.get("A1")).toBe("Thời điểm");
    expect(values.get("B2")).toBe("Thu Hà");
    expect(values.get("C2")).toBe(
      "Đơn giá GG-K17: 190.000 ₫ → 185.000 ₫\nTổng tiền: 52.942.500 ₫ → 51.942.500 ₫",
    );
    expect(values.get("B3")).toBe('Đức "Thắng" & <Co>');
  });

  it("escapes XML characters", () => {
    expect(sheet).toContain("Đức &quot;Thắng&quot; &amp; &lt;Co&gt;");
  });

  it("keeps a formula-looking value as text", () => {
    expect(values.get("C3")).toBe("=SUM(A1)");
    expect(sheet).not.toContain("<f>");
  });

  it("drops control characters XML cannot hold", () => {
    expect(values.get("A4")).toBe("xyz");
  });

  it("builds 10.000 rows quickly", () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => [
      `28/10/2026 ${String(i % 24).padStart(2, "0")}:00:00`,
      "Văn Tùng",
      "Nhận 80 khung 1,7m, 50 kích U · đã xác nhận nhận dư",
    ]);
    const started = performance.now();
    const big = buildXlsx({ sheetName: "Nhật ký", columns: COLUMNS, rows });
    expect(performance.now() - started).toBeLessThan(2000);
    const bigSheet = unzip(big).get("xl/worksheets/sheet1.xml") ?? "";
    expect(bigSheet.match(/<row /g)).toHaveLength(10_001);
  });
});

describe("columnName", () => {
  it.each([
    [0, "A"],
    [25, "Z"],
    [26, "AA"],
    [27, "AB"],
  ])("%i → %s", (index, name) => {
    expect(columnName(index)).toBe(name);
  });
});
