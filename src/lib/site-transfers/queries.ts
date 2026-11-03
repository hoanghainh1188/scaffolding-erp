// What the screens read about site transfers (site-operations design D10):
// M9 never gets a price; D6b and D6 get the transfer with its contracts.
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "@/db/client";
import {
  contract,
  customer,
  item,
  site,
  siteTransfer,
  siteTransferLine,
  user,
} from "@/db/schema";
import {
  formatQuantityForInput,
  quantityFromDb,
  type QuantityUnit,
} from "@/domain/quantity";
import type { TransferStatus } from "@/domain/site-transfer";
import { isUuid } from "@/lib/deliveries/records";

type Reader = Pick<Database, "select">;

export interface TransferLineView {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: QuantityUnit;
  /** What the office wrote, as text in the item's unit. */
  planned: string;
  /** What the truck carried, once posted. */
  moved: string | null;
}

export interface TransferPlaceView {
  contractId: string;
  contractCode: string;
  customerName: string;
  siteName: string;
  siteAddress: string | null;
}

export interface TransferView {
  id: string;
  code: string;
  status: TransferStatus;
  confirmMode: "OFFICE" | "PHONE";
  from: TransferPlaceView;
  to: TransferPlaceView;
  vehiclePlate: string | null;
  note: string | null;
  businessDate: string | null;
  confirmedOnDeviceAt: string | null;
  postedByName: string | null;
  postedAt: string | null;
  cancelledReason: string | null;
  otherCustomerConfirmed: boolean;
  overContractConfirmed: boolean;
  sameCustomer: boolean | null;
  updatedAt: string;
  lines: TransferLineView[];
}

const fromContract = alias(contract, "from_contract");
const toContract = alias(contract, "to_contract");
const fromCustomer = alias(customer, "from_customer");
const toCustomer = alias(customer, "to_customer");
const fromSite = alias(site, "from_site");
const toSite = alias(site, "to_site");

const text = (value: string, unit: QuantityUnit) =>
  formatQuantityForInput(quantityFromDb(value, unit));

/** One transfer by id or code, with both places and its lines. */
export async function transferView(
  db: Reader,
  ref: string,
): Promise<TransferView | null> {
  const [row] = await db
    .select({
      transfer: siteTransfer,
      fromCode: fromContract.code,
      fromCustomer: fromCustomer.name,
      fromSite: fromSite.name,
      fromAddress: fromSite.address,
      toCode: toContract.code,
      toCustomer: toCustomer.name,
      toSite: toSite.name,
      toAddress: toSite.address,
      postedByName: user.name,
    })
    .from(siteTransfer)
    .innerJoin(fromContract, eq(fromContract.id, siteTransfer.fromContractId))
    .innerJoin(toContract, eq(toContract.id, siteTransfer.toContractId))
    .innerJoin(fromCustomer, eq(fromCustomer.id, fromContract.customerId))
    .innerJoin(toCustomer, eq(toCustomer.id, toContract.customerId))
    .leftJoin(fromSite, eq(fromSite.id, fromContract.siteId))
    .leftJoin(toSite, eq(toSite.id, toContract.siteId))
    .leftJoin(user, eq(user.id, siteTransfer.postedBy))
    .where(isUuid(ref) ? eq(siteTransfer.id, ref) : eq(siteTransfer.code, ref));
  if (!row) return null;
  const t = row.transfer;
  const lines = await db
    .select({
      itemId: siteTransferLine.itemId,
      itemCode: item.code,
      itemName: item.name,
      unit: item.unit,
      planned: siteTransferLine.plannedQuantity,
      moved: siteTransferLine.movedQuantity,
    })
    .from(siteTransferLine)
    .innerJoin(item, eq(item.id, siteTransferLine.itemId))
    .where(eq(siteTransferLine.transferId, t.id))
    .orderBy(asc(siteTransferLine.lineNo));
  return {
    id: t.id,
    code: t.code,
    status: t.status as TransferStatus,
    confirmMode: t.confirmMode as "OFFICE" | "PHONE",
    from: {
      contractId: t.fromContractId,
      contractCode: row.fromCode,
      customerName: row.fromCustomer,
      siteName: row.fromSite ?? "",
      siteAddress: row.fromAddress ?? null,
    },
    to: {
      contractId: t.toContractId,
      contractCode: row.toCode,
      customerName: row.toCustomer,
      siteName: row.toSite ?? "",
      siteAddress: row.toAddress ?? null,
    },
    vehiclePlate: t.vehiclePlate,
    note: t.note,
    businessDate: t.businessDate,
    confirmedOnDeviceAt: t.confirmedOnDeviceAt?.toISOString() ?? null,
    postedByName: row.postedByName ?? null,
    postedAt: t.postedAt?.toISOString() ?? null,
    cancelledReason: t.cancelledReason,
    otherCustomerConfirmed: t.otherCustomerConfirmed,
    overContractConfirmed: t.overContractConfirmed,
    sameCustomer: t.sameCustomer,
    updatedAt: t.updatedAt.toISOString(),
    lines: lines.map((line) => {
      const unit = line.unit as QuantityUnit;
      return {
        itemId: line.itemId,
        itemCode: line.itemCode,
        itemName: line.itemName,
        unit,
        planned: text(line.planned, unit),
        moved: line.moved === null ? null : text(line.moved, unit),
      };
    }),
  };
}

/** M9: the same view, which has no price in it. */
export function mobileTransfer(
  db: Reader,
  code: string,
): Promise<TransferView | null> {
  return transferView(db, code);
}

export interface TransferListRow {
  id: string;
  code: string;
  status: TransferStatus;
  fromContractId: string;
  toContractId: string;
  fromSite: string;
  toSite: string;
  businessDate: string | null;
  postedAt: string | null;
  createdAt: string;
  lines: { unit: QuantityUnit; milli: number }[];
}

/** Transfers of some contracts (either side), or by status; newest first. */
export async function listTransfers(
  db: Reader,
  filter: { contractId?: string; statuses?: readonly TransferStatus[] },
): Promise<TransferListRow[]> {
  const rows = await db
    .select({
      id: siteTransfer.id,
      code: siteTransfer.code,
      status: siteTransfer.status,
      fromContractId: siteTransfer.fromContractId,
      toContractId: siteTransfer.toContractId,
      fromSite: fromSite.name,
      toSite: toSite.name,
      businessDate: siteTransfer.businessDate,
      postedAt: siteTransfer.postedAt,
      createdAt: siteTransfer.createdAt,
    })
    .from(siteTransfer)
    .innerJoin(fromContract, eq(fromContract.id, siteTransfer.fromContractId))
    .innerJoin(toContract, eq(toContract.id, siteTransfer.toContractId))
    .leftJoin(fromSite, eq(fromSite.id, fromContract.siteId))
    .leftJoin(toSite, eq(toSite.id, toContract.siteId))
    .where(
      and(
        filter.contractId === undefined
          ? undefined
          : or(
              eq(siteTransfer.fromContractId, filter.contractId),
              eq(siteTransfer.toContractId, filter.contractId),
            ),
        filter.statuses === undefined
          ? undefined
          : inArray(siteTransfer.status, [...filter.statuses]),
      ),
    )
    .orderBy(desc(siteTransfer.createdAt));
  const lines = rows.length
    ? await db
        .select({
          transferId: siteTransferLine.transferId,
          unit: item.unit,
          planned: siteTransferLine.plannedQuantity,
          moved: siteTransferLine.movedQuantity,
        })
        .from(siteTransferLine)
        .innerJoin(item, eq(item.id, siteTransferLine.itemId))
        .where(
          inArray(
            siteTransferLine.transferId,
            rows.map((row) => row.id),
          ),
        )
    : [];
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    status: row.status as TransferStatus,
    fromContractId: row.fromContractId,
    toContractId: row.toContractId,
    fromSite: row.fromSite ?? "",
    toSite: row.toSite ?? "",
    businessDate: row.businessDate,
    postedAt: row.postedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    lines: lines
      .filter((line) => line.transferId === row.id)
      .map((line) => {
        const unit = line.unit as QuantityUnit;
        return {
          unit,
          milli: quantityFromDb(line.moved ?? line.planned, unit).milli,
        };
      }),
  }));
}
