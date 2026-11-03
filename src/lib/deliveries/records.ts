// Reading and locking delivery notes (deliveries design D3, D9, D10): the
// note row FOR UPDATE, its lines and picks, the terms of the contract as
// pure-rule input, and the three quantity maps of "còn phải giao".
import { and, asc, eq, gt, inArray, ne, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  contractRevision,
  deliveryNote,
  deliveryNoteKit,
  deliveryNoteLine,
  deliveryNotePick,
  inventoryLedger,
  item,
  kit,
  kitComponent,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { Condition } from "@/domain/condition";
import type { PricingUnit, SaleCondition } from "@/domain/contract-lines";
import { byWeight } from "@/domain/contract-lines";
import {
  lineKey,
  OPEN_DELIVERY_STATUSES,
  type DeliveryKit,
  type DeliveryStatus,
  type TermsLine,
} from "@/domain/delivery-note";
import { DomainValueError } from "@/domain/errors";
import {
  hasStandardWeight,
  quantityFromDb,
  quantityToDb,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";
import { notFound, ServiceFailure } from "@/lib/catalog/common";
import type { Tx } from "@/lib/contracts/common";
import { readContent } from "@/lib/contracts/content";
import type { ContractTerms } from "@/lib/contracts/terms";

type Reader = Pick<Database, "select">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DELIVERY_DOCUMENT_TYPE = "DELIVERY_NOTE";
export const DELIVERY_PREFIX = "PX";

/** Thousandths of a stored quantity, whatever its unit. */
export const milliOf = (quantity: string): number =>
  quantityFromDb(quantity, "KG").milli;

/** numeric(14,3) text from thousandths. */
export const db3 = (milli: number): string =>
  quantityToDb(toQuantity(milli, "KG"));

export type NoteRow = typeof deliveryNote.$inferSelect;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** The note FOR UPDATE (after its contract), or 404. */
export async function lockNote(tx: Tx, id: string): Promise<NoteRow> {
  if (!isUuid(id)) throw new ServiceFailure(notFound());
  const [row] = await tx
    .select()
    .from(deliveryNote)
    .where(eq(deliveryNote.id, id))
    .for("update");
  if (!row) throw new ServiceFailure(notFound());
  return row;
}

/** The note's contract id by note id or code, without locking. */
export async function findNote(
  tx: Reader,
  idOrCode: string,
): Promise<{ id: string; contractId: string; code: string } | null> {
  const [row] = await tx
    .select({
      id: deliveryNote.id,
      contractId: deliveryNote.contractId,
      code: deliveryNote.code,
    })
    .from(deliveryNote)
    .where(
      isUuid(idOrCode)
        ? eq(deliveryNote.id, idOrCode)
        : eq(deliveryNote.code, idOrCode),
    );
  return row ?? null;
}

export interface ItemFacts {
  id: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  /** kg per unit, in thousandths; null for items counted in kg. */
  standardWeightMilli: number | null;
}

export async function itemFacts(
  tx: Reader,
  ids: readonly string[],
): Promise<Map<string, ItemFacts>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await tx
    .select({
      id: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      standardWeightKg: item.standardWeightKg,
    })
    .from(item)
    .where(inArray(item.id, unique));
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        code: row.code,
        name: row.name,
        unit: row.unit as QuantityUnit,
        standardWeightMilli:
          row.standardWeightKg === null ? null : milliOf(row.standardWeightKg),
      },
    ]),
  );
}

/** Contract lines in force, as the pure rules want them. */
export async function termsLines(
  tx: Reader,
  terms: ContractTerms,
): Promise<TermsLine[]> {
  const facts = await itemFacts(
    tx,
    terms.lines.map((line) => line.itemId),
  );
  return terms.lines.map((line) => {
    const info = facts.get(line.itemId);
    const sale = line.condition !== null;
    return {
      itemId: line.itemId,
      itemCode: info?.code ?? line.itemCode,
      unit: info?.unit ?? "PIECE",
      condition: sale ? (line.condition as SaleCondition) : null,
      pricingUnit: sale ? (line.pricingUnit as PricingUnit) : null,
      quantityMilli: milliOf(line.quantity),
    };
  });
}

/** Items an approved amendment adds after `today`: code → effective date. */
export async function laterItems(
  tx: Reader,
  contractId: string,
  today: BusinessDate,
): Promise<Map<string, BusinessDate>> {
  const revisions = await tx
    .select({
      id: contractRevision.id,
      effectiveFrom: contractRevision.effectiveFrom,
    })
    .from(contractRevision)
    .where(
      and(
        eq(contractRevision.contractId, contractId),
        eq(contractRevision.status, "APPROVED"),
        gt(contractRevision.effectiveFrom, today),
      ),
    )
    .orderBy(asc(contractRevision.effectiveFrom));
  const later = new Map<string, BusinessDate>();
  for (const revision of revisions) {
    const content = await readContent(tx, revision.id);
    const facts = await itemFacts(
      tx,
      content.lines.map((line) => line.itemId),
    );
    for (const line of content.lines) {
      const code = facts.get(line.itemId)?.code;
      if (code && !later.has(code)) {
        later.set(code, revision.effectiveFrom as BusinessDate);
      }
    }
  }
  return later;
}

/** Kits with their catalog parts, FOR SHARE (design D4). */
export async function kitsWithParts(
  tx: Tx,
  picks: readonly { kitId: string; quantity: number }[],
): Promise<DeliveryKit[]> {
  if (picks.length === 0) return [];
  const ids = picks.map((pick) => pick.kitId);
  const kits = await tx
    .select({ id: kit.id, code: kit.code, status: kit.status })
    .from(kit)
    .where(inArray(kit.id, ids))
    .orderBy(asc(kit.id))
    .for("share");
  const byId = new Map(kits.map((row) => [row.id, row]));
  const parts = await tx
    .select({
      kitId: kitComponent.kitId,
      itemId: kitComponent.itemId,
      itemCode: item.code,
      quantity: kitComponent.quantity,
    })
    .from(kitComponent)
    .innerJoin(item, eq(item.id, kitComponent.itemId))
    .where(inArray(kitComponent.kitId, ids))
    .orderBy(asc(kitComponent.itemId));
  return picks.map((pick) => {
    const row = byId.get(pick.kitId);
    if (!row || row.status !== "ACTIVE") {
      throw new DomainValueError(
        "Bộ đã chọn không còn dùng được. Bạn chọn lại.",
      );
    }
    return {
      kitId: pick.kitId,
      kitCode: row.code,
      quantity: pick.quantity,
      components: parts
        .filter((part) => part.kitId === pick.kitId)
        .map(({ itemId, itemCode, quantity }) => ({
          itemId,
          itemCode,
          quantity,
        })),
    };
  });
}

export interface StoredLine {
  id: string;
  lineNo: number;
  itemId: string;
  condition: SaleCondition | null;
  pricingUnit: PricingUnit | null;
  requestedMilli: number;
  unitPrice: number | null;
}

export interface StoredPick {
  lineId: string;
  condition: Condition;
  quantityMilli: number;
  weighedMilli: number | null;
  piecesEstimated: boolean;
}

export interface NoteContent {
  kits: { kitId: string; quantity: number }[];
  lines: StoredLine[];
  picks: StoredPick[];
}

export async function readNoteContent(
  tx: Reader,
  noteId: string,
): Promise<NoteContent> {
  const [kits, lines] = await Promise.all([
    tx
      .select({
        kitId: deliveryNoteKit.kitId,
        quantity: deliveryNoteKit.quantity,
      })
      .from(deliveryNoteKit)
      .where(eq(deliveryNoteKit.noteId, noteId)),
    tx
      .select()
      .from(deliveryNoteLine)
      .where(eq(deliveryNoteLine.noteId, noteId))
      .orderBy(asc(deliveryNoteLine.lineNo)),
  ]);
  const picks = lines.length
    ? await tx
        .select()
        .from(deliveryNotePick)
        .where(
          inArray(
            deliveryNotePick.lineId,
            lines.map((line) => line.id),
          ),
        )
    : [];
  return {
    kits,
    lines: lines.map((line) => ({
      id: line.id,
      lineNo: line.lineNo,
      itemId: line.itemId,
      condition: line.condition as SaleCondition | null,
      pricingUnit: line.pricingUnit as PricingUnit | null,
      requestedMilli: milliOf(line.requestedQuantity),
      unitPrice: line.unitPrice,
    })),
    picks: picks.map((pick) => ({
      lineId: pick.lineId,
      condition: pick.condition as Condition,
      quantityMilli: milliOf(pick.quantity),
      weighedMilli: pick.weighedKg === null ? null : milliOf(pick.weighedKg),
      piecesEstimated: pick.piecesEstimated,
    })),
  };
}

const add = (map: Map<string, number>, key: string, milli: number) =>
  map.set(key, (map.get(key) ?? 0) + milli);

/**
 * Rental: what is on site for this contract, by item (design D3, 0.2 #56):
 * every ledger line at the site location of a document of the contract.
 * Only delivery notes so far; returns add theirs in returns-and-compensation.
 */
export async function onSiteByItem(
  tx: Reader,
  contractId: string,
): Promise<Map<string, number>> {
  const rows = await tx
    .select({
      itemId: inventoryLedger.itemId,
      quantity: sql<string>`sum(${inventoryLedger.quantity})`,
    })
    .from(inventoryLedger)
    .innerJoin(
      deliveryNote,
      and(
        eq(deliveryNote.id, inventoryLedger.documentId),
        eq(inventoryLedger.documentType, DELIVERY_DOCUMENT_TYPE),
        eq(inventoryLedger.locationId, deliveryNote.siteLocationId),
      ),
    )
    .where(eq(deliveryNote.contractId, contractId))
    .groupBy(inventoryLedger.itemId);
  return new Map(rows.map((row) => [row.itemId, milliOf(row.quantity)]));
}

/** Sale: delivered so far by line key, weighed kg on lines by kg. */
export async function deliveredByLine(
  tx: Reader,
  contractId: string,
): Promise<Map<string, number>> {
  const rows = await tx
    .select({
      itemId: deliveryNoteLine.itemId,
      condition: deliveryNoteLine.condition,
      pricingUnit: deliveryNoteLine.pricingUnit,
      unit: item.unit,
      quantity: deliveryNotePick.quantity,
      weighedKg: deliveryNotePick.weighedKg,
    })
    .from(deliveryNotePick)
    .innerJoin(
      deliveryNoteLine,
      eq(deliveryNoteLine.id, deliveryNotePick.lineId),
    )
    .innerJoin(deliveryNote, eq(deliveryNote.id, deliveryNoteLine.noteId))
    .innerJoin(item, eq(item.id, deliveryNoteLine.itemId))
    .where(
      and(
        eq(deliveryNote.contractId, contractId),
        eq(deliveryNote.status, "POSTED"),
      ),
    );
  const done = new Map<string, number>();
  for (const row of rows) {
    const measured =
      byWeight(row.pricingUnit ?? "") &&
      hasStandardWeight(row.unit as QuantityUnit)
        ? milliOf(row.weighedKg ?? "0")
        : milliOf(row.quantity);
    add(done, lineKey(row.itemId, row.condition, row.pricingUnit), measured);
  }
  return done;
}

/** Requested on notes not finished yet, by line key (one note left out). */
export async function openByLine(
  tx: Reader,
  contractId: string,
  exceptNoteId: string | null = null,
): Promise<Map<string, number>> {
  const rows = await tx
    .select({
      itemId: deliveryNoteLine.itemId,
      condition: deliveryNoteLine.condition,
      pricingUnit: deliveryNoteLine.pricingUnit,
      quantity: deliveryNoteLine.requestedQuantity,
    })
    .from(deliveryNoteLine)
    .innerJoin(deliveryNote, eq(deliveryNote.id, deliveryNoteLine.noteId))
    .where(
      and(
        eq(deliveryNote.contractId, contractId),
        inArray(deliveryNote.status, [...OPEN_DELIVERY_STATUSES]),
        exceptNoteId === null ? undefined : ne(deliveryNote.id, exceptNoteId),
      ),
    );
  const open = new Map<string, number>();
  for (const row of rows) {
    add(
      open,
      lineKey(row.itemId, row.condition, row.pricingUnit),
      milliOf(row.quantity),
    );
  }
  return open;
}

/** "Done" for the remaining rule: on site (rental) or delivered (sale). */
export function doneByLine(
  tx: Reader,
  type: "RENTAL" | "SALE",
  contractId: string,
): Promise<Map<string, number>> {
  return type === "RENTAL"
    ? onSiteByItem(tx, contractId)
    : deliveredByLine(tx, contractId);
}

export type { DeliveryStatus };
