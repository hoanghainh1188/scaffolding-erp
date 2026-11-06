// Documents waiting for the director (dashboard-basic design D1, 0.2 #94):
// contracts and amendments, compensation and buy-back notes, submitted
// stocktakes and stock adjustments. The director approves all of them;
// the accountant and sales follow what they may read. The greeting counts
// exactly these rows. Amounts are those of the source screens.
import { asc, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  buyBackNote,
  buyBackNoteLine,
  compensationNote,
  contract,
  contractRevision,
  customer,
  site,
  stockAdjustment,
  stockAdjustmentLine,
  stocktake,
} from "@/db/schema";
import { buyBackTotal } from "@/domain/buy-back";
import type { ContractType } from "@/domain/contract";
import { can, canContract, type ContractUser } from "@/domain/permissions";
import {
  ADJUSTMENT_KIND_LABELS,
  type AdjustmentKind,
} from "@/domain/stock-adjustment";
import { compensationList } from "@/lib/compensations/queries";
import { readContent } from "@/lib/contracts/content";
import { milliOf, termsOf, valueOf } from "@/lib/contracts/records";
import { listStocktakes } from "@/lib/stocktakes/queries";

export type ApprovalKind =
  | "CONTRACT"
  | "AMENDMENT"
  | "COMPENSATION"
  | "BUY_BACK"
  | "STOCKTAKE"
  | "STOCK_ADJUSTMENT";

export const APPROVAL_KIND_LABELS: Readonly<Record<ApprovalKind, string>> = {
  CONTRACT: "Hợp đồng",
  AMENDMENT: "Phụ lục",
  COMPENSATION: "Phiếu đền bù",
  BUY_BACK: "Phiếu mua lại",
  STOCKTAKE: "Phiên kiểm kê",
  STOCK_ADJUSTMENT: "Phiếu điều chỉnh kho",
};

export interface ApprovalRow {
  kind: ApprovalKind;
  /** "Hợp đồng thuê", "Phụ lục", "Phiếu đền bù"… */
  label: string;
  code: string;
  /** Customer · site, or the location. */
  party: string;
  summary: string;
  amount: number | null;
  sentAt: Date;
  href: string;
}

const CONTRACT_TYPE_LABELS: Readonly<Record<ContractType, string>> = {
  RENTAL: "Hợp đồng thuê",
  SALE: "Hợp đồng bán",
};

const joinParts = (...parts: (string | null | undefined)[]) =>
  parts.filter(Boolean).join(" · ");

async function revisions(
  db: Database,
  viewer: ContractUser,
): Promise<ApprovalRow[]> {
  const rows = await db
    .select({
      revision: contractRevision,
      contractId: contract.id,
      type: contract.type,
      customerName: customer.name,
      siteName: site.name,
    })
    .from(contractRevision)
    .innerJoin(contract, eq(contract.id, contractRevision.contractId))
    .innerJoin(customer, eq(customer.id, contract.customerId))
    .leftJoin(site, eq(site.id, contract.siteId))
    .where(eq(contractRevision.status, "PENDING"));
  const visible = rows.filter((row) =>
    canContract(viewer, row.type as ContractType, "view"),
  );
  return Promise.all(
    visible.map(async (row) => {
      const type = row.type as ContractType;
      const { revision } = row;
      const amendment = revision.kind === "AMENDMENT";
      const content = await readContent(db, revision.id);
      return {
        kind: amendment ? "AMENDMENT" : "CONTRACT",
        label: amendment ? "Phụ lục" : CONTRACT_TYPE_LABELS[type],
        code: revision.code,
        party: joinParts(row.customerName, row.siteName),
        summary: amendment
          ? (revision.reason ?? "")
          : `${content.lines.length} mã hàng`,
        amount: valueOf(type, termsOf(revision), content),
        sentAt: revision.submittedAt ?? revision.updatedAt,
        href: amendment
          ? `/sales/contracts/${row.contractId}/amendments/${revision.number}`
          : `/sales/contracts/${row.contractId}`,
      } satisfies ApprovalRow;
    }),
  );
}

async function compensations(
  db: Database,
  viewer: ContractUser,
): Promise<ApprovalRow[]> {
  const listed = await compensationList(db, viewer, "PENDING");
  if (!listed.ok || listed.data.length === 0) return [];
  const sent = await db
    .select({ id: compensationNote.id, createdAt: compensationNote.createdAt })
    .from(compensationNote)
    .where(
      inArray(
        compensationNote.id,
        listed.data.map((row) => row.id),
      ),
    );
  const sentBy = new Map(sent.map((row) => [row.id, row.createdAt]));
  return listed.data.map((row) => ({
    kind: "COMPENSATION",
    label: APPROVAL_KIND_LABELS.COMPENSATION,
    code: row.code,
    party: joinParts(row.customerName, row.siteName),
    summary: `Phiếu thu hồi ${row.returnCode}`,
    amount: row.amount,
    sentAt: sentBy.get(row.id) ?? new Date(0),
    href: `/sales/compensations/${row.code}`,
  }));
}

async function buyBacks(
  db: Database,
  viewer: ContractUser,
): Promise<ApprovalRow[]> {
  if (!canContract(viewer, "RENTAL", "view")) return [];
  const notes = await db
    .select({
      id: buyBackNote.id,
      code: buyBackNote.code,
      createdAt: buyBackNote.createdAt,
      customerName: customer.name,
      siteName: site.name,
    })
    .from(buyBackNote)
    .innerJoin(contract, eq(contract.id, buyBackNote.contractId))
    .innerJoin(customer, eq(customer.id, contract.customerId))
    .leftJoin(site, eq(site.id, contract.siteId))
    .where(eq(buyBackNote.status, "PENDING"));
  if (notes.length === 0) return [];
  const lines = await db
    .select({
      noteId: buyBackNoteLine.noteId,
      quantity: buyBackNoteLine.quantity,
      unitPrice: buyBackNoteLine.unitPrice,
    })
    .from(buyBackNoteLine)
    .where(
      inArray(
        buyBackNoteLine.noteId,
        notes.map((note) => note.id),
      ),
    );
  return notes.map((note) => {
    const own = lines.filter((line) => line.noteId === note.id);
    return {
      kind: "BUY_BACK",
      label: APPROVAL_KIND_LABELS.BUY_BACK,
      code: note.code,
      party: joinParts(note.customerName, note.siteName),
      summary: `${own.length} mã hàng khách giữ lại`,
      amount: buyBackTotal(
        own.map((line) => ({
          milli: milliOf(line.quantity),
          unitPrice: line.unitPrice,
        })),
      ),
      sentAt: note.createdAt,
      href: `/sales/buy-backs/${note.code}`,
    };
  });
}

async function stocktakes(db: Database): Promise<ApprovalRow[]> {
  const listed = await listStocktakes(db, { status: "SUBMITTED" });
  if (listed.length === 0) return [];
  const sent = await db
    .select({ code: stocktake.code, submittedAt: stocktake.submittedAt })
    .from(stocktake)
    .where(
      inArray(
        stocktake.code,
        listed.map((row) => row.code),
      ),
    );
  const sentBy = new Map(sent.map((row) => [row.code, row.submittedAt]));
  return listed.map((row) => ({
    kind: "STOCKTAKE",
    label: APPROVAL_KIND_LABELS.STOCKTAKE,
    code: row.code,
    party: row.locationCode,
    summary: `Lệch ${row.diffLines ?? 0} dòng`,
    amount: row.diffValue,
    sentAt: sentBy.get(row.code) ?? row.startedAt,
    href: `/inventory/stocktakes/${row.code}`,
  }));
}

async function adjustments(db: Database): Promise<ApprovalRow[]> {
  const rows = await db
    .select({
      id: stockAdjustment.id,
      code: stockAdjustment.code,
      kind: stockAdjustment.kind,
      reason: stockAdjustment.reason,
      sentAt: sql<Date>`coalesce(${stockAdjustment.submittedAt}, ${stockAdjustment.createdAt})`,
      related: stockAdjustment.relatedDocumentCode,
      value: sql<
        string | null
      >`(select sum(${stockAdjustmentLine.valueDelta}) from ${stockAdjustmentLine} where ${stockAdjustmentLine.adjustmentId} = ${stockAdjustment.id})`,
    })
    .from(stockAdjustment)
    .where(eq(stockAdjustment.status, "PENDING_APPROVAL"))
    .orderBy(asc(stockAdjustment.createdAt));
  return rows.map((row) => ({
    kind: "STOCK_ADJUSTMENT",
    label: ADJUSTMENT_KIND_LABELS[row.kind as AdjustmentKind],
    code: row.code,
    party: row.related ?? "",
    summary: row.reason,
    amount: row.value === null ? null : Number(row.value),
    sentAt: new Date(row.sentAt),
    href: `/inventory/adjustments/${row.id}`,
  }));
}

/** What the viewer sees waiting, oldest sent first (0.2 #94). */
export async function pendingApprovals(
  db: Database,
  viewer: ContractUser,
): Promise<ApprovalRow[]> {
  const stock = can(viewer.role, "inventory.adjust");
  const groups = await Promise.all([
    revisions(db, viewer),
    compensations(db, viewer),
    buyBacks(db, viewer),
    stock ? stocktakes(db) : [],
    stock ? adjustments(db) : [],
  ]);
  return groups
    .flat()
    .sort(
      (a, b) =>
        a.sentAt.getTime() - b.sentAt.getTime() || a.code.localeCompare(b.code),
    );
}
