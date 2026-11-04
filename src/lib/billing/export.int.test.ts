// "Xuất Excel" of D7 (rental-billing task 5.3, design D9): three sheets in
// D7 order, numbers as numbers, no activity log row.
import { inflateRawSync } from "node:zlib";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import { DEC_2_DATE, NOVEMBER_TOTAL } from "@/test/billing";
import { setupSiteFixture, type SiteFixture } from "@/test/site-operations";

import { exportPeriod } from "./export";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: SiteFixture;
beforeEach(async () => {
  fx = await setupSiteFixture(ctx);
});

/** File name → text of every part of the workbook. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const buffer = Buffer.from(bytes);
  const endAt = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(endAt + 10);
  let at = buffer.readUInt32LE(endAt + 16);
  const files = new Map<string, string>();
  for (let i = 0; i < count; i += 1) {
    const size = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.toString("utf8", at + 46, at + 46 + nameLength);
    const start = local + 30 + buffer.readUInt16LE(local + 26);
    files.set(
      name,
      inflateRawSync(buffer.subarray(start, start + size)).toString("utf8"),
    );
    at += 46 + nameLength;
  }
  return files;
}

const rowsOf = (sheet: string) => sheet.match(/<row /g)?.length ?? 0;

describe("exportPeriod", () => {
  it("writes the summary, the lines in D7 order and the freight", async () => {
    const before = (await activityRows(ctx.db)).length;
    const result = await exportPeriod(ctx.db, "2026-11", DEC_2_DATE);
    expect(result.filename).toBe("tien-thue-2026-11.xlsx");
    expect(result.contracts).toBe(1);
    const files = unzip(result.file);
    expect(files.get("xl/workbook.xml")).toContain('<sheet name="Tổng hợp"');
    const summary = files.get("xl/worksheets/sheet1.xml") ?? "";
    expect(rowsOf(summary)).toBe(2);
    expect(summary).toContain(fx.from.code);
    expect(summary).toContain(`<v>${NOVEMBER_TOTAL}</v>`);
    const detail = files.get("xl/worksheets/sheet2.xml") ?? "";
    expect(rowsOf(detail)).toBe(4);
    const order = ["GG-CH", "GG-K17", "GG-M16"].map((code) =>
      detail.indexOf(code),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(rowsOf(files.get("xl/worksheets/sheet3.xml") ?? "")).toBe(1);
    expect(await activityRows(ctx.db)).toHaveLength(before);
  });
});
