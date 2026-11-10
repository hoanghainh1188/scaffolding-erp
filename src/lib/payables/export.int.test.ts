// "Xuất Excel" of D14c (payables task 6.2): three sheets, money as integer
// cells, the filter and search on screen, CCCD and bank account masked,
// no activity row.
import { inflateRawSync } from "node:zlib";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { supplier } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import { at, receiptFor } from "@/test/payables";
import { setupReceivingFixture, type ReceivingFixture } from "@/test/receiving";

import { exportPayables } from "./export";
import { cancelPayment, recordPayment } from "./payments";

const ctx = createTestContext();
afterAll(ctx.close);

const NOV_6 = "2026-11-06" as BusinessDate;
let fx: ReceivingFixture;

beforeEach(async () => {
  fx = await setupReceivingFixture(ctx);
});

function unzip(bytes: Uint8Array): Map<string, string> {
  const buffer = Buffer.from(bytes);
  const endAt = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(endAt + 10);
  let offset = buffer.readUInt32LE(endAt + 16);
  const files = new Map<string, string>();
  for (let i = 0; i < count; i += 1) {
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    const start = local + 30 + buffer.readUInt16LE(local + 26);
    files.set(
      name,
      inflateRawSync(buffer.subarray(start, start + size)).toString("utf8"),
    );
    offset += 46 + nameLength;
  }
  return files;
}

const rowsOf = (sheet: string) => sheet.match(/<row /g)?.length ?? 0;

async function setUp() {
  const tam = fx.supplier("NCC-0002");
  await ctx.db
    .update(supplier)
    .set({
      idNumberEnc: "pii1.1.YWJjZGVmZ2hpamts.YWJjZGVmZ2hpamtsbW5vcA",
      idNumberLast4: "2345",
      bankAccountLast4: "5678",
      bankName: "Vietcombank",
    })
    .where(eq(supplier.id, tam));
  const kg = await receiptFor(ctx, fx, {
    item: "PL-SAT",
    unit: "KG",
    quantity: "3312.5",
    price: 8_000,
    day: "2026-11-04",
  });
  await receiptFor(ctx, fx, {
    supplier: "NCC-0001",
    quantity: "10",
    price: 100_000,
    day: "2026-11-06",
  });
  const paid = await recordPayment(
    ctx.db,
    fx.accountant,
    {
      requestId: crypto.randomUUID(),
      supplierId: tam,
      kind: "PAYMENT",
      amount: 1_000,
      method: "CASH",
      paidDate: "2026-11-06",
    },
    { now: at("2026-11-06") },
  );
  if (!paid.ok) throw new Error(paid.error);
  await cancelPayment(
    ctx.db,
    fx.accountant,
    paid.data.id,
    { reason: "Ghi thử" },
    { now: at("2026-11-06") },
  );
  return { kg };
}

describe("exportPayables", () => {
  it("writes three sheets with integer money and masked CCCD", async () => {
    const { kg } = await setUp();
    const before = (await activityRows(ctx.db)).length;
    const result = await exportPayables(ctx.db, NOV_6, { filter: "owing" });
    expect(result.filename).toBe("cong-no-phai-tra-2026-11-06.xlsx");
    const files = unzip(result.file);
    const workbook = files.get("xl/workbook.xml") ?? "";
    for (const name of ["Theo người bán", "Các khoản", "Phiếu chi"]) {
      expect(workbook).toContain(`<sheet name="${name}"`);
    }
    const sellers = files.get("xl/worksheets/sheet1.xml") ?? "";
    expect(sellers).toContain("•••• •••• 2345");
    expect(sellers).toContain(">Tài khoản<");
    expect(sellers).toContain(">Vietcombank ···5678<");
    expect(sellers).not.toContain("Ngân hàng");
    expect(sellers).not.toContain("001203012345");
    const receipts = files.get("xl/worksheets/sheet2.xml") ?? "";
    expect(receipts).toContain(kg.code);
    expect(receipts).toContain("<v>26500000</v>");
    expect(receipts).not.toMatch(/<v>\d+\.\d+<\/v>/);
    const payments = files.get("xl/worksheets/sheet3.xml") ?? "";
    expect(payments).toContain("Ghi thử");
    expect(payments).toContain("Đã hủy");
    const all = [...files.values()].join("");
    expect(all).not.toContain("001203012345");
    expect(all).not.toContain("0451000312345678");
    expect(await activityRows(ctx.db)).toHaveLength(before);
  });

  it("follows the filter and the search", async () => {
    await setUp();
    const result = await exportPayables(ctx.db, NOV_6, {
      filter: "overdue",
    });
    const files = unzip(result.file);
    const sellers = files.get("xl/worksheets/sheet1.xml") ?? "";
    expect(rowsOf(sellers)).toBe(2);
    expect(sellers).toContain("Chú Ba ve chai");
    expect(sellers).not.toContain("Hòa Phát");
    const searched = unzip(
      (await exportPayables(ctx.db, NOV_6, { filter: "all", q: "hoa phat" }))
        .file,
    );
    expect(searched.get("xl/worksheets/sheet1.xml")).not.toContain(
      "Chú Ba ve chai",
    );
  });
});
