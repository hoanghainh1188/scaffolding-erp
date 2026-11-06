// Sample payables for dev and demo (payables task 8.1, design D10): the
// steel company is owed 30 days from each receipt, and the scrap seller of
// the D3b order gets one payment that settles part of what he is owed. No
// new supplier (D16 counts them). A fixed request id: running the seed
// again replays the payment instead of adding one.
import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { supplier, supplierPayment } from "@/db/schema";
import { toBusinessDate } from "@/domain/business-date";
import type { Actor } from "@/lib/catalog/common";
import { SAMPLE_SUPPLIERS } from "@/lib/purchasing/sample";

import { readLedger } from "./balances";
import { recordPayment } from "./payments";

const STEEL_TERMS_DAYS = 30;
const PAYMENT_REQUEST = "7a1d2c3e-4b5f-4c6d-8e9f-0a1b2c3d4e01";
const SAMPLE_PAYMENT = 20_000_000;

/** Number of sample rows added (terms set, payment recorded). */
export async function seedPayables(
  db: Database,
  accountant: Actor,
): Promise<number> {
  let added = 0;
  // Only the first time: a later edit on D16 is kept.
  const terms = await db
    .update(supplier)
    .set({ paymentTermsDays: STEEL_TERMS_DAYS })
    .where(
      and(
        eq(supplier.name, SAMPLE_SUPPLIERS.new),
        eq(supplier.paymentTermsDays, 0),
      ),
    )
    .returning({ id: supplier.id });
  added += terms.length;
  const [seller] = await db
    .select({ id: supplier.id })
    .from(supplier)
    .where(eq(supplier.name, SAMPLE_SUPPLIERS.used));
  if (!seller) return added;
  const [done] = await db
    .select({ id: supplierPayment.id })
    .from(supplierPayment)
    .where(eq(supplierPayment.requestId, PAYMENT_REQUEST));
  if (done) return added;
  const today = toBusinessDate(new Date());
  const ledger = await readLedger(db, seller.id, today);
  if (ledger.owed <= 0) return added;
  const paid = await recordPayment(db, accountant, {
    requestId: PAYMENT_REQUEST,
    supplierId: seller.id,
    kind: "PAYMENT",
    amount: Math.min(SAMPLE_PAYMENT, ledger.owed),
    method: "CASH",
    paidDate: today,
    note: "Phiếu chi mẫu (seed dev)",
  });
  if (paid.ok && !paid.data.replayed) added += 1;
  return added;
}
