// D14 Excel (receivables task 6.2; spec receivables "Xuất Excel công nợ"):
// the filter on screen, the parts in their own columns, integer cells,
// cancelled receipts kept, nothing logged.
import { inflateRawSync } from "node:zlib";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import {
  deliveredSale,
  requestId,
  setupReceivableFixture,
  type ReceivableFixture,
} from "@/test/receivables";

import { exportReceivables } from "./export";
import { cancelReceipt, recordReceipt } from "./receipts";

const ctx = createTestContext();
afterAll(ctx.close);

const DEC_30 = "2026-12-30" as BusinessDate;

let fx: ReceivableFixture;
beforeEach(async () => {
  fx = await setupReceivableFixture(ctx);
});

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

async function pay(customerId: string, amount: number) {
  const saved = await recordReceipt(
    ctx.db,
    fx.accountant,
    {
      requestId: requestId(),
      customerId,
      kind: "PAYMENT",
      amount,
      method: "TRANSFER",
      receivedDate: "2026-11-20",
    },
    { now: new Date("2026-11-20T03:00:00Z") },
  );
  if (!saved.ok) throw new Error(saved.error);
  return saved.data;
}

describe("exportReceivables", () => {
  it("splits the sale into its columns as integer cells", async () => {
    await deliveredSale(ctx, fx, {
      customerId: fx.customerId,
      vatEnabled: true,
      vatRate: "8",
      paymentTermsDays: 15,
    });
    await pay(fx.customerId, 10_000_000);
    const wrong = await pay(fx.customer("NT-0002"), 3_000_000);
    await cancelReceipt(ctx.db, fx.accountant, wrong.id, {
      reason: "Ghi nhầm nhà thầu",
    });
    const before = (await activityRows(ctx.db)).length;
    const result = await exportReceivables(ctx.db, DEC_30, { filter: "all" });
    expect(result.filename).toBe("cong-no-2026-12-30.xlsx");
    const files = unzip(result.file);
    const workbook = files.get("xl/workbook.xml") ?? "";
    for (const name of ["Theo nhà thầu", "Các khoản", "Phiếu thu"]) {
      expect(workbook).toContain(`<sheet name="${name}"`);
    }
    const debts = files.get("xl/worksheets/sheet2.xml") ?? "";
    expect(rowsOf(debts)).toBe(2);
    // bán, cước, VAT, phát sinh, đã thu, còn nợ, quá hạn (18/11 → 30/12).
    for (const value of [
      17_507_000, 1_400_560, 18_907_560, 10_000_000, 8_907_560, 42,
    ]) {
      expect(debts).toContain(`<v>${value}</v>`);
    }
    expect(debts).not.toMatch(/<v>\d+\.\d+<\/v>/);
    const receipts = files.get("xl/worksheets/sheet3.xml") ?? "";
    expect(rowsOf(receipts)).toBe(3);
    expect(receipts).toContain("Ghi nhầm nhà thầu");
    expect(await activityRows(ctx.db)).toHaveLength(before);
  });

  it("follows the filter, not the page", async () => {
    await deliveredSale(ctx, fx, { customerId: fx.customerId });
    await pay(fx.customer("NT-0002"), 1_000);
    const result = await exportReceivables(ctx.db, DEC_30, {
      filter: "overdue",
    });
    const files = unzip(result.file);
    const customers = files.get("xl/worksheets/sheet1.xml") ?? "";
    expect(rowsOf(customers)).toBe(2);
    expect(customers).toContain("Minh Phát");
    expect(customers).not.toContain("Trần Văn Hùng");
  });
});
