// A sale amendment takes effect after the latest delivery (receivables task
// 5.4, 0.2 #89; spec contract-amendments "Ngày hiệu lực của phụ lục"):
// goods already delivered keep the VAT and due date of their day.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { REVISION_MESSAGES } from "@/domain/contract-revision";
import { createAmendment, updateAmendment } from "@/lib/contracts/amendments";
import { createTestContext } from "@/test/auth";
import { kgSale } from "@/test/contracts";
import {
  deliveredSale,
  setupReceivableFixture,
  type ReceivableFixture,
} from "@/test/receivables";

const ctx = createTestContext();
afterAll(ctx.close);

/** The sale is delivered on 03/11/2026 (NOW of the delivery tests). */
const NOV_5 = "2026-11-05" as BusinessDate;

let fx: ReceivableFixture;
let contractId = "";
beforeEach(async () => {
  fx = await setupReceivableFixture(ctx);
  ({ contractId } = await deliveredSale(ctx, fx));
});

async function draft() {
  const made = await createAmendment(ctx.db, fx.sales, contractId, {
    today: NOV_5,
  });
  if (!made.ok) throw new Error(made.error);
  return made.data;
}

function saveFrom(
  amendment: { number: number; updatedAt: string },
  effectiveFrom: string,
) {
  const [line] = kgSale(fx).lines ?? [];
  return updateAmendment(ctx.db, fx.sales, contractId, amendment.number, {
    ...kgSale(fx),
    lines: line ? [{ ...line, price: 15_000 }] : [],
    vatEnabled: true,
    vatRate: "10",
    effectiveFrom,
    reason: "Khách lấy hóa đơn từ đợt sau",
    updatedAt: amendment.updatedAt,
  });
}

describe("sale amendments", () => {
  it("refuses the delivery day and takes the day after", async () => {
    const amendment = await draft();
    expect(await saveFrom(amendment, "2026-11-03")).toMatchObject({
      ok: false,
      status: 422,
      field: "effectiveFrom",
      error: REVISION_MESSAGES.saleDelivered("2026-11-03"),
    });
    expect((await saveFrom(amendment, "2026-11-04")).ok).toBe(true);
  });
});
