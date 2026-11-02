// Reading contracts for D5, D5a, D5b and the print page (contracts design
// D14). Totals, checks and warnings are computed on every read; nothing
// derived is stored. Access is checked here too (canContract "view").
import { and, asc, eq, inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  contract,
  customer,
  item,
  kit,
  kitComponent,
  site,
  user,
} from "@/db/schema";
import type { FieldChange } from "@/domain/activity-changes";
import {
  addDays,
  isBusinessDate,
  type BusinessDate,
} from "@/domain/business-date";
import type {
  ContractStatus,
  ContractType,
  RevisionStatus,
} from "@/domain/contract";
import { amendable } from "@/domain/contract";
import { diffRevisions, revisionAt } from "@/domain/contract-revision";
import { can, canContract, type ContractUser } from "@/domain/permissions";
import { expectedValue, monthDisplay, type MonthFigure } from "@/domain/rental";
import {
  notFound,
  ok,
  runService,
  type ServiceResult,
} from "@/lib/catalog/common";

import { lastClosedPeriodEnd } from "./billing-lock";
import { contractChecks, type ContractChecks } from "./checks";
import { forbidden } from "./common";
import {
  comparable,
  readContent,
  type StoredContent,
  type Terms,
} from "./content";
import {
  companyToken,
  customerTokenFor,
  previewContractCode,
} from "./numbering";
import { overdueDebt } from "./overdue";
import { contractTermsAt, type ContractTerms } from "./terms";
import {
  dayRentOf,
  latestApproved,
  openAmendment,
  readRevisions,
  termsOf,
  valueOf,
  type RevisionRow,
} from "./records";

type Reader = Pick<Database, "select">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ----------------------------------------------------------- views

export interface LineView {
  itemId: string;
  code: string;
  name: string;
  unit: string;
  condition: string | null;
  pricingUnit: string;
  ownQuantity: string;
  quantity: string;
  price: number | null;
  catalogPrice: number | null;
}

export interface KitView {
  kitId: string;
  code: string;
  name: string;
  quantity: number;
  components: { itemId: string; code: string; quantity: number }[];
}

export interface CompensationView {
  itemId: string;
  code: string;
  name: string;
  unit: string;
  lostPrice: number | null;
  damagePrice: number | null;
  catalogLostPrice: number | null;
  catalogDamagePrice: number | null;
}

export interface BatchView {
  plannedDate: string;
  note: string | null;
  lines: {
    kitId: string | null;
    itemId: string | null;
    code: string;
    name: string;
    quantity: string;
  }[];
}

export interface PersonStamp {
  name: string;
  at: string;
}

export interface RevisionView {
  id: string;
  number: number;
  kind: string;
  code: string;
  status: RevisionStatus;
  effectiveFrom: string;
  reason: string | null;
  terms: Terms;
  kits: KitView[];
  lines: LineView[];
  compensations: CompensationView[];
  deposits: StoredContent["deposits"];
  batches: BatchView[];
  dayRent: number;
  months: MonthFigure[];
  /** Expected value (rental) or total (sale); null while incomplete. */
  value: number | null;
  expectedDays: { days: number; minimumApplied: boolean } | null;
  submitted: PersonStamp | null;
  approved: PersonStamp | null;
  approvalReason: string | null;
  overdueAmount: number | null;
  overdueDays: number | null;
  returnedReason: string | null;
  cancelledReason: string | null;
  updatedAt: string;
}

export interface ContractHead {
  id: string;
  code: string;
  type: ContractType;
  status: ContractStatus;
  customer: {
    id: string;
    code: string;
    name: string;
    paymentTermsDays: number;
  };
  site: {
    id: string;
    code: string;
    name: string;
    address: string | null;
  } | null;
  salesUser: { id: string; name: string } | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RevisionSummary {
  number: number;
  code: string;
  kind: string;
  status: RevisionStatus;
  effectiveFrom: string;
}

export interface ContractPermissions {
  edit: boolean;
  approve: boolean;
  amend: boolean;
  cancel: boolean;
}

export interface ContractDetail {
  head: ContractHead;
  /** The revision D5 shows: the original until approval, then the latest approved. */
  shown: RevisionView;
  revisions: RevisionSummary[];
  /** The draft or pending amendment, if any. */
  openAmendment: RevisionSummary | null;
  checks: ContractChecks;
  can: ContractPermissions;
}

// ----------------------------------------------------------- reading

async function headOf(tx: Reader, id: string): Promise<ContractHead | null> {
  const [row] = await tx
    .select({
      id: contract.id,
      code: contract.code,
      type: contract.type,
      status: contract.status,
      createdAt: contract.createdAt,
      updatedAt: contract.updatedAt,
      salesUserId: contract.salesUserId,
      createdBy: contract.createdBy,
      customerId: customer.id,
      customerCode: customer.code,
      customerName: customer.name,
      paymentTermsDays: customer.paymentTermsDays,
      siteId: site.id,
      siteCode: site.code,
      siteName: site.name,
      siteAddress: site.address,
    })
    .from(contract)
    .innerJoin(customer, eq(customer.id, contract.customerId))
    .leftJoin(site, eq(site.id, contract.siteId))
    .where(eq(contract.id, id));
  if (!row) return null;
  const names = await userNames(tx, [row.salesUserId, row.createdBy]);
  return {
    id: row.id,
    code: row.code,
    type: row.type as ContractType,
    status: row.status as ContractStatus,
    customer: {
      id: row.customerId,
      code: row.customerCode,
      name: row.customerName,
      paymentTermsDays: row.paymentTermsDays,
    },
    site: row.siteId
      ? {
          id: row.siteId,
          code: row.siteCode ?? "",
          name: row.siteName ?? "",
          address: row.siteAddress,
        }
      : null,
    salesUser: row.salesUserId
      ? { id: row.salesUserId, name: names.get(row.salesUserId) ?? "" }
      : null,
    createdBy: names.get(row.createdBy) ?? "",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function userNames(tx: Reader, ids: readonly (string | null)[]) {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const rows = wanted.length
    ? await tx
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(inArray(user.id, wanted))
    : [];
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** A revision with codes, names and figures, as the screens show it. */
export async function revisionView(
  tx: Reader,
  type: ContractType,
  row: RevisionRow,
): Promise<RevisionView> {
  const content = await readContent(tx, row.id);
  const kitIds = [
    ...new Set([
      ...content.kits.map((entry) => entry.kitId),
      ...content.batches.flatMap((batch) =>
        batch.lines.flatMap((line) => (line.kitId ? [line.kitId] : [])),
      ),
    ]),
  ];
  const [kits, parts] = kitIds.length
    ? await Promise.all([
        tx
          .select({ id: kit.id, code: kit.code, name: kit.name })
          .from(kit)
          .where(inArray(kit.id, kitIds)),
        tx
          .select({
            kitId: kitComponent.kitId,
            itemId: kitComponent.itemId,
            quantity: kitComponent.quantity,
          })
          .from(kitComponent)
          .where(inArray(kitComponent.kitId, kitIds)),
      ])
    : [[], []];
  const itemIds = [
    ...new Set([
      ...content.lines.map((line) => line.itemId),
      ...parts.map((part) => part.itemId),
      ...content.batches.flatMap((batch) =>
        batch.lines.flatMap((line) => (line.itemId ? [line.itemId] : [])),
      ),
    ]),
  ];
  const items = itemIds.length
    ? await tx
        .select({
          id: item.id,
          code: item.code,
          name: item.name,
          unit: item.unit,
        })
        .from(item)
        .where(inArray(item.id, itemIds))
    : [];
  const itemOf = new Map(items.map((entry) => [entry.id, entry]));
  const kitOf = new Map(kits.map((entry) => [entry.id, entry]));
  const people = await userNames(tx, [row.submittedBy, row.approvedBy]);
  const stamp = (id: string | null, at: Date | null) =>
    id && at ? { name: people.get(id) ?? "", at: at.toISOString() } : null;
  const terms = termsOf(row);
  const dayRent = type === "RENTAL" ? dayRentOf(content) : 0;
  const expected =
    type === "RENTAL" && terms.endDate && terms.endDate > terms.startDate
      ? expectedValue({
          dailyTotal: dayRent,
          startDate: terms.startDate as BusinessDate,
          endDate: terms.endDate as BusinessDate,
          minDays: terms.minRentalDays ?? 0,
        })
      : null;
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    code: row.code,
    status: row.status as RevisionStatus,
    effectiveFrom: row.effectiveFrom,
    reason: row.reason,
    terms,
    kits: content.kits.map((entry) => ({
      kitId: entry.kitId,
      code: kitOf.get(entry.kitId)?.code ?? "",
      name: kitOf.get(entry.kitId)?.name ?? "",
      quantity: entry.quantity,
      components: parts
        .filter((part) => part.kitId === entry.kitId)
        .map((part) => ({
          itemId: part.itemId,
          code: itemOf.get(part.itemId)?.code ?? "",
          quantity: part.quantity,
        })),
    })),
    lines: content.lines.map((line) => ({
      ...line,
      code: itemOf.get(line.itemId)?.code ?? "",
      name: itemOf.get(line.itemId)?.name ?? "",
      unit: itemOf.get(line.itemId)?.unit ?? "PIECE",
    })),
    compensations: content.compensations.map((entry) => ({
      ...entry,
      code: itemOf.get(entry.itemId)?.code ?? "",
      name: itemOf.get(entry.itemId)?.name ?? "",
      unit: itemOf.get(entry.itemId)?.unit ?? "PIECE",
    })),
    deposits: content.deposits,
    batches: content.batches.map((batch) => ({
      plannedDate: batch.plannedDate,
      note: batch.note,
      lines: batch.lines.map((line) => ({
        ...line,
        code: line.kitId
          ? (kitOf.get(line.kitId)?.code ?? "")
          : (itemOf.get(line.itemId ?? "")?.code ?? ""),
        name: line.kitId
          ? (kitOf.get(line.kitId)?.name ?? "")
          : (itemOf.get(line.itemId ?? "")?.name ?? ""),
      })),
    })),
    dayRent,
    months: type === "RENTAL" ? monthDisplay(dayRent) : [],
    value: valueOf(type, terms, content),
    expectedDays: expected
      ? { days: expected.days, minimumApplied: expected.minimumApplied }
      : null,
    submitted: stamp(row.submittedBy, row.submittedAt),
    approved: stamp(row.approvedBy, row.approvedAt),
    approvalReason: row.approvalReason,
    overdueAmount: row.overdueAmount,
    overdueDays: row.overdueDays,
    returnedReason: row.returnedReason,
    cancelledReason: row.cancelledReason,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const summaryOf = (row: RevisionRow): RevisionSummary => ({
  number: row.number,
  code: row.code,
  kind: row.kind,
  status: row.status as RevisionStatus,
  effectiveFrom: row.effectiveFrom,
});

/** D5: the contract, the revision in force, its checks and what the user may do. */
export async function getContractDetail(
  db: Database,
  viewer: ContractUser,
  id: string,
  today: BusinessDate,
): Promise<ServiceResult<ContractDetail>> {
  if (!UUID.test(id)) return notFound();
  const head = await headOf(db, id);
  if (!head) return notFound();
  if (!canContract(viewer, head.type, "view")) return forbidden();
  const revisions = await readRevisions(db, id);
  const original = revisions.find((row) => row.number === 0);
  if (!original) return notFound();
  const shownRow =
    head.status === "DRAFT" || head.status === "PENDING"
      ? original
      : (latestApproved(revisions) ?? original);
  const shown = await revisionView(db, head.type, shownRow);
  const content = await readContent(db, shownRow.id);
  const manage = canContract(viewer, head.type, "manage");
  const approver = can(viewer.role, "contracts.approve");
  const open = openAmendment(revisions);
  return ok({
    head,
    shown,
    revisions: revisions.map(summaryOf),
    openAmendment: open ? summaryOf(open) : null,
    checks: await contractChecks(db, {
      type: head.type,
      endDate: shown.terms.endDate,
      content,
      overdue: await overdueDebt(db, head.customer.id),
      today,
    }),
    can: {
      edit: manage && head.status === "DRAFT",
      approve: approver && head.status === "PENDING",
      amend: manage && amendable(head.status) && !open,
      cancel:
        (head.status === "DRAFT" && manage) ||
        (head.status === "APPROVED" && approver),
    },
  });
}

export interface AmendmentImpact {
  lastClosedEnd: string | null;
  /** First day after the closed period, up to the day before the effective date. */
  oldPriceFrom: string | null;
  oldPriceTo: string | null;
  newPriceFrom: string;
}

export interface AmendmentDetail {
  head: ContractHead;
  amendment: RevisionView;
  base: RevisionView;
  changes: FieldChange[];
  impact: AmendmentImpact;
  revisions: RevisionSummary[];
  can: ContractPermissions;
}

/** D5b: the amendment, the copy it changes and the effect on billing. */
export async function getAmendmentDetail(
  db: Database,
  viewer: ContractUser,
  id: string,
  number: number,
): Promise<ServiceResult<AmendmentDetail>> {
  if (!UUID.test(id) || !Number.isInteger(number) || number < 1) {
    return notFound();
  }
  const head = await headOf(db, id);
  if (!head) return notFound();
  if (!canContract(viewer, head.type, "view")) return forbidden();
  const revisions = await readRevisions(db, id);
  const row = revisions.find(
    (entry) => entry.number === number && entry.kind === "AMENDMENT",
  );
  if (!row) return notFound();
  const baseRow =
    revisions.find((entry) => entry.id === row.basedOnRevisionId) ??
    latestApproved(revisions.filter((entry) => entry.number < number));
  if (!baseRow) return notFound();
  const [amendment, base] = await Promise.all([
    revisionView(db, head.type, row),
    revisionView(db, head.type, baseRow),
  ]);
  const compareHead = {
    type: head.type,
    customerId: head.customer.code,
    siteId: head.site?.code ?? null,
  };
  let changes: FieldChange[] = [];
  try {
    changes = diffRevisions(
      await comparable(
        db,
        compareHead,
        termsOf(baseRow),
        await readContent(db, baseRow.id),
      ),
      await comparable(
        db,
        compareHead,
        termsOf(row),
        await readContent(db, row.id),
      ),
    );
  } catch {
    changes = [];
  }
  const lastClosedEnd = await lastClosedPeriodEnd(db, id);
  const oldFrom = lastClosedEnd
    ? addDays(lastClosedEnd as BusinessDate, 1)
    : (revisions.find((entry) => entry.number === 0)?.startDate ?? null);
  const oldTo = addDays(row.effectiveFrom as BusinessDate, -1);
  const manage = canContract(viewer, head.type, "manage");
  const approver = can(viewer.role, "contracts.approve");
  const open = row.status === "DRAFT" || row.status === "PENDING";
  return ok({
    head,
    amendment,
    base,
    changes,
    impact: {
      lastClosedEnd,
      oldPriceFrom: oldFrom && oldFrom <= oldTo ? oldFrom : null,
      oldPriceTo: oldFrom && oldFrom <= oldTo ? oldTo : null,
      newPriceFrom: row.effectiveFrom,
    },
    revisions: revisions.map(summaryOf),
    can: {
      edit: manage && row.status === "DRAFT" && amendable(head.status),
      approve: approver && row.status === "PENDING" && amendable(head.status),
      amend: false,
      cancel: manage && open && amendable(head.status),
    },
  });
}

/** The revision applying on a day, for the terms route and the D4 row. */
export async function revisionOn(
  db: Reader,
  id: string,
  date: string,
): Promise<RevisionRow | null> {
  return revisionAt(await readRevisions(db, id), date);
}

// ----------------------------------------------------------- D5a options

export interface FormOptions {
  customers: {
    id: string;
    code: string;
    name: string;
    paymentTermsDays: number;
    salesUserName: string | null;
  }[];
  sites: {
    id: string;
    code: string;
    name: string;
    customerId: string;
    address: string | null;
  }[];
  items: {
    id: string;
    code: string;
    name: string;
    unit: string;
    standardWeightKg: string | null;
    dailyRentalPrice: number | null;
    lostPrice: number | null;
    damagePrice: number | null;
  }[];
  kits: {
    id: string;
    code: string;
    name: string;
    components: { itemId: string; quantity: number }[];
  }[];
  /** Contract types the user may draft. */
  types: ContractType[];
}

/** Active customers, sites, items and kits for D5a. */
export async function formOptions(
  db: Database,
  viewer: ContractUser,
): Promise<FormOptions> {
  const [customers, sites, items, kits, parts] = await Promise.all([
    db
      .select({
        id: customer.id,
        code: customer.code,
        name: customer.name,
        paymentTermsDays: customer.paymentTermsDays,
        salesUserName: user.name,
      })
      .from(customer)
      .leftJoin(user, eq(user.id, customer.salesUserId))
      .where(eq(customer.status, "ACTIVE"))
      .orderBy(asc(customer.code)),
    db
      .select({
        id: site.id,
        code: site.code,
        name: site.name,
        customerId: site.customerId,
        address: site.address,
      })
      .from(site)
      .where(eq(site.status, "ACTIVE"))
      .orderBy(asc(site.code)),
    db
      .select({
        id: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
        standardWeightKg: item.standardWeightKg,
        dailyRentalPrice: item.dailyRentalPrice,
        lostPrice: item.lostPrice,
        damagePrice: item.damagePrice,
      })
      .from(item)
      .where(eq(item.status, "ACTIVE"))
      .orderBy(asc(item.code)),
    db
      .select({ id: kit.id, code: kit.code, name: kit.name })
      .from(kit)
      .where(eq(kit.status, "ACTIVE"))
      .orderBy(asc(kit.code)),
    db
      .select({
        kitId: kitComponent.kitId,
        itemId: kitComponent.itemId,
        quantity: kitComponent.quantity,
      })
      .from(kitComponent)
      .innerJoin(
        kit,
        and(eq(kit.id, kitComponent.kitId), eq(kit.status, "ACTIVE")),
      ),
  ]);
  return {
    customers,
    sites,
    items,
    kits: kits.map((entry) => ({
      ...entry,
      components: parts
        .filter((part) => part.kitId === entry.id)
        .map(({ itemId, quantity }) => ({ itemId, quantity })),
    })),
    types: (["RENTAL", "SALE"] as const).filter((type) =>
      canContract(viewer, type, "manage"),
    ),
  };
}

// ----------------------------------------------------------- small reads

export const TERMS_MESSAGES = {
  date: "Ngày không hợp lệ",
} as const;

/** GET .../terms?date=: the terms on a day, for a viewer of the contract. */
export async function termsFor(
  db: Database,
  viewer: ContractUser,
  id: string,
  date: string | null,
): Promise<ServiceResult<ContractTerms | null>> {
  if (!date || !isBusinessDate(date)) {
    return { ok: false, status: 400, error: TERMS_MESSAGES.date };
  }
  if (!UUID.test(id)) return notFound();
  const [row] = await db
    .select({ type: contract.type })
    .from(contract)
    .where(eq(contract.id, id));
  if (!row) return notFound();
  if (!canContract(viewer, row.type as ContractType, "view")) {
    return forbidden();
  }
  return ok(await contractTermsAt(db, id, date));
}

export interface CodePreview {
  code: string;
  customerToken: string;
}

/** D5a: the number the draft would get, without taking it. */
export async function codePreview(
  db: Database,
  viewer: ContractUser,
  input: {
    customerId: string | null;
    startDate: string | null;
    customerToken: string | null;
  },
): Promise<ServiceResult<CodePreview>> {
  if (
    !(["RENTAL", "SALE"] as const).some((type) =>
      canContract(viewer, type, "manage"),
    )
  ) {
    return forbidden();
  }
  if (!input.customerId || !UUID.test(input.customerId)) return notFound();
  if (!input.startDate || !isBusinessDate(input.startDate)) {
    return { ok: false, status: 400, error: TERMS_MESSAGES.date };
  }
  return runService(async () => {
    const [buyer] = await db
      .select({ id: customer.id, code: customer.code })
      .from(customer)
      .where(eq(customer.id, input.customerId ?? ""));
    if (!buyer) return notFound();
    const short = await companyToken(db);
    let token: string;
    try {
      token = await customerTokenFor(db, buyer, input.customerToken);
    } catch (error: unknown) {
      return {
        ok: false,
        status: 422,
        error: (error as Error).message,
        field: "customerToken",
      };
    }
    return ok({
      code: await previewContractCode(db, short, token, input.startDate ?? ""),
      customerToken: token,
    });
  });
}
