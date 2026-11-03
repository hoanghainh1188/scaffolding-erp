// Reading compensation notes (returns-and-compensation design D11, D12): the
// list with its status filter, D8 and the block on D5. Rental contract
// readers only; the storekeeper and the workshop see none of it.
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "@/db/client";
import {
  compensationNote,
  compensationNoteLine,
  contract,
  contractRevision,
  customer,
  item,
  returnNote,
  returnPhoto,
  site,
  user,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import {
  COMPENSATION_STATUSES,
  compensationLineAmount,
  compensationTotal,
  type CompensationKind,
  type CompensationStatus,
} from "@/domain/compensation";
import type { OverdueDebt } from "@/domain/contract";
import { can, canContract } from "@/domain/permissions";
import type { QuantityUnit } from "@/domain/quantity";
import { notFound, ok, type ServiceResult } from "@/lib/catalog/common";
import { forbidden, type ContractActor } from "@/lib/contracts/common";
import { overdueDebt } from "@/lib/contracts/overdue";
import { isUuid, milliOf } from "@/lib/deliveries/records";

type Reader = Pick<Database, "select">;
type ReadingActor = Pick<ContractActor, "role" | "contractScope">;

export const canReadCompensations = (actor: ReadingActor): boolean =>
  canContract(actor, "RENTAL", "view");

export function parseCompensationStatus(
  value: string | null | undefined,
): CompensationStatus | "ALL" {
  const upper = value?.toUpperCase();
  if (upper === "ALL") return "ALL";
  return (COMPENSATION_STATUSES as readonly string[]).includes(upper ?? "")
    ? (upper as CompensationStatus)
    : "PENDING";
}

export interface CompensationLineView {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: QuantityUnit;
  kind: CompensationKind;
  quantityMilli: number;
  unitPrice: number | null;
  contractPrice: number | null;
  amount: number | null;
}

async function linesOf(
  db: Reader,
  noteIds: readonly string[],
): Promise<Map<string, CompensationLineView[]>> {
  if (noteIds.length === 0) return new Map();
  const rows = await db
    .select({
      noteId: compensationNoteLine.noteId,
      itemId: compensationNoteLine.itemId,
      itemCode: item.code,
      itemName: item.name,
      unit: item.unit,
      kind: compensationNoteLine.kind,
      quantity: compensationNoteLine.quantity,
      unitPrice: compensationNoteLine.unitPrice,
      contractPrice: compensationNoteLine.contractPrice,
    })
    .from(compensationNoteLine)
    .innerJoin(item, eq(item.id, compensationNoteLine.itemId))
    .where(inArray(compensationNoteLine.noteId, [...noteIds]));
  const order = { DAMAGED: 0, SCRAPPED: 1, LOST: 2 } as const;
  const byNote = new Map<string, CompensationLineView[]>();
  for (const row of rows) {
    const kind = row.kind as CompensationKind;
    const quantityMilli = milliOf(row.quantity);
    const view: CompensationLineView = {
      itemId: row.itemId,
      itemCode: row.itemCode,
      itemName: row.itemName,
      unit: row.unit as QuantityUnit,
      kind,
      quantityMilli,
      unitPrice: row.unitPrice,
      contractPrice: row.contractPrice,
      amount: compensationLineAmount({
        itemCode: row.itemCode,
        kind,
        quantityMilli,
        unitPrice: row.unitPrice,
      }),
    };
    byNote.set(row.noteId, [...(byNote.get(row.noteId) ?? []), view]);
  }
  for (const lines of byNote.values()) {
    lines.sort(
      (a, b) =>
        a.itemCode.localeCompare(b.itemCode, "vi") ||
        order[a.kind] - order[b.kind],
    );
  }
  return byNote;
}

const totalOf = (lines: readonly CompensationLineView[]) =>
  compensationTotal(lines);

export interface CompensationListRow {
  id: string;
  code: string;
  status: CompensationStatus;
  customerName: string;
  siteName: string;
  contractCode: string;
  returnCode: string;
  returnDate: BusinessDate;
  /** Amount due once approved, the priced total before. */
  amount: number;
}

const approver = alias(user, "approver");

async function listRows(
  db: Reader,
  where: SQL | undefined,
): Promise<CompensationListRow[]> {
  const rows = await db
    .select({
      id: compensationNote.id,
      code: compensationNote.code,
      status: compensationNote.status,
      amountDue: compensationNote.amountDue,
      customerName: customer.name,
      siteName: site.name,
      contractCode: contract.code,
      returnCode: returnNote.code,
      returnDate: returnNote.businessDate,
    })
    .from(compensationNote)
    .innerJoin(returnNote, eq(returnNote.id, compensationNote.returnNoteId))
    .innerJoin(contract, eq(contract.id, compensationNote.contractId))
    .innerJoin(customer, eq(customer.id, contract.customerId))
    .leftJoin(site, eq(site.id, contract.siteId))
    .where(where)
    .orderBy(desc(compensationNote.createdAt), desc(compensationNote.code));
  const lines = await linesOf(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    status: row.status as CompensationStatus,
    customerName: row.customerName,
    siteName: row.siteName ?? "",
    contractCode: row.contractCode,
    returnCode: row.returnCode,
    returnDate: row.returnDate as BusinessDate,
    amount: row.amountDue ?? totalOf(lines.get(row.id) ?? []),
  }));
}

/** `/sales/compensations`, newest first, Chờ duyệt by default. */
export async function compensationList(
  db: Reader,
  actor: ReadingActor,
  status: CompensationStatus | "ALL",
): Promise<ServiceResult<CompensationListRow[]>> {
  if (!canReadCompensations(actor)) return forbidden();
  return ok(
    await listRows(
      db,
      status === "ALL" ? undefined : eq(compensationNote.status, status),
    ),
  );
}

/** The "Đền bù" block of D5. */
export async function contractCompensations(
  db: Reader,
  contractId: string,
): Promise<CompensationListRow[]> {
  return listRows(db, eq(compensationNote.contractId, contractId));
}

export interface CompensationDetail {
  id: string;
  code: string;
  status: CompensationStatus;
  createdAt: Date;
  updatedAt: string;
  contract: { id: string; code: string };
  customerName: string;
  siteName: string;
  returnNote: {
    code: string;
    businessDate: BusinessDate;
    postedByName: string;
    vehiclePlate: string | null;
    photos: { id: string; caption: string | null }[];
  };
  lines: CompensationLineView[];
  total: number;
  discountAmount: number;
  discountReason: string | null;
  approvalReason: string | null;
  rejectedReason: string | null;
  amountDue: number | null;
  approvedByName: string | null;
  approvedDate: BusinessDate | null;
  dueDate: BusinessDate | null;
  paymentTermsDays: number;
  overdue: OverdueDebt;
  canApprove: boolean;
}

/** D8 by code or id. */
export async function compensationDetail(
  db: Reader,
  actor: ReadingActor,
  ref: string,
): Promise<ServiceResult<CompensationDetail>> {
  if (!canReadCompensations(actor)) return forbidden();
  const [row] = await db
    .select({
      id: compensationNote.id,
      code: compensationNote.code,
      status: compensationNote.status,
      createdAt: compensationNote.createdAt,
      updatedAt: compensationNote.updatedAt,
      contractId: contract.id,
      contractCode: contract.code,
      customerId: contract.customerId,
      customerName: customer.name,
      siteName: site.name,
      returnId: returnNote.id,
      returnCode: returnNote.code,
      returnDate: returnNote.businessDate,
      vehiclePlate: returnNote.vehiclePlate,
      postedByName: user.name,
      discountAmount: compensationNote.discountAmount,
      discountReason: compensationNote.discountReason,
      approvalReason: compensationNote.approvalReason,
      rejectedReason: compensationNote.rejectedReason,
      amountDue: compensationNote.amountDue,
      approvedByName: approver.name,
      approvedDate: compensationNote.approvedDate,
      dueDate: compensationNote.dueDate,
      paymentTermsDays: contractRevision.paymentTermsDays,
    })
    .from(compensationNote)
    .innerJoin(returnNote, eq(returnNote.id, compensationNote.returnNoteId))
    .innerJoin(user, eq(user.id, returnNote.postedBy))
    .innerJoin(contract, eq(contract.id, compensationNote.contractId))
    .innerJoin(customer, eq(customer.id, contract.customerId))
    .innerJoin(
      contractRevision,
      eq(contractRevision.id, compensationNote.revisionId),
    )
    .leftJoin(site, eq(site.id, contract.siteId))
    .leftJoin(approver, eq(approver.id, compensationNote.approvedBy))
    .where(
      isUuid(ref)
        ? eq(compensationNote.id, ref)
        : eq(compensationNote.code, ref),
    );
  if (!row) return notFound();
  const lines = (await linesOf(db, [row.id])).get(row.id) ?? [];
  const photos = await db
    .select({ id: returnPhoto.id, caption: returnPhoto.caption })
    .from(returnPhoto)
    .where(eq(returnPhoto.returnNoteId, row.returnId))
    .orderBy(returnPhoto.position);
  return ok({
    id: row.id,
    code: row.code,
    status: row.status as CompensationStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt.toISOString(),
    contract: { id: row.contractId, code: row.contractCode },
    customerName: row.customerName,
    siteName: row.siteName ?? "",
    returnNote: {
      code: row.returnCode,
      businessDate: row.returnDate as BusinessDate,
      postedByName: row.postedByName,
      vehiclePlate: row.vehiclePlate,
      photos,
    },
    lines,
    total: totalOf(lines),
    discountAmount: row.discountAmount,
    discountReason: row.discountReason,
    approvalReason: row.approvalReason,
    rejectedReason: row.rejectedReason,
    amountDue: row.amountDue,
    approvedByName: row.approvedByName,
    approvedDate: row.approvedDate as BusinessDate | null,
    dueDate: row.dueDate as BusinessDate | null,
    paymentTermsDays: row.paymentTermsDays,
    overdue:
      row.status === "PENDING"
        ? await overdueDebt(db, row.customerId)
        : { amount: 0, days: 0 },
    canApprove:
      row.status === "PENDING" && can(actor.role, "compensations.approve"),
  });
}
