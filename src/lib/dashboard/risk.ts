// Risky sites of D1 (dashboard-basic design D5, 0.2 #92): a rental
// contract is at risk when its customer is overdue on the contract's own
// debts, when goods were lost on its return notes in the last 30 days, or
// when the end date of the revision in force has passed with goods still on
// site. Signs are computed per contract and grouped by site. Overdue shows
// days only, never an amount, so sales may see it (0.2 #91).
import { and, asc, eq, gte, inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  contract,
  contractRevision,
  customer,
  inventoryLedger,
  item,
  returnNote,
  site,
} from "@/db/schema";
import { addDays, type BusinessDate } from "@/domain/business-date";
import { revisionAt } from "@/domain/contract-revision";
import {
  RISK_LOSS_DAYS,
  isPastEnd,
  isRecentLoss,
  riskBySite,
  type RiskContract,
  type RiskSign,
  type RiskSite,
} from "@/domain/dashboard";
import { canContract, type ContractUser } from "@/domain/permissions";
import { sumByUnit, type QuantityUnit } from "@/domain/quantity";
import { overdueOf } from "@/domain/receivables";
import {
  RETURN_DOCUMENT_TYPE,
  siteLedgerLinesOf,
} from "@/lib/deliveries/site-ledger";
import { unitFromDb } from "@/lib/inventory/unit";
import { readLedgers } from "@/lib/receivables/balances";

type Reader = Pick<Database, "select">;

interface RentalHead {
  id: string;
  code: string;
  customerId: string;
  customerName: string;
  siteId: string;
  siteCode: string;
  siteName: string;
}

/** Running rental contracts the viewer may read. */
export async function runningRentals(
  db: Reader,
  viewer: ContractUser,
): Promise<RentalHead[]> {
  if (!canContract(viewer, "RENTAL", "view")) return [];
  const rows = await db
    .select({
      id: contract.id,
      code: contract.code,
      customerId: contract.customerId,
      customerName: customer.name,
      siteId: site.id,
      siteCode: site.code,
      siteName: site.name,
    })
    .from(contract)
    .innerJoin(customer, eq(customer.id, contract.customerId))
    .innerJoin(site, eq(site.id, contract.siteId))
    .where(
      and(
        eq(contract.type, "RENTAL"),
        inArray(contract.status, ["APPROVED", "ACTIVE"]),
      ),
    )
    // Contracts of one site in a fixed order (oldest first), never the
    // order the database happens to return.
    .orderBy(asc(contract.createdAt), asc(contract.id));
  return rows;
}

type Units = ReadonlyMap<string, { code: string; unit: QuantityUnit }>;

async function unitsOf(db: Reader, ids: readonly string[]): Promise<Units> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: item.id, code: item.code, unit: item.unit })
    .from(item)
    .where(inArray(item.id, unique));
  return new Map(
    rows.map((row) => [row.id, { code: row.code, unit: unitFromDb(row.unit) }]),
  );
}

/** Goods held now by contract: by item, in thousandths of its unit. */
async function heldBy(
  db: Reader,
  ids: readonly string[],
): Promise<Map<string, Map<string, number>>> {
  const lines = await siteLedgerLinesOf(db, ids);
  return new Map(
    [...lines].map(([id, own]) => {
      const byItem = new Map<string, number>();
      for (const line of own) {
        byItem.set(line.itemId, (byItem.get(line.itemId) ?? 0) + line.milli);
      }
      return [id, byItem];
    }),
  );
}

/** Lost goods on return notes from `since`, by contract. */
async function recentLosses(
  db: Reader,
  ids: readonly string[],
  since: BusinessDate,
) {
  if (ids.length === 0) return [];
  return db
    .select({
      contractId: returnNote.contractId,
      itemId: inventoryLedger.itemId,
      quantity: inventoryLedger.quantity,
      date: inventoryLedger.businessDate,
    })
    .from(inventoryLedger)
    .innerJoin(
      returnNote,
      and(
        eq(returnNote.id, inventoryLedger.documentId),
        eq(inventoryLedger.documentType, RETURN_DOCUMENT_TYPE),
      ),
    )
    .where(
      and(
        eq(inventoryLedger.movement, "LOSS_OUT"),
        gte(inventoryLedger.businessDate, since),
        inArray(returnNote.contractId, [...ids]),
      ),
    );
}

function lossSign(
  rows: readonly { itemId: string; quantity: string; date: string }[],
  units: Units,
  today: BusinessDate,
): RiskSign | null {
  const recent = rows.filter((row) =>
    isRecentLoss(row.date as BusinessDate, today),
  );
  if (recent.length === 0) return null;
  const latest = recent
    .map((row) => row.date)
    .sort()
    .at(-1) as BusinessDate;
  const byItem = new Map<string, number>();
  for (const row of recent) {
    const milli = Math.round(Math.abs(Number(row.quantity)) * 1000);
    byItem.set(row.itemId, (byItem.get(row.itemId) ?? 0) + milli);
  }
  return {
    kind: "LOSS",
    date: latest,
    items: [...byItem].map(([itemId, milli]) => ({
      code: units.get(itemId)?.code ?? "",
      unit: units.get(itemId)?.unit ?? "PIECE",
      milli,
    })),
  };
}

/** Risky sites the viewer may see, grouped by site (design D5). */
export async function riskySites(
  db: Reader,
  viewer: ContractUser,
  today: BusinessDate,
): Promise<RiskSite[]> {
  const heads = await runningRentals(db, viewer);
  if (heads.length === 0) return [];
  const ids = heads.map((head) => head.id);
  const [ledgers, revisions, held, losses] = await Promise.all([
    readLedgers(db, today),
    db
      .select({
        contractId: contractRevision.contractId,
        number: contractRevision.number,
        status: contractRevision.status,
        effectiveFrom: contractRevision.effectiveFrom,
        endDate: contractRevision.endDate,
      })
      .from(contractRevision)
      .where(inArray(contractRevision.contractId, ids)),
    heldBy(db, ids),
    recentLosses(db, ids, addDays(today, -RISK_LOSS_DAYS)),
  ]);
  const units = await unitsOf(db, [
    ...[...held.values()].flatMap((byItem) => [...byItem.keys()]),
    ...losses.map((row) => row.itemId),
  ]);
  const contracts: RiskContract[] = heads.map((head) => {
    const signs: RiskSign[] = [];
    const debts = (ledgers.get(head.customerId)?.debts ?? []).filter(
      (debt) => debt.contractId === head.id,
    );
    const overdue = overdueOf(debts, today);
    if (overdue.amount > 0) signs.push({ kind: "OVERDUE", days: overdue.days });
    const loss = lossSign(
      losses.filter((row) => row.contractId === head.id),
      units,
      today,
    );
    if (loss) signs.push(loss);
    const terms = revisionAt(
      revisions.filter((row) => row.contractId === head.id),
      today,
    );
    const onSite = sumByUnit(
      [...(held.get(head.id) ?? [])].map(([itemId, milli]) => ({
        unit: units.get(itemId)?.unit ?? "PIECE",
        milli,
      })),
    ).filter((amount) => amount.milli !== 0);
    const endDate = (terms?.endDate ?? null) as BusinessDate | null;
    if (endDate && isPastEnd(endDate, today, onSite)) {
      signs.push({ kind: "PAST_END", endDate, onSite });
    }
    return {
      siteId: head.siteId,
      siteCode: head.siteCode,
      siteName: head.siteName,
      contractId: head.id,
      contractCode: head.code,
      customerName: head.customerName,
      signs,
    };
  });
  return riskBySite(contracts);
}
