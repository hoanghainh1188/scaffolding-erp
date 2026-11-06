// "Tra nhanh một công trình" (dashboard-basic design D5, D8, D9; 0.2 #91,
// #97): sites found by code, name or customer, each with its running rental
// contracts the viewer may read. Goods in pieces and tons for everyone;
// money (rent this month as D7, debt, deposit) only with receivables.view:
// without it nothing about money is computed or sent.
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  contract,
  contractDeposit,
  contractRevision,
  customer,
  item,
  site,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { revisionAt } from "@/domain/contract-revision";
import {
  onSiteTotals,
  type OnSiteLine,
  type OnSiteTotals,
} from "@/domain/dashboard";
import { can, canContract, type ContractUser } from "@/domain/permissions";
import { findProvince, REGION_LABELS } from "@/domain/province";
import { overdueOf, type Overdue } from "@/domain/receivables";
import { monthOf } from "@/domain/rental-billing";
import { toSearchText } from "@/domain/search-text";
import { statementOf } from "@/lib/billing/compute";
import { loadBillingSources } from "@/lib/billing/sources";
import { escapeLike } from "@/lib/catalog/items";
import { siteLedgerLinesOf } from "@/lib/deliveries/site-ledger";
import { readHolidays } from "@/lib/holidays/queries";
import { unitFromDb } from "@/lib/inventory/unit";
import { readLedgers } from "@/lib/receivables/balances";
import { contractMoneyStatus } from "@/lib/receivables/queries";

type Reader = Pick<Database, "select">;

export const LOOKUP_MIN_LENGTH = 2;
export const LOOKUP_MAX_LENGTH = 100;
export const LOOKUP_LIMIT = 8;

export const LOOKUP_MESSAGES = {
  tooLong: `Bạn gõ tối đa ${LOOKUP_MAX_LENGTH} ký tự.`,
} as const;

export interface LookupMoney {
  /** D7 before VAT, running month, to today. */
  rentThisMonth: number;
  rentAsOf: BusinessDate;
  owed: number;
  overdue: Overdue;
  depositAgreed: number;
  depositReceived: number;
}

export interface LookupContract {
  id: string;
  code: string;
  customerName: string;
  signedDate: string | null;
  status: string;
  onSite: OnSiteTotals;
  /** Absent without receivables.view (0.2 #91). */
  money?: LookupMoney;
}

export interface LookupSite {
  siteId: string;
  code: string;
  name: string;
  provinceName: string | null;
  regionLabel: string | null;
  onSite: OnSiteTotals;
  contracts: LookupContract[];
}

interface Head {
  id: string;
  code: string;
  status: string;
  customerId: string;
  customerName: string;
  siteId: string;
  siteCode: string;
  siteName: string;
  province: string | null;
}

async function findHeads(db: Reader, q: string): Promise<Head[]> {
  const pattern = `%${escapeLike(toSearchText(q))}%`;
  const code = `%${escapeLike(q.trim().toUpperCase())}%`;
  return db
    .select({
      id: contract.id,
      code: contract.code,
      status: contract.status,
      customerId: contract.customerId,
      customerName: customer.name,
      siteId: site.id,
      siteCode: site.code,
      siteName: site.name,
      province: site.province,
    })
    .from(contract)
    .innerJoin(customer, eq(customer.id, contract.customerId))
    .innerJoin(site, eq(site.id, contract.siteId))
    .where(
      and(
        eq(contract.type, "RENTAL"),
        inArray(contract.status, ["APPROVED", "ACTIVE"]),
        or(
          ilike(site.code, code),
          ilike(site.searchText, pattern),
          ilike(customer.searchText, pattern),
        ),
      ),
    )
    .orderBy(desc(contract.createdAt));
}

async function heldByContract(
  db: Reader,
  ids: readonly string[],
): Promise<Map<string, OnSiteTotals>> {
  const lines = await siteLedgerLinesOf(db, ids);
  const itemIds = [
    ...new Set([...lines.values()].flat().map((line) => line.itemId)),
  ];
  const items = itemIds.length
    ? await db
        .select({
          id: item.id,
          unit: item.unit,
          weight: item.standardWeightKg,
        })
        .from(item)
        .where(inArray(item.id, itemIds))
    : [];
  const info = new Map(items.map((row) => [row.id, row]));
  return new Map(
    [...lines].map(([id, own]) => {
      const byItem = new Map<string, number>();
      for (const line of own) {
        byItem.set(line.itemId, (byItem.get(line.itemId) ?? 0) + line.milli);
      }
      const held: OnSiteLine[] = [...byItem].map(([itemId, milli]) => ({
        unit: unitFromDb(info.get(itemId)?.unit ?? "PIECE"),
        milli,
        standardWeightKg: info.get(itemId)?.weight ?? null,
      }));
      return [id, onSiteTotals(held)];
    }),
  );
}

async function moneyOf(
  db: Reader,
  heads: readonly Head[],
  today: BusinessDate,
): Promise<Map<string, LookupMoney>> {
  const ids = heads.map((head) => head.id);
  const [sources, holidays, ledgers, revisions] = await Promise.all([
    loadBillingSources(db, ids),
    readHolidays(db),
    readLedgers(db, today),
    db
      .select({
        id: contractRevision.id,
        contractId: contractRevision.contractId,
        number: contractRevision.number,
        status: contractRevision.status,
        effectiveFrom: contractRevision.effectiveFrom,
      })
      .from(contractRevision)
      .where(inArray(contractRevision.contractId, ids)),
  ]);
  const inForce = new Map(
    ids.map((id) => [
      id,
      revisionAt(
        revisions.filter((row) => row.contractId === id),
        today,
      ),
    ]),
  );
  const revisionIds = [...inForce.values()].flatMap((row) =>
    row ? [row.id] : [],
  );
  const deposits = revisionIds.length
    ? await db
        .select({
          revisionId: contractDeposit.revisionId,
          amount: contractDeposit.amount,
        })
        .from(contractDeposit)
        .where(
          and(
            inArray(contractDeposit.revisionId, revisionIds),
            eq(contractDeposit.kind, "CASH"),
          ),
        )
    : [];
  const result = new Map<string, LookupMoney>();
  for (const head of heads) {
    const source = sources.get(head.id);
    const rent =
      source && source.terms.length > 0
        ? statementOf(source, monthOf(today), today, holidays).beforeVat
        : 0;
    const debts = (ledgers.get(head.customerId)?.debts ?? []).filter(
      (debt) => debt.contractId === head.id,
    );
    const revision = inForce.get(head.id);
    const status = await contractMoneyStatus(db, head.id);
    result.set(head.id, {
      rentThisMonth: rent,
      rentAsOf: today,
      owed: debts.reduce((sum, debt) => sum + debt.remaining, 0),
      overdue: overdueOf(debts, today),
      depositAgreed: deposits
        .filter((row) => row.revisionId === revision?.id)
        .reduce((sum, row) => sum + row.amount, 0),
      depositReceived: status.received,
    });
  }
  return result;
}

async function signedDates(
  db: Reader,
  ids: readonly string[],
): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      contractId: contractRevision.contractId,
      signedDate: contractRevision.signedDate,
    })
    .from(contractRevision)
    .where(
      and(
        inArray(contractRevision.contractId, [...ids]),
        eq(contractRevision.number, 0),
      ),
    );
  return new Map(rows.map((row) => [row.contractId, row.signedDate]));
}

const addTotals = (a: OnSiteTotals, b: OnSiteTotals): OnSiteTotals => ({
  piecesMilli: a.piecesMilli + b.piecesMilli,
  kgMilli: a.kgMilli + b.kgMilli,
});

/** Sites matching `q` with the contracts the viewer may read. */
export async function siteLookup(
  db: Reader,
  viewer: ContractUser,
  q: string,
  today: BusinessDate,
): Promise<LookupSite[]> {
  const text = q.trim();
  if (text.length < LOOKUP_MIN_LENGTH) return [];
  if (!canContract(viewer, "RENTAL", "view")) return [];
  const found = await findHeads(db, text);
  const siteIds = [...new Set(found.map((head) => head.siteId))].slice(
    0,
    LOOKUP_LIMIT,
  );
  const heads = found.filter((head) => siteIds.includes(head.siteId));
  const ids = heads.map((head) => head.id);
  const [held, signed, money] = await Promise.all([
    heldByContract(db, ids),
    signedDates(db, ids),
    can(viewer.role, "receivables.view")
      ? moneyOf(db, heads, today)
      : Promise.resolve(null),
  ]);
  return siteIds.map((siteId) => {
    const own = heads.filter((head) => head.siteId === siteId);
    const first = own[0] as Head;
    const province = findProvince(first.province);
    const contracts = own.map((head): LookupContract => {
      const row: LookupContract = {
        id: head.id,
        code: head.code,
        customerName: head.customerName,
        signedDate: signed.get(head.id) ?? null,
        status: head.status,
        onSite: held.get(head.id) ?? { piecesMilli: 0, kgMilli: 0 },
      };
      const owned = money?.get(head.id);
      return owned ? { ...row, money: owned } : row;
    });
    return {
      siteId,
      code: first.siteCode,
      name: first.siteName,
      provinceName: province?.name ?? null,
      regionLabel: province ? REGION_LABELS[province.region] : null,
      onSite: contracts.reduce((sum, entry) => addTotals(sum, entry.onSite), {
        piecesMilli: 0,
        kgMilli: 0,
      }),
      contracts,
    };
  });
}
