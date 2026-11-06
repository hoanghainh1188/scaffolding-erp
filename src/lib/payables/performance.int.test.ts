// payables task 8.4 (design D8, Risks): D14c reads every receipt of every
// seller at once. With 200 sellers × 50 posted receipts it stays well
// under 300 ms. Rows are written in bulk by the owner (the services would
// take minutes); only the read is measured.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { getAdminDatabase } from "@/test/admin";
import { createTestContext } from "@/test/auth";
import { setupReceivingFixture, type ReceivingFixture } from "@/test/receiving";

import { supplierBalances } from "./balances";

const ctx = createTestContext();
afterAll(ctx.close);

const SELLERS = 200;
const RECEIPTS = 50;
let fx: ReceivingFixture;

beforeEach(async () => {
  fx = await setupReceivingFixture(ctx);
  const admin = getAdminDatabase();
  const item = fx.item("GG-CH");
  const user = fx.sales.id;
  await admin.execute(sql`
    insert into supplier (code, kind, name, search_text, payment_terms_days)
    select 'NCC-P' || g, 'COMPANY', 'Người bán ' || g, 'nguoi ban ' || g, g % 31
    from generate_series(1, ${SELLERS}) g`);
  await admin.execute(sql`
    insert into purchase_order (code, supplier_id, kind, status, expected_date, created_by)
    select 'PO-P-' || s.code, s.id, 'NEW', 'IN_PROGRESS', date '2026-09-01', ${user}
    from supplier s where s.code like 'NCC-P%'`);
  await admin.execute(sql`
    insert into purchase_order_line (order_id, line_no, item_id, unit, quantity, unit_price)
    select o.id, 1, ${item}::uuid, 'PIECE', 5000, 25000
    from purchase_order o where o.code like 'PO-P-%'`);
  await admin.execute(sql`
    insert into goods_receipt (code, order_id, trip_no, location_id, client_draft_id,
      business_date, due_date, posting_id, created_by)
    select 'PN-P-' || o.code || '-' || t, o.id, t,
      (select id from location where code = 'BAI-01'), gen_random_uuid(),
      date '2026-09-01' + t, date '2026-09-01' + t + 15, gen_random_uuid(), ${user}
    from purchase_order o, generate_series(1, ${RECEIPTS}) t
    where o.code like 'PO-P-%'`);
  await admin.execute(sql`
    insert into goods_receipt_line (receipt_id, line_no, order_line_id, item_id,
      status, quantity, qty_new)
    select r.id, 1, l.id, l.item_id, 'COUNTED', 10, 10
    from goods_receipt r join purchase_order_line l on l.order_id = r.order_id
    where r.code like 'PN-P-%'`);
});

describe("supplierBalances at scale", () => {
  it("reads 200 sellers × 50 receipts in under 300 ms", async () => {
    const today = "2026-11-06" as BusinessDate;
    await supplierBalances(ctx.db, today, { filter: "owing" });
    const started = performance.now();
    const page = await supplierBalances(ctx.db, today, { filter: "owing" });
    const took = performance.now() - started;
    expect(page.totals.owingCount).toBe(SELLERS);
    expect(page.totals.owed).toBe(SELLERS * RECEIPTS * 250_000);
    expect(took).toBeLessThan(300);
  });
});
