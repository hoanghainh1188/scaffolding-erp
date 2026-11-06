// Cost and losses of D15 from the stock ledger (management-reports design
// D1–D4; spec gross-profit). Two grouped reads over a range of days:
// ledger value by (month, document type, movement), and the repair slips
// posted in the range by the month of their ledger lines (0.2 #111: the
// repair cost is spent, the damage loss is taken). Nothing is stored.
import { and, between, eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { inventoryLedger, repairOrder, repairOrderLine } from "@/db/schema";
import type { LedgerSum, RepairSum } from "@/domain/gross-profit";
import type { DateRange } from "@/domain/report-period";
import { REPAIR_DOCUMENT_TYPE } from "@/domain/repair-order";

type Reader = Pick<Database, "select">;

const monthOfDate = (column: unknown) =>
  sql<string>`to_char(${column}, 'YYYY-MM')`;

/** Ledger value of the range by month, document type and movement. */
export async function ledgerSums(
  db: Reader,
  range: DateRange,
): Promise<LedgerSum[]> {
  const month = monthOfDate(inventoryLedger.businessDate);
  const rows = await db
    .select({
      month,
      documentType: inventoryLedger.documentType,
      movement: inventoryLedger.movement,
      amount: sql<string>`sum(${inventoryLedger.amount})`,
    })
    .from(inventoryLedger)
    .where(between(inventoryLedger.businessDate, range.from, range.to))
    .groupBy(month, inventoryLedger.documentType, inventoryLedger.movement);
  return rows.map((row) => ({ ...row, amount: Number(row.amount) }));
}

/** Repair cost and damage loss of the slips posted in the range. */
export async function repairSums(
  db: Reader,
  range: DateRange,
): Promise<RepairSum[]> {
  // The posting day is the day of the slip's ledger lines (design D3).
  const posted = db
    .select({
      orderId: sql<string>`${inventoryLedger.documentId}`.as("order_id"),
      day: sql<string>`min(${inventoryLedger.businessDate})`.as("day"),
    })
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.documentType, REPAIR_DOCUMENT_TYPE),
        between(inventoryLedger.businessDate, range.from, range.to),
      ),
    )
    .groupBy(inventoryLedger.documentId)
    .as("posted");
  const month = sql<string>`to_char(${posted.day}::date, 'YYYY-MM')`;
  const rows = await db
    .select({
      month,
      repairCost: sql<string>`sum(${repairOrderLine.repairCost})`,
      lossAmount: sql<string>`sum(coalesce(${repairOrderLine.lossAmount}, 0))`,
    })
    .from(posted)
    .innerJoin(repairOrder, eq(repairOrder.id, posted.orderId))
    .innerJoin(repairOrderLine, eq(repairOrderLine.orderId, repairOrder.id))
    .where(eq(repairOrder.status, "POSTED"))
    .groupBy(month);
  return rows.map((row) => ({
    month: row.month,
    repairCost: Number(row.repairCost),
    lossAmount: Number(row.lossAmount),
  }));
}
