// D4: contracts the user may see (contracts spec "Danh sách hợp đồng D4",
// "Quyền theo loại hợp đồng"). The type filter is in the query itself, so
// a rental-only seller never receives a sale row, not even in the counts.
import { and, desc, eq, ilike, inArray, sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  contract,
  contractDeposit,
  contractLine,
  contractRevision,
  customer,
  site,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import {
  CONTRACT_GROUPS,
  GROUP_STATUSES,
  type ContractGroup,
  type ContractStatus,
  type ContractType,
} from "@/domain/contract";
import { revisionAt } from "@/domain/contract-revision";
import { guaranteeWarnings } from "@/domain/guarantee";
import { viewableContractTypes, type ContractUser } from "@/domain/permissions";
import { escapeLike } from "@/lib/catalog/items";

import type { StoredContent } from "./content";
import { termsOf, valueOf, type RevisionRow } from "./records";

export const CONTRACT_PAGE_SIZE = 20;

export interface ContractFilter {
  group?: ContractGroup;
  type?: ContractType;
  customerId?: string;
  siteId?: string;
  salesUserId?: string;
  q?: string;
  page?: number;
}

export interface ContractListRow {
  id: string;
  code: string;
  type: ContractType;
  customerName: string;
  siteName: string | null;
  status: ContractStatus;
  startDate: string;
  endDate: string | null;
  /** Expected value (rental) or total (sale); null while incomplete. */
  value: number | null;
  /** Guarantee warnings of the revision in force today. */
  warnings: string[];
}

export interface ContractList {
  rows: ContractListRow[];
  counts: Record<ContractGroup, number>;
  types: ContractType[];
  total: number;
  page: number;
  pageCount: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function groupCondition(group: Exclude<ContractGroup, "all">): SQL {
  return inArray(contract.status, [...GROUP_STATUSES[group]]);
}

const emptyCounts = (): Record<ContractGroup, number> =>
  Object.fromEntries(CONTRACT_GROUPS.map((group) => [group, 0])) as Record<
    ContractGroup,
    number
  >;

export async function listContracts(
  db: Database,
  user: ContractUser,
  filter: ContractFilter,
  today: BusinessDate,
): Promise<ContractList> {
  const types = viewableContractTypes(user).filter(
    (type) => !filter.type || filter.type === type,
  );
  const page = filter.page && filter.page > 0 ? filter.page : 1;
  if (types.length === 0) {
    return {
      rows: [],
      counts: emptyCounts(),
      types: viewableContractTypes(user),
      total: 0,
      page,
      pageCount: 1,
    };
  }
  const base: SQL[] = [inArray(contract.type, types)];
  if (filter.customerId && UUID.test(filter.customerId)) {
    base.push(eq(contract.customerId, filter.customerId));
  }
  if (filter.siteId && UUID.test(filter.siteId)) {
    base.push(eq(contract.siteId, filter.siteId));
  }
  if (filter.salesUserId) {
    base.push(eq(contract.salesUserId, filter.salesUserId));
  }
  const q = filter.q?.trim();
  if (q) base.push(ilike(contract.code, `%${escapeLike(q.toUpperCase())}%`));

  const [countRow] = await db
    .select({
      all: sql<number>`count(*)::int`,
      pending: sql<number>`(count(*) filter (where ${groupCondition("pending")}))::int`,
      active: sql<number>`(count(*) filter (where ${groupCondition("active")}))::int`,
      ended: sql<number>`(count(*) filter (where ${groupCondition("ended")}))::int`,
    })
    .from(contract)
    .where(and(...base));
  const counts = countRow ?? emptyCounts();
  const group = filter.group ?? "all";
  const where =
    group === "all" ? and(...base) : and(...base, groupCondition(group));
  const total = group === "all" ? counts.all : counts[group];
  const pageCount = Math.max(1, Math.ceil(total / CONTRACT_PAGE_SIZE));

  const heads = await db
    .select({
      id: contract.id,
      code: contract.code,
      type: contract.type,
      status: contract.status,
      customerName: customer.name,
      siteName: site.name,
    })
    .from(contract)
    .innerJoin(customer, eq(customer.id, contract.customerId))
    .leftJoin(site, eq(site.id, contract.siteId))
    .where(where)
    .orderBy(desc(contract.createdAt), desc(contract.code))
    .limit(CONTRACT_PAGE_SIZE)
    .offset((page - 1) * CONTRACT_PAGE_SIZE);
  const rows = await withTerms(db, heads, today);
  return {
    rows,
    counts,
    types: viewableContractTypes(user),
    total,
    page,
    pageCount,
  };
}

type Head = {
  id: string;
  code: string;
  type: string;
  status: string;
  customerName: string;
  siteName: string | null;
};

/** Dates, value and warnings of a page of contracts, in three queries. */
async function withTerms(
  db: Database,
  heads: readonly Head[],
  today: BusinessDate,
): Promise<ContractListRow[]> {
  if (heads.length === 0) return [];
  const revisions = await db
    .select()
    .from(contractRevision)
    .where(
      inArray(
        contractRevision.contractId,
        heads.map((head) => head.id),
      ),
    );
  const shown = new Map<string, RevisionRow>();
  for (const head of heads) {
    const own = revisions.filter((row) => row.contractId === head.id);
    const chosen =
      revisionAt(own, today) ?? own.find((row) => row.number === 0);
    if (chosen) shown.set(head.id, chosen);
  }
  const ids = [...shown.values()].map((row) => row.id);
  const [lines, deposits] = await Promise.all([
    db
      .select({
        revisionId: contractLine.revisionId,
        itemId: contractLine.itemId,
        condition: contractLine.condition,
        pricingUnit: contractLine.pricingUnit,
        ownQuantity: contractLine.ownQuantity,
        quantity: contractLine.quantity,
        price: contractLine.price,
        catalogPrice: contractLine.catalogPrice,
      })
      .from(contractLine)
      .where(inArray(contractLine.revisionId, ids)),
    db
      .select({
        revisionId: contractDeposit.revisionId,
        kind: contractDeposit.kind,
        guaranteeNumber: contractDeposit.guaranteeNumber,
        expiryDate: contractDeposit.expiryDate,
      })
      .from(contractDeposit)
      .where(inArray(contractDeposit.revisionId, ids)),
  ]);
  return heads.map((head) => {
    const revision = shown.get(head.id);
    const type = head.type as ContractType;
    const status = head.status as ContractStatus;
    const content: StoredContent = {
      kits: [],
      lines: lines.filter((line) => line.revisionId === revision?.id),
      compensations: [],
      deposits: [],
      batches: [],
    };
    const inForce = status === "APPROVED" || status === "ACTIVE";
    const warnings = inForce
      ? deposits
          .filter(
            (deposit) =>
              deposit.revisionId === revision?.id &&
              deposit.kind === "GUARANTEE" &&
              deposit.expiryDate,
          )
          .flatMap((deposit) =>
            guaranteeWarnings({
              guaranteeNumber: deposit.guaranteeNumber ?? "",
              expiryDate: deposit.expiryDate as BusinessDate,
              today,
              contractEndDate: null,
            }).map((warning) => warning.message),
          )
      : [];
    return {
      id: head.id,
      code: head.code,
      type,
      customerName: head.customerName,
      siteName: head.siteName,
      status,
      startDate: revision?.startDate ?? "",
      endDate: revision?.endDate ?? null,
      value: revision ? valueOf(type, termsOf(revision), content) : null,
      warnings,
    };
  });
}
