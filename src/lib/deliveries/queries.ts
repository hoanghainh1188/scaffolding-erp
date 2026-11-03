// Reading delivery notes for the screens (deliveries design D3, D12): D6
// of one contract, the note detail of the office, and M1 / M5 / M7 of the
// phone. Phone reads never carry a price, freight or money (design D11).
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  contract,
  contractRevision,
  customer,
  deliveryNote,
  inventoryLedger,
  item,
  kit,
  kitComponent,
  location,
  site,
  user,
} from "@/db/schema";
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import type { Condition } from "@/domain/condition";
import type { ContractStatus, ContractType } from "@/domain/contract";
import { byWeight } from "@/domain/contract-lines";
import {
  deliveredSaleAmount,
  lineKey,
  lineUnit,
  remainingToDeliver,
  RENTAL_PICK_CONDITIONS,
  type DeliveryStatus,
  type RemainingLine,
} from "@/domain/delivery-note";
import {
  batchText,
  kitsText,
  type KitAmount,
  type NamedAmount,
} from "@/domain/delivery-summary";
import { canContract } from "@/domain/permissions";
import type { QuantityUnit } from "@/domain/quantity";
import { lineAmount } from "@/domain/average-cost";
import { toMoney } from "@/domain/money";
import { notFound, ok, type ServiceResult } from "@/lib/catalog/common";
import { forbidden, type ContractActor } from "@/lib/contracts/common";
import { contractTermsAt, type ContractTerms } from "@/lib/contracts/terms";

import {
  DELIVERY_DOCUMENT_TYPE,
  doneByLine,
  isUuid,
  itemFacts,
  milliOf,
  onSiteByItem,
  openByLine,
  readNoteContent,
  termsLines,
  type ItemFacts,
  type NoteContent,
} from "./records";

type Reader = Pick<Database, "select" | "selectDistinct">;

/** Who reads: the role and the contract scope are enough (canContract). */
type ReadingActor = Pick<ContractActor, "role" | "contractScope">;

// ----------------------------------------------------------- shared

interface NoteHeadRow {
  id: string;
  code: string;
  contractId: string;
  batchNo: number;
  status: string;
  plannedDate: string | null;
  businessDate: string | null;
  departedAt: Date | null;
  postedAt: Date | null;
  companyTruck: boolean;
  freightAmount: number | null;
  vehiclePlate: string | null;
  note: string | null;
  returnedReason: string | null;
  cancelledReason: string | null;
  pickingByName: string | null;
  postedByName: string | null;
  sourceCode: string;
  sourceName: string;
  sourceLocationId: string;
  updatedAt: Date;
}

const pickerName = sql<
  string | null
>`(select ${user.name} from ${user} where ${user.id} = ${deliveryNote.pickingBy})`;
const posterName = sql<
  string | null
>`(select ${user.name} from ${user} where ${user.id} = ${deliveryNote.postedBy})`;

function headColumns() {
  return {
    id: deliveryNote.id,
    code: deliveryNote.code,
    contractId: deliveryNote.contractId,
    batchNo: deliveryNote.batchNo,
    status: deliveryNote.status,
    plannedDate: deliveryNote.plannedDate,
    businessDate: deliveryNote.businessDate,
    departedAt: deliveryNote.departedAt,
    postedAt: deliveryNote.postedAt,
    companyTruck: deliveryNote.companyTruck,
    freightAmount: deliveryNote.freightAmount,
    vehiclePlate: deliveryNote.vehiclePlate,
    note: deliveryNote.note,
    returnedReason: deliveryNote.returnedReason,
    cancelledReason: deliveryNote.cancelledReason,
    pickingByName: pickerName,
    postedByName: posterName,
    sourceCode: location.code,
    sourceName: location.name,
    sourceLocationId: deliveryNote.sourceLocationId,
    updatedAt: deliveryNote.updatedAt,
  };
}

export interface NoteLineView {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  /** The item's unit. */
  unit: QuantityUnit;
  /** The unit of requested / picked: kg for a sale by kg. */
  lineUnit: QuantityUnit;
  condition: Condition | null;
  pricingUnit: "ITEM" | "KG" | null;
  standardWeightMilli: number | null;
  requestedMilli: number;
  picks: {
    condition: Condition;
    quantityMilli: number;
    weighedMilli: number | null;
    piecesEstimated: boolean;
  }[];
  /** Picked against the need: weighed kg on a sale by kg. */
  pickedMilli: number;
}

function linesView(
  content: NoteContent,
  facts: Map<string, ItemFacts>,
): NoteLineView[] {
  return content.lines.map((line) => {
    const info = facts.get(line.itemId) as ItemFacts;
    const picks = content.picks
      .filter((pick) => pick.lineId === line.id)
      .map(({ condition, quantityMilli, weighedMilli, piecesEstimated }) => ({
        condition,
        quantityMilli,
        weighedMilli,
        piecesEstimated,
      }));
    const kgLine = byWeight(line.pricingUnit ?? "");
    const unit = lineUnit({ unit: info.unit, pricingUnit: line.pricingUnit });
    const pickedMilli = picks.reduce(
      (sum, pick) =>
        sum +
        (kgLine && unit !== info.unit
          ? (pick.weighedMilli ?? 0)
          : pick.quantityMilli),
      0,
    );
    return {
      id: line.id,
      itemId: line.itemId,
      itemCode: info.code,
      itemName: info.name,
      unit: info.unit,
      lineUnit: unit,
      condition: line.condition,
      pricingUnit: line.pricingUnit,
      standardWeightMilli: info.standardWeightMilli,
      requestedMilli: line.requestedMilli,
      picks,
      pickedMilli,
    };
  });
}

async function kitAmounts(
  db: Reader,
  kits: readonly { kitId: string; quantity: number }[],
): Promise<KitAmount[]> {
  if (kits.length === 0) return [];
  const rows = await db
    .select({ id: kit.id, name: kit.name })
    .from(kit)
    .where(
      inArray(
        kit.id,
        kits.map((entry) => entry.kitId),
      ),
    );
  const names = new Map(rows.map((row) => [row.id, row.name]));
  return kits.map((entry) => ({
    kitName: names.get(entry.kitId) ?? "",
    quantity: entry.quantity,
  }));
}

const named = (line: NoteLineView, milli: number): NamedAmount => ({
  itemCode: line.itemCode,
  itemName: line.itemName,
  unit: line.lineUnit,
  milli,
});

/** "60 bộ giàn giáo 1,7m = 120 khung, 120 chéo, 60 mâm" of what was asked. */
export function requestedText(
  kits: readonly KitAmount[],
  lines: readonly NoteLineView[],
) {
  return batchText(
    kits,
    lines.map((line) => named(line, line.requestedMilli)),
  );
}

/** "120 khung, 80 chéo" of what left the yard, and the shortage. */
export function deliveredTexts(lines: readonly NoteLineView[]) {
  const done = lines.filter((line) => line.pickedMilli > 0);
  const short = lines.filter((line) => line.pickedMilli < line.requestedMilli);
  return {
    delivered: batchText(
      [],
      done.map((line) => named(line, line.pickedMilli)),
    ),
    short: batchText(
      [],
      short.map((line) => named(line, line.requestedMilli - line.pickedMilli)),
    ),
  };
}

function vnDate(at: Date | null): BusinessDate | null {
  return at ? toBusinessDate(at) : null;
}

// ----------------------------------------------------------- D6

export interface ContractHead {
  id: string;
  code: string;
  type: ContractType;
  status: ContractStatus;
  customerName: string;
  siteName: string | null;
  siteAddress: string | null;
  startDate: string | null;
}

export interface SiteRow {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: QuantityUnit;
  deliveredMilli: number;
  returnedMilli: number;
  onSiteMilli: number;
  /** ₫ per day of what is on site (rental). */
  dayRent: number;
}

export interface TimelineEntry {
  id: string;
  code: string;
  batchNo: number;
  status: DeliveryStatus;
  /** Planned, delivery or cancel date for sorting and showing. */
  date: BusinessDate | null;
  plannedDate: BusinessDate | null;
  businessDate: BusinessDate | null;
  /** When the phone tapped, if another day than the delivery date. */
  phoneDifferentDay: Date | null;
  requested: string;
  delivered: string;
  short: string;
  freightAmount: number | null;
  companyTruck: boolean;
  pickingByName: string | null;
  returnedReason: string | null;
  cancelledReason: string | null;
}

export interface PlanBatchOption {
  seq: number;
  plannedDate: string;
  kits: { kitId: string; quantity: number }[];
  lines: { itemId: string; quantity: string }[];
}

export interface ContractDeliveries {
  contract: ContractHead;
  canManage: boolean;
  /** Rental: goods on site. Sale: empty. */
  site: SiteRow[];
  remaining: (RemainingLine & { itemName: string; unit: QuantityUnit })[];
  timeline: TimelineEntry[];
  /** Notes confirmed on the phone another day than their delivery date. */
  checks: {
    code: string;
    businessDate: BusinessDate;
    phoneDate: BusinessDate;
  }[];
  plan: PlanBatchOption[];
  terms: Pick<ContractTerms, "companyTruck" | "freightPerTrip"> | null;
  /** Items and kits a batch may take. */
  items: {
    id: string;
    code: string;
    name: string;
    unit: QuantityUnit;
    condition: Condition | null;
    pricingUnit: "ITEM" | "KG" | null;
  }[];
  kits: {
    id: string;
    code: string;
    name: string;
    components: { itemId: string; itemCode: string; quantity: number }[];
  }[];
  yards: { id: string; code: string; name: string }[];
}

async function contractHead(
  db: Reader,
  id: string,
): Promise<ContractHead | null> {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({
      id: contract.id,
      code: contract.code,
      type: contract.type,
      status: contract.status,
      customerName: customer.name,
      siteName: site.name,
      siteAddress: site.address,
      startDate: contractRevision.startDate,
    })
    .from(contract)
    .innerJoin(customer, eq(customer.id, contract.customerId))
    .innerJoin(
      contractRevision,
      and(
        eq(contractRevision.contractId, contract.id),
        eq(contractRevision.number, 0),
      ),
    )
    .leftJoin(site, eq(site.id, contract.siteId))
    .where(eq(contract.id, id));
  if (!row) return null;
  return {
    ...row,
    type: row.type as ContractType,
    status: row.status as ContractStatus,
  };
}

/** Delivered (all lines in) per item at the site, for this contract. */
async function deliveredOnSite(db: Reader, contractId: string) {
  const rows = await db
    .select({
      itemId: inventoryLedger.itemId,
      quantity: sql<string>`sum(${inventoryLedger.quantity}) filter (where ${inventoryLedger.quantity} > 0)`,
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
  return new Map(rows.map((row) => [row.itemId, milliOf(row.quantity ?? "0")]));
}

/** D6 of one contract; null when it does not exist or may not be read. */
export async function contractDeliveries(
  db: Database,
  actor: ReadingActor,
  contractId: string,
  today: BusinessDate,
): Promise<ServiceResult<ContractDeliveries>> {
  const head = await contractHead(db, contractId);
  if (!head) return notFound();
  if (!canContract(actor, head.type, "view")) return forbidden();
  const terms = await contractTermsAt(db, head.id, today);
  const tLines = terms ? await termsLines(db, terms) : [];
  const facts = await itemFacts(
    db,
    tLines.map((line) => line.itemId),
  );
  const priceOf = new Map(
    (terms?.lines ?? []).map((line) => [
      lineKey(
        line.itemId,
        line.condition,
        line.condition === null ? null : line.pricingUnit,
      ),
      line.price ?? 0,
    ]),
  );

  const onSite =
    head.type === "RENTAL" ? await onSiteByItem(db, head.id) : new Map();
  const delivered =
    head.type === "RENTAL" ? await deliveredOnSite(db, head.id) : new Map();
  const siteRows: SiteRow[] =
    head.type === "RENTAL"
      ? tLines.map((line) => {
          const info = facts.get(line.itemId) as ItemFacts;
          const now = onSite.get(line.itemId) ?? 0;
          const out = delivered.get(line.itemId) ?? 0;
          return {
            itemId: line.itemId,
            itemCode: info.code,
            itemName: info.name,
            unit: info.unit,
            deliveredMilli: out,
            returnedMilli: Math.max(out - now, 0),
            onSiteMilli: now,
            dayRent: lineAmount(now, toMoney(priceOf.get(line.itemId) ?? 0)),
          };
        })
      : [];

  const remaining = remainingToDeliver({
    type: head.type,
    terms: tLines,
    done: await doneByLine(db, head.type, head.id),
    open: await openByLine(db, head.id),
  }).map((row) => {
    const info = facts.get(row.line.itemId) as ItemFacts;
    return { ...row, itemName: info.name, unit: lineUnit(row.line) };
  });

  const notes = await db
    .select(headColumns())
    .from(deliveryNote)
    .innerJoin(location, eq(location.id, deliveryNote.sourceLocationId))
    .where(eq(deliveryNote.contractId, head.id))
    .orderBy(desc(deliveryNote.batchNo));
  const timeline: TimelineEntry[] = [];
  const checks: ContractDeliveries["checks"] = [];
  for (const note of notes as NoteHeadRow[]) {
    const content = await readNoteContent(db, note.id);
    const noteFacts = await itemFacts(
      db,
      content.lines.map((line) => line.itemId),
    );
    const lines = linesView(content, noteFacts);
    const kits = await kitAmounts(db, content.kits);
    const texts =
      note.status === "POSTED"
        ? deliveredTexts(lines)
        : { delivered: "", short: "" };
    const phoneDate = vnDate(note.departedAt);
    const different =
      note.businessDate !== null &&
      phoneDate !== null &&
      phoneDate !== note.businessDate;
    if (different) {
      checks.push({
        code: note.code,
        businessDate: note.businessDate as BusinessDate,
        phoneDate: phoneDate as BusinessDate,
      });
    }
    timeline.push({
      id: note.id,
      code: note.code,
      batchNo: note.batchNo,
      status: note.status as DeliveryStatus,
      date: (note.businessDate ?? note.plannedDate) as BusinessDate | null,
      plannedDate: note.plannedDate as BusinessDate | null,
      businessDate: note.businessDate as BusinessDate | null,
      phoneDifferentDay: different ? note.departedAt : null,
      requested: requestedText(kits, lines),
      delivered: texts.delivered,
      short: texts.short,
      freightAmount: note.freightAmount,
      companyTruck: note.companyTruck,
      pickingByName: note.pickingByName,
      returnedReason: note.returnedReason,
      cancelledReason: note.cancelledReason,
    });
  }

  const yards = await db
    .select({ id: location.id, code: location.code, name: location.name })
    .from(location)
    .where(and(eq(location.type, "YARD"), eq(location.status, "ACTIVE")))
    .orderBy(asc(location.code));
  const kitRows =
    head.type === "RENTAL"
      ? await db
          .select({ id: kit.id, code: kit.code, name: kit.name })
          .from(kit)
          .where(eq(kit.status, "ACTIVE"))
          .orderBy(asc(kit.code))
      : [];
  const parts = kitRows.length
    ? await db
        .select({
          kitId: kitComponent.kitId,
          itemId: kitComponent.itemId,
          itemCode: item.code,
          quantity: kitComponent.quantity,
        })
        .from(kitComponent)
        .innerJoin(item, eq(item.id, kitComponent.itemId))
        .where(
          inArray(
            kitComponent.kitId,
            kitRows.map((row) => row.id),
          ),
        )
    : [];
  const kits = kitRows.map((row) => ({
    ...row,
    components: parts
      .filter((part) => part.kitId === row.id)
      .map(({ itemId, itemCode, quantity }) => ({
        itemId,
        itemCode,
        quantity,
      })),
  }));

  return ok({
    contract: head,
    canManage: canContract(actor, head.type, "manage"),
    site: siteRows,
    remaining,
    timeline,
    checks,
    plan: (terms?.batches ?? []).map((batch, index) => ({
      seq: index + 1,
      plannedDate: batch.plannedDate,
      kits: batch.lines
        .filter((line) => line.kitId !== null)
        .map((line) => ({
          kitId: line.kitId as string,
          quantity: milliOf(line.quantity) / 1000,
        })),
      lines: batch.lines
        .filter((line) => line.itemId !== null)
        .map((line) => ({
          itemId: line.itemId as string,
          quantity: line.quantity,
        })),
    })),
    terms: terms
      ? {
          companyTruck: terms.companyTruck,
          freightPerTrip: terms.freightPerTrip,
        }
      : null,
    items: tLines.map((line) => {
      const info = facts.get(line.itemId) as ItemFacts;
      return {
        id: line.itemId,
        code: info.code,
        name: info.name,
        unit: info.unit,
        condition: line.condition,
        pricingUnit: line.pricingUnit,
      };
    }),
    kits,
    yards,
  });
}

// ----------------------------------------------------------- detail

export interface DeliveryDetail {
  id: string;
  code: string;
  batchNo: number;
  status: DeliveryStatus;
  contract: ContractHead;
  canManage: boolean;
  source: { id: string; code: string; name: string };
  plannedDate: BusinessDate | null;
  businessDate: BusinessDate | null;
  departedAt: Date | null;
  postedAt: Date | null;
  phoneDifferentDay: boolean;
  companyTruck: boolean;
  freightAmount: number | null;
  vehiclePlate: string | null;
  note: string | null;
  returnedReason: string | null;
  cancelledReason: string | null;
  pickingByName: string | null;
  postedByName: string | null;
  overContractConfirmed: boolean;
  kits: (KitAmount & { kitId: string })[];
  lines: (NoteLineView & { unitPrice: number | null; amount: number | null })[];
  requested: string;
  updatedAt: string;
}

/** The office view of a note (with prices); null when not readable. */
export async function deliveryDetail(
  db: Database,
  actor: ReadingActor,
  idOrCode: string,
): Promise<ServiceResult<DeliveryDetail>> {
  const [row] = await db
    .select({
      ...headColumns(),
      overContractConfirmed: deliveryNote.overContractConfirmed,
    })
    .from(deliveryNote)
    .innerJoin(location, eq(location.id, deliveryNote.sourceLocationId))
    .where(
      isUuid(idOrCode)
        ? eq(deliveryNote.id, idOrCode)
        : eq(deliveryNote.code, idOrCode),
    );
  if (!row) return notFound();
  const head = await contractHead(db, row.contractId);
  if (!head) return notFound();
  if (!canContract(actor, head.type, "view")) return forbidden();
  const content = await readNoteContent(db, row.id);
  const facts = await itemFacts(
    db,
    content.lines.map((line) => line.itemId),
  );
  const lines = linesView(content, facts);
  const kits = await kitAmounts(db, content.kits);
  const phoneDate = vnDate(row.departedAt);
  return ok({
    id: row.id,
    code: row.code,
    batchNo: row.batchNo,
    status: row.status as DeliveryStatus,
    contract: head,
    canManage: canContract(actor, head.type, "manage"),
    source: {
      id: row.sourceLocationId,
      code: row.sourceCode,
      name: row.sourceName,
    },
    plannedDate: row.plannedDate as BusinessDate | null,
    businessDate: row.businessDate as BusinessDate | null,
    departedAt: row.departedAt,
    postedAt: row.postedAt,
    phoneDifferentDay:
      row.businessDate !== null &&
      phoneDate !== null &&
      phoneDate !== row.businessDate,
    companyTruck: row.companyTruck,
    freightAmount: row.freightAmount,
    vehiclePlate: row.vehiclePlate,
    note: row.note,
    returnedReason: row.returnedReason,
    cancelledReason: row.cancelledReason,
    pickingByName: row.pickingByName,
    postedByName: row.postedByName,
    overContractConfirmed: row.overContractConfirmed,
    kits: kits.map((entry, index) => ({
      ...entry,
      kitId: content.kits[index]?.kitId ?? "",
    })),
    lines: lines.map((line) => {
      const stored = content.lines.find((entry) => entry.id === line.id);
      const unitPrice = stored?.unitPrice ?? null;
      const amount =
        unitPrice === null || line.pricingUnit === null
          ? null
          : line.picks.reduce(
              (sum, pick) =>
                sum +
                deliveredSaleAmount({
                  pricingUnit: line.pricingUnit as "ITEM" | "KG",
                  unit: line.unit,
                  quantityMilli: pick.quantityMilli,
                  weighedMilli: pick.weighedMilli,
                  unitPrice: toMoney(unitPrice),
                }),
              0,
            );
      return { ...line, unitPrice, amount };
    }),
    requested: requestedText(kits, lines),
    updatedAt: row.updatedAt.toISOString(),
  });
}

// ----------------------------------------------------------- phone

export interface MobileTask {
  id: string;
  code: string;
  batchNo: number;
  status: DeliveryStatus;
  plannedDate: BusinessDate | null;
  /** Site name, or the customer of a sale picked up at the yard. */
  place: string;
  requested: string;
  totalRequested: { unit: QuantityUnit; milli: number }[];
}

/** M1 "Xuất hàng": notes waiting or being picked, due by today. */
export async function mobileTasks(
  db: Database,
  today: BusinessDate,
): Promise<MobileTask[]> {
  const rows = await db
    .select({
      id: deliveryNote.id,
      code: deliveryNote.code,
      batchNo: deliveryNote.batchNo,
      status: deliveryNote.status,
      plannedDate: deliveryNote.plannedDate,
      siteName: site.name,
      customerName: customer.name,
    })
    .from(deliveryNote)
    .innerJoin(contract, eq(contract.id, deliveryNote.contractId))
    .innerJoin(customer, eq(customer.id, contract.customerId))
    .leftJoin(site, eq(site.id, contract.siteId))
    .where(
      and(
        inArray(deliveryNote.status, ["PLANNED", "PICKING"]),
        or(
          isNull(deliveryNote.plannedDate),
          lte(deliveryNote.plannedDate, today),
        ),
      ),
    )
    .orderBy(
      sql`${deliveryNote.plannedDate} asc nulls last`,
      asc(deliveryNote.code),
    );
  const tasks: MobileTask[] = [];
  for (const row of rows) {
    const content = await readNoteContent(db, row.id);
    const facts = await itemFacts(
      db,
      content.lines.map((line) => line.itemId),
    );
    const lines = linesView(content, facts);
    tasks.push({
      id: row.id,
      code: row.code,
      batchNo: row.batchNo,
      status: row.status as DeliveryStatus,
      plannedDate: row.plannedDate as BusinessDate | null,
      place: row.siteName ?? row.customerName,
      requested: requestedText(await kitAmounts(db, content.kits), lines),
      totalRequested: totals(
        lines.map((line) => ({
          unit: line.lineUnit,
          milli: line.requestedMilli,
        })),
      ),
    });
  }
  return tasks;
}

function totals(rows: readonly { unit: QuantityUnit; milli: number }[]) {
  const sums = new Map<QuantityUnit, number>();
  for (const row of rows)
    sums.set(row.unit, (sums.get(row.unit) ?? 0) + row.milli);
  return [...sums.entries()].map(([unit, milli]) => ({ unit, milli }));
}

export interface MobileLine {
  id: string;
  itemCode: string;
  itemName: string;
  unit: QuantityUnit;
  lineUnit: QuantityUnit;
  condition: Condition | null;
  byKg: boolean;
  standardWeightMilli: number | null;
  requestedMilli: number;
  /** Stock at the yard of the note, by the conditions the line may take. */
  stock: { condition: Condition; milli: number }[];
  picks: NoteLineView["picks"];
}

export interface MobileNote {
  id: string;
  code: string;
  batchNo: number;
  status: DeliveryStatus;
  contractType: ContractType;
  place: string;
  plannedDate: BusinessDate | null;
  businessDate: BusinessDate | null;
  postedAt: Date | null;
  postedByName: string | null;
  pickingByName: string | null;
  vehiclePlate: string | null;
  kitsText: string | null;
  sourceCode: string;
  /** updated_at: the version the phone keeps when it starts picking. */
  version: string;
  lines: MobileLine[];
}

/** M5: the note by code, no money at all (design D11). */
export async function mobileNote(
  db: Database,
  code: string,
): Promise<MobileNote | null> {
  const [row] = await db
    .select({
      ...headColumns(),
      contractType: contract.type,
      siteName: site.name,
      customerName: customer.name,
    })
    .from(deliveryNote)
    .innerJoin(location, eq(location.id, deliveryNote.sourceLocationId))
    .innerJoin(contract, eq(contract.id, deliveryNote.contractId))
    .innerJoin(customer, eq(customer.id, contract.customerId))
    .leftJoin(site, eq(site.id, contract.siteId))
    .where(eq(deliveryNote.code, code));
  if (!row) return null;
  const content = await readNoteContent(db, row.id);
  const facts = await itemFacts(
    db,
    content.lines.map((line) => line.itemId),
  );
  const lines = linesView(content, facts);
  const kits = await kitAmounts(db, content.kits);
  const stock = await yardStock(
    db,
    row.sourceLocationId,
    lines.map((line) => line.itemId),
  );
  const type = row.contractType as ContractType;
  return {
    id: row.id,
    code: row.code,
    batchNo: row.batchNo,
    status: row.status as DeliveryStatus,
    contractType: type,
    place: row.siteName ?? row.customerName,
    plannedDate: row.plannedDate as BusinessDate | null,
    businessDate: row.businessDate as BusinessDate | null,
    postedAt: row.postedAt,
    postedByName: row.postedByName,
    pickingByName: row.pickingByName,
    vehiclePlate: row.vehiclePlate,
    kitsText: kits.length > 0 ? kitsText(kits) : null,
    sourceCode: row.sourceCode,
    version: row.updatedAt.toISOString(),
    lines: lines.map((line) => {
      const conditions: readonly Condition[] =
        type === "RENTAL"
          ? RENTAL_PICK_CONDITIONS
          : [line.condition as Condition];
      return {
        id: line.id,
        itemCode: line.itemCode,
        itemName: line.itemName,
        unit: line.unit,
        lineUnit: line.lineUnit,
        condition: line.condition,
        byKg: byWeight(line.pricingUnit ?? ""),
        standardWeightMilli: line.standardWeightMilli,
        requestedMilli: line.requestedMilli,
        stock: conditions.map((condition) => ({
          condition,
          milli: stock.get(`${line.itemId}|${condition}`) ?? 0,
        })),
        picks: line.picks,
      };
    }),
  };
}

async function yardStock(
  db: Reader,
  locationId: string,
  itemIds: readonly string[],
): Promise<Map<string, number>> {
  if (itemIds.length === 0) return new Map();
  const rows = await db
    .select({
      itemId: inventoryLedger.itemId,
      condition: inventoryLedger.condition,
      quantity: sql<string>`sum(${inventoryLedger.quantity})`,
    })
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.locationId, locationId),
        inArray(inventoryLedger.itemId, [...itemIds]),
      ),
    )
    .groupBy(inventoryLedger.itemId, inventoryLedger.condition);
  return new Map(
    rows.map((row) => [
      `${row.itemId}|${row.condition}`,
      milliOf(row.quantity),
    ]),
  );
}

export interface DeliveryListRow {
  code: string;
  place: string;
  delivered: { unit: QuantityUnit; milli: number }[];
  postedAt: Date;
}

export interface DeliveriesByDay {
  days: { date: BusinessDate; notes: DeliveryListRow[] }[];
  hasMore: boolean;
}

/** M7: posted notes of the `days` latest delivery days. */
export async function deliveriesByDay(
  db: Database,
  options: { before?: BusinessDate; days?: number } = {},
): Promise<DeliveriesByDay> {
  const count = options.days ?? 2;
  const dates = await db
    .selectDistinct({ date: deliveryNote.businessDate })
    .from(deliveryNote)
    .where(
      and(
        eq(deliveryNote.status, "POSTED"),
        options.before
          ? lt(deliveryNote.businessDate, options.before)
          : undefined,
      ),
    )
    .orderBy(desc(deliveryNote.businessDate))
    .limit(count + 1);
  const shown = dates
    .slice(0, count)
    .map((row) => row.date)
    .filter((date): date is string => date !== null);
  if (shown.length === 0) return { days: [], hasMore: false };
  const rows = await db
    .select({
      id: deliveryNote.id,
      code: deliveryNote.code,
      date: deliveryNote.businessDate,
      postedAt: deliveryNote.postedAt,
      siteName: site.name,
      customerName: customer.name,
    })
    .from(deliveryNote)
    .innerJoin(contract, eq(contract.id, deliveryNote.contractId))
    .innerJoin(customer, eq(customer.id, contract.customerId))
    .leftJoin(site, eq(site.id, contract.siteId))
    .where(
      and(
        eq(deliveryNote.status, "POSTED"),
        inArray(deliveryNote.businessDate, shown),
      ),
    )
    .orderBy(desc(deliveryNote.businessDate), desc(deliveryNote.postedAt));
  const notes: (DeliveryListRow & { date: string })[] = [];
  for (const row of rows) {
    const content = await readNoteContent(db, row.id);
    const facts = await itemFacts(
      db,
      content.lines.map((line) => line.itemId),
    );
    const units = new Map(
      content.lines.map((line) => [
        line.id,
        facts.get(line.itemId)?.unit ?? "PIECE",
      ]),
    );
    notes.push({
      code: row.code,
      date: row.date ?? "",
      place: row.siteName ?? row.customerName,
      delivered: totals(
        content.picks.map((pick) => ({
          unit: units.get(pick.lineId) as QuantityUnit,
          milli: pick.quantityMilli,
        })),
      ),
      postedAt: row.postedAt ?? new Date(0),
    });
  }
  return {
    days: shown.map((date) => ({
      date: date as BusinessDate,
      notes: notes
        .filter((note) => note.date === date)
        .map((note) => ({
          code: note.code,
          place: note.place,
          delivered: note.delivered,
          postedAt: note.postedAt,
        })),
    })),
    hasMore: dates.length > count,
  };
}
