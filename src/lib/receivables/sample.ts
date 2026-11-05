// Sample receipts for dev (receivables task 8.1, design D10): Minh Phát pays
// the cash deposit of the running rental at An Phú – Block B and makes one
// payment that settles what it owes (the rest is prepayment). Fixed request
// ids: running the seed again replays them instead of adding receipts.
import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { contract, customer, site } from "@/db/schema";
import { toBusinessDate } from "@/domain/business-date";
import type { Actor } from "@/lib/catalog/common";

import { depositRoom, recordReceipt } from "./receipts";

const MINH_PHAT = "Cty TNHH Xây dựng Minh Phát";
const AN_PHU = "Chung cư An Phú – Block B";
const DEPOSIT_REQUEST = "5e3c1b9a-0d1f-4c55-9a47-0f2b6f2a1001";
const PAYMENT_REQUEST = "5e3c1b9a-0d1f-4c55-9a47-0f2b6f2a1002";

export async function seedReceivables(
  db: Database,
  accountant: Actor,
): Promise<number> {
  const [row] = await db
    .select({ contractId: contract.id, customerId: contract.customerId })
    .from(contract)
    .innerJoin(customer, eq(customer.id, contract.customerId))
    .innerJoin(site, eq(site.id, contract.siteId))
    .where(
      and(
        eq(customer.name, MINH_PHAT),
        eq(site.name, AN_PHU),
        eq(contract.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (!row) return 0;
  const actor = { ...accountant, contractScope: "ALL" as const };
  const today = toBusinessDate(new Date());
  let added = 0;
  const room = await depositRoom(db, row.contractId, today);
  const left = room.agreed - room.received;
  if (left > 0) {
    const deposit = await recordReceipt(db, actor, {
      requestId: DEPOSIT_REQUEST,
      customerId: row.customerId,
      kind: "DEPOSIT",
      contractId: row.contractId,
      amount: left,
      method: "CASH",
      receivedDate: today,
      note: "Cọc mẫu (seed dev)",
    });
    if (deposit.ok && !deposit.data.replayed) added += 1;
  }
  const payment = await recordReceipt(db, actor, {
    requestId: PAYMENT_REQUEST,
    customerId: row.customerId,
    kind: "PAYMENT",
    amount: 2_000_000,
    method: "TRANSFER",
    receivedDate: today,
    note: "Phiếu thu mẫu (seed dev)",
  });
  if (payment.ok && !payment.data.replayed) added += 1;
  return added;
}
