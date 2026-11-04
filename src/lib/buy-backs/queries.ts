// What the screens read about buy-back notes (site-operations design D10):
// D6c with its lines and the contract prices, and the D6 timeline rows.
import { asc, desc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  buyBackNote,
  buyBackNoteLine,
  contract,
  customer,
  item,
  site,
  user,
} from "@/db/schema";
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import { buyBackTotal, type BuyBackStatus } from "@/domain/buy-back";
import { amountsText } from "@/domain/delivery-summary";
import { quantityFromDb, type QuantityUnit } from "@/domain/quantity";
import { contractTermsAt } from "@/lib/contracts/terms";
import {
  isUuid,
  itemFacts,
  milliOf,
  onSiteByItem,
  type ItemFacts,
} from "@/lib/deliveries/records";
import { contractPlace } from "@/lib/site-transfers/records";

type Reader = Pick<Database, "select">;

export interface BuyBackLineView {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: QuantityUnit;
  milli: number;
  unitPrice: number;
  contractPrice: number | null;
}

export interface BuyBackView {
  id: string;
  code: string;
  status: BuyBackStatus;
  contractId: string;
  contractCode: string;
  customerId: string;
  customerName: string;
  siteName: string;
  reason: string;
  approvalReason: string | null;
  rejectedReason: string | null;
  amountDue: number | null;
  approvedDate: string | null;
  dueDate: string | null;
  approvedByName: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  lines: BuyBackLineView[];
}

/** One note by id or code with its lines; null when there is none. */
export async function buyBackView(
  db: Reader,
  ref: string,
): Promise<BuyBackView | null> {
  const [row] = await db
    .select({
      note: buyBackNote,
      contractCode: contract.code,
      customerId: contract.customerId,
      customerName: customer.name,
      siteName: site.name,
    })
    .from(buyBackNote)
    .innerJoin(contract, eq(contract.id, buyBackNote.contractId))
    .innerJoin(customer, eq(customer.id, contract.customerId))
    .leftJoin(site, eq(site.id, contract.siteId))
    .where(isUuid(ref) ? eq(buyBackNote.id, ref) : eq(buyBackNote.code, ref));
  if (!row) return null;
  const note = row.note;
  const names = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.id, note.createdBy));
  const approver = note.approvedBy
    ? await db
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, note.approvedBy))
    : [];
  const lines = await db
    .select({
      itemId: buyBackNoteLine.itemId,
      itemCode: item.code,
      itemName: item.name,
      unit: item.unit,
      quantity: buyBackNoteLine.quantity,
      unitPrice: buyBackNoteLine.unitPrice,
      contractPrice: buyBackNoteLine.contractPrice,
    })
    .from(buyBackNoteLine)
    .innerJoin(item, eq(item.id, buyBackNoteLine.itemId))
    .where(eq(buyBackNoteLine.noteId, note.id))
    .orderBy(asc(buyBackNoteLine.lineNo));
  return {
    id: note.id,
    code: note.code,
    status: note.status as BuyBackStatus,
    contractId: note.contractId,
    contractCode: row.contractCode,
    customerId: row.customerId,
    customerName: row.customerName,
    siteName: row.siteName ?? "",
    reason: note.reason,
    approvalReason: note.approvalReason,
    rejectedReason: note.rejectedReason,
    amountDue: note.amountDue,
    approvedDate: note.approvedDate,
    dueDate: note.dueDate,
    approvedByName: approver[0]?.name ?? null,
    createdByName: names[0]?.name ?? "",
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    lines: lines.map((line) => ({
      itemId: line.itemId,
      itemCode: line.itemCode,
      itemName: line.itemName,
      unit: line.unit as QuantityUnit,
      milli: milliOf(line.quantity),
      unitPrice: line.unitPrice,
      contractPrice: line.contractPrice,
    })),
  };
}

export interface BuyBackTimelineEntry {
  id: string;
  code: string;
  status: BuyBackStatus;
  /** Approval day, or the day it was made while pending or rejected. */
  date: BusinessDate;
  text: string;
  total: number;
}

/** D6 rows of a contract's buy-backs, newest first. */
export async function contractBuyBacks(
  db: Reader,
  contractId: string,
): Promise<BuyBackTimelineEntry[]> {
  const notes = await db
    .select()
    .from(buyBackNote)
    .where(eq(buyBackNote.contractId, contractId))
    .orderBy(desc(buyBackNote.createdAt));
  const result: BuyBackTimelineEntry[] = [];
  for (const note of notes) {
    const lines = await db
      .select({
        itemCode: item.code,
        itemName: item.name,
        unit: item.unit,
        quantity: buyBackNoteLine.quantity,
        unitPrice: buyBackNoteLine.unitPrice,
      })
      .from(buyBackNoteLine)
      .innerJoin(item, eq(item.id, buyBackNoteLine.itemId))
      .where(eq(buyBackNoteLine.noteId, note.id))
      .orderBy(asc(buyBackNoteLine.lineNo));
    const named = lines.map((line) => {
      const unit = line.unit as QuantityUnit;
      return {
        itemCode: line.itemCode,
        itemName: line.itemName,
        unit,
        milli: quantityFromDb(line.quantity, unit).milli,
        unitPrice: line.unitPrice,
      };
    });
    result.push({
      id: note.id,
      code: note.code,
      status: note.status as BuyBackStatus,
      date: (note.approvedDate ??
        toBusinessDate(note.createdAt)) as BusinessDate,
      text: amountsText(named),
      total: buyBackTotal(named),
    });
  }
  return result;
}

export interface BuyBackFormItem {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  onSiteMilli: number;
  /** Lost price on the contract today; null when it has none. */
  lostPrice: number | null;
  /** ₫ a day on the contract today. */
  dailyPrice: number;
}

export interface BuyBackForm {
  contract: {
    id: string;
    code: string;
    siteName: string;
    customerName: string;
    customerId: string;
  };
  items: BuyBackFormItem[];
  paymentTermsDays: number;
}

/** D6c: what is on site with the contract's lost and daily prices. */
export async function buyBackForm(
  db: Reader,
  contractId: string,
  today: BusinessDate,
): Promise<BuyBackForm | null> {
  const place = await contractPlace(db, contractId);
  if (!place || place.type !== "RENTAL" || place.status !== "ACTIVE") {
    return null;
  }
  const [onSite, terms] = await Promise.all([
    onSiteByItem(db, place.id),
    contractTermsAt(db, place.id, today),
  ]);
  const ids = [...onSite].filter(([, milli]) => milli > 0).map(([id]) => id);
  const facts = await itemFacts(db, ids);
  const lost = new Map(
    (terms?.compensations ?? []).map((row) => [row.itemId, row.lostPrice]),
  );
  const daily = new Map(
    (terms?.lines ?? []).map((line) => [line.itemId, line.price ?? 0]),
  );
  return {
    contract: {
      id: place.id,
      code: place.code,
      siteName: place.siteName,
      customerName: place.customerName,
      customerId: place.customerId,
    },
    items: ids
      .map((itemId) => {
        const info = facts.get(itemId) as ItemFacts;
        return {
          itemId,
          code: info.code,
          name: info.name,
          unit: info.unit,
          onSiteMilli: onSite.get(itemId) ?? 0,
          lostPrice: lost.get(itemId) ?? null,
          dailyPrice: daily.get(itemId) ?? 0,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code, "vi")),
    paymentTermsDays: terms?.paymentTermsDays ?? 0,
  };
}
