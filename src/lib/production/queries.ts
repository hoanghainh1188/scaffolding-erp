// Reading BOMs and orders for D19, D20 and the list (spec production-boms,
// production-orders): the steps and who took them, the lines with what was
// reported, counted and used, the figures fixed when posted, and the
// averages and workshop stock of now for the preview of an open order.
import { and, asc, count, desc, eq, inArray, notInArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "@/db/client";
import {
  inventoryCost,
  item,
  itemGroup,
  location,
  productionBom,
  productionBomMaterial,
  productionOrder,
  productionOrderLine,
  productionOrderMaterial,
  user,
} from "@/db/schema";
import { toMoney, type Money } from "@/domain/money";
import {
  COUNT_UNITS,
  hasStandardWeight,
  sumByUnit,
  type QuantityUnit,
  type UnitAmount,
} from "@/domain/quantity";
import { normMilli, type ProductionStatus } from "@/domain/production-order";
import { unitFromDb } from "@/lib/inventory/unit";
import { currentScrapPrice } from "@/lib/receiving/scrap-price";
import { workshopSupplies } from "@/lib/repairs/work-queries";

import { milliOf } from "./records";
import { currentScrapItem } from "./settings";

type Reader = Pick<Database, "select">;

const money = (value: number | null): Money | null =>
  value === null ? null : toMoney(value);

const optionalMilli = (value: string | null): number | null =>
  value === null ? null : milliOf(value);

export interface ItemAverages {
  newAvg: Money | null;
  goodAvg: Money | null;
}

/** Averages of now per item, for New and Good. */
async function averagesOf(
  db: Reader,
  itemIds: readonly string[],
): Promise<Record<string, ItemAverages>> {
  const result: Record<string, ItemAverages> = {};
  if (itemIds.length === 0) return result;
  const rows = await db
    .select({
      itemId: inventoryCost.itemId,
      condition: inventoryCost.condition,
      avg: inventoryCost.avgCost,
    })
    .from(inventoryCost)
    .where(
      and(
        inArray(inventoryCost.itemId, [...itemIds]),
        inArray(inventoryCost.condition, ["NEW", "GOOD"]),
      ),
    );
  for (const row of rows) {
    const entry = result[row.itemId] ?? { newAvg: null, goodAvg: null };
    result[row.itemId] = {
      ...entry,
      [row.condition === "NEW" ? "newAvg" : "goodAvg"]: money(row.avg),
    };
  }
  return result;
}

export interface BomListRow {
  itemId: string;
  code: string;
  name: string;
  materialCount: number;
}

/** Items with a BOM, by code (design D9). */
export async function listBoms(db: Reader): Promise<BomListRow[]> {
  return db
    .select({
      itemId: item.id,
      code: item.code,
      name: item.name,
      materialCount: count(productionBomMaterial.id),
    })
    .from(productionBom)
    .innerJoin(item, eq(item.id, productionBom.itemId))
    .leftJoin(
      productionBomMaterial,
      eq(productionBomMaterial.bomId, productionBom.id),
    )
    .groupBy(item.id, item.code, item.name)
    .orderBy(asc(item.code));
}

export interface BomMaterialRow extends ItemAverages {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  perUnitMilli: number;
}

export interface BomDetail {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  laborRate: Money;
  note: string | null;
  updatedAt: Date;
  materials: BomMaterialRow[];
}

export async function getBom(
  db: Reader,
  itemCode: string,
): Promise<BomDetail | null> {
  const [head] = await db
    .select({
      id: productionBom.id,
      itemId: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      laborRate: productionBom.laborRate,
      note: productionBom.note,
      updatedAt: productionBom.updatedAt,
    })
    .from(productionBom)
    .innerJoin(item, eq(item.id, productionBom.itemId))
    .where(eq(item.code, itemCode));
  if (!head) return null;
  const rows = await db
    .select({
      itemId: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      perUnit: productionBomMaterial.quantityPerUnit,
    })
    .from(productionBomMaterial)
    .innerJoin(item, eq(item.id, productionBomMaterial.itemId))
    .where(eq(productionBomMaterial.bomId, head.id))
    .orderBy(asc(productionBomMaterial.position));
  const averages = await averagesOf(
    db,
    rows.map((row) => row.itemId),
  );
  return {
    itemId: head.itemId,
    code: head.code,
    name: head.name,
    unit: unitFromDb(head.unit),
    laborRate: toMoney(head.laborRate),
    note: head.note,
    updatedAt: head.updatedAt,
    materials: rows.map((row) => ({
      itemId: row.itemId,
      code: row.code,
      name: row.name,
      unit: unitFromDb(row.unit),
      perUnitMilli: milliOf(row.perUnit),
      newAvg: averages[row.itemId]?.newAvg ?? null,
      goodAvg: averages[row.itemId]?.goodAvg ?? null,
    })),
  };
}

export interface ItemChoice {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
}

/** Equipment counted in whole units with no BOM yet ("+ Thêm định mức"). */
export async function finishedCandidates(db: Reader): Promise<ItemChoice[]> {
  const taken = db.select({ id: productionBom.itemId }).from(productionBom);
  const rows = await db
    .select({
      itemId: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
    })
    .from(item)
    .innerJoin(itemGroup, eq(itemGroup.id, item.groupId))
    .where(
      and(
        eq(itemGroup.category, "EQUIPMENT"),
        eq(item.status, "ACTIVE"),
        inArray(item.unit, [...COUNT_UNITS]),
        notInArray(item.id, taken),
      ),
    )
    .orderBy(asc(item.code));
  return rows.map((row) => ({ ...row, unit: unitFromDb(row.unit) }));
}

export type MaterialChoice = ItemChoice & ItemAverages;

/** Active material items with today's averages (the D19 picker). */
export async function materialChoices(db: Reader): Promise<MaterialChoice[]> {
  const rows = await db
    .select({
      itemId: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
    })
    .from(item)
    .innerJoin(itemGroup, eq(itemGroup.id, item.groupId))
    .where(and(eq(itemGroup.category, "MATERIAL"), eq(item.status, "ACTIVE")))
    .orderBy(asc(item.code));
  const averages = await averagesOf(
    db,
    rows.map((row) => row.itemId),
  );
  return rows.map((row) => ({
    ...row,
    unit: unitFromDb(row.unit),
    newAvg: averages[row.itemId]?.newAvg ?? null,
    goodAvg: averages[row.itemId]?.goodAvg ?? null,
  }));
}

/** Material items in kg: what can be the scrap item. */
export async function scrapItemChoices(db: Reader): Promise<ItemChoice[]> {
  return (await materialChoices(db))
    .filter((choice) => !hasStandardWeight(choice.unit))
    .map(({ itemId, code, name, unit }) => ({ itemId, code, name, unit }));
}

/** Items that can be an order line: every item with a BOM. */
export async function orderItemChoices(db: Reader): Promise<ItemChoice[]> {
  const rows = await db
    .select({
      itemId: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
    })
    .from(productionBom)
    .innerJoin(item, eq(item.id, productionBom.itemId))
    .where(eq(item.status, "ACTIVE"))
    .orderBy(asc(item.code));
  return rows.map((row) => ({ ...row, unit: unitFromDb(row.unit) }));
}

/** Materials per piece of each item's BOM, for the draft form's preview. */
export async function bomNorms(
  db: Reader,
  itemIds: readonly string[],
): Promise<
  Record<
    string,
    {
      itemId: string;
      code: string;
      name: string;
      unit: QuantityUnit;
      perUnitMilli: number;
    }[]
  >
> {
  const result: Awaited<ReturnType<typeof bomNorms>> = {};
  if (itemIds.length === 0) return result;
  const rows = await db
    .select({
      finishedId: productionBom.itemId,
      itemId: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      perUnit: productionBomMaterial.quantityPerUnit,
    })
    .from(productionBomMaterial)
    .innerJoin(productionBom, eq(productionBom.id, productionBomMaterial.bomId))
    .innerJoin(item, eq(item.id, productionBomMaterial.itemId))
    .where(inArray(productionBom.itemId, [...itemIds]))
    .orderBy(asc(productionBomMaterial.position));
  for (const row of rows) {
    (result[row.finishedId] ??= []).push({
      itemId: row.itemId,
      code: row.code,
      name: row.name,
      unit: unitFromDb(row.unit),
      perUnitMilli: milliOf(row.perUnit),
    });
  }
  return result;
}

const workshop = alias(location, "production_workshop");
const yard = alias(location, "production_yard");

export interface ProductionListRow {
  code: string;
  status: ProductionStatus;
  team: string | null;
  workshopCode: string;
  toCode: string;
  planned: UnitAmount[];
  products: string[];
  createdAt: Date;
}

export async function listProductionOrders(
  db: Reader,
  filter: { status?: ProductionStatus | undefined },
): Promise<ProductionListRow[]> {
  const orders = await db
    .select({
      id: productionOrder.id,
      code: productionOrder.code,
      status: productionOrder.status,
      team: productionOrder.team,
      workshopCode: workshop.code,
      toCode: yard.code,
      createdAt: productionOrder.createdAt,
    })
    .from(productionOrder)
    .innerJoin(workshop, eq(workshop.id, productionOrder.workshopId))
    .innerJoin(yard, eq(yard.id, productionOrder.toLocationId))
    .where(
      filter.status ? eq(productionOrder.status, filter.status) : undefined,
    )
    .orderBy(desc(productionOrder.createdAt), desc(productionOrder.code))
    .limit(200);
  if (orders.length === 0) return [];
  const lines = await db
    .select({
      orderId: productionOrderLine.orderId,
      code: item.code,
      unit: item.unit,
      planned: productionOrderLine.quantityPlanned,
    })
    .from(productionOrderLine)
    .innerJoin(item, eq(item.id, productionOrderLine.itemId))
    .where(
      inArray(
        productionOrderLine.orderId,
        orders.map((order) => order.id),
      ),
    )
    .orderBy(asc(productionOrderLine.position));
  return orders.map(({ id, ...order }) => {
    const own = lines.filter((line) => line.orderId === id);
    return {
      ...order,
      status: order.status as ProductionStatus,
      products: own.map((line) => line.code),
      planned: sumByUnit(
        own.map((line) => ({
          unit: unitFromDb(line.unit),
          milli: milliOf(line.planned),
        })),
      ),
    };
  });
}

export interface ProductionStep {
  by: string | null;
  at: Date | null;
}

export interface ProductionMaterialView extends ItemAverages {
  rowId: string | null;
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  standardWeightKg: string | null;
  /** Per piece; null: added by the workshop. */
  normPerUnitMilli: number | null;
  /** Norm × planned ("nguyên liệu dự kiến"). */
  expectedMilli: number;
  reportedMilli: number | null;
  quantityMilli: number | null;
  /** Fixed when posted. */
  amount: Money | null;
}

export interface ProductionLineDetail {
  lineId: string;
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  plannedMilli: number;
  reportedFinishedMilli: number | null;
  reportedOffcutMilli: number | null;
  finishedMilli: number | null;
  offcutMilli: number | null;
  /** Taken on assignment; the BOM's of now for a draft. */
  laborRate: Money | null;
  laborAmount: Money | null;
  materialAmount: Money | null;
  offcutAmount: Money | null;
  finishedAmount: Money | null;
  /** A line of a draft whose BOM was deleted. */
  missingBom: boolean;
  materials: ProductionMaterialView[];
}

export interface ProductionDetail {
  code: string;
  status: ProductionStatus;
  updatedAt: Date;
  team: string | null;
  note: string | null;
  workshop: { id: string; code: string; name: string };
  to: { id: string; code: string; name: string };
  steps: Record<
    | "created"
    | "assigned"
    | "received"
    | "reported"
    | "counted"
    | "approved"
    | "returned"
    | "posted"
    | "cancelled",
    ProductionStep
  >;
  approveNote: string | null;
  returnNote: string | null;
  cancelReason: string | null;
  /** The price used when posted, else today's. */
  scrapPricePerKg: Money | null;
  scrapItemId: string | null;
  scrapItemCode: string | null;
  lines: ProductionLineDetail[];
  /** Material stock at the workshop, New and Good. */
  stock: {
    itemId: string;
    newMilli: number;
    goodMilli: number;
  }[];
}

type OrderRow = typeof productionOrder.$inferSelect;

async function namesOf(
  db: Reader,
  ids: readonly (string | null)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, unique));
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function stepsOf(
  db: Reader,
  head: OrderRow,
): Promise<ProductionDetail["steps"]> {
  const names = await namesOf(db, [
    head.createdBy,
    head.assignedBy,
    head.receivedBy,
    head.reportedBy,
    head.countedBy,
    head.approvedBy,
    head.returnedBy,
    head.postedBy,
    head.cancelledBy,
  ]);
  const step = (by: string | null, at: Date | null): ProductionStep => ({
    by: by === null ? null : (names.get(by) ?? null),
    at,
  });
  return {
    created: step(head.createdBy, head.createdAt),
    assigned: step(head.assignedBy, head.assignedAt),
    received: step(head.receivedBy, head.receivedAt),
    reported: step(head.reportedBy, head.reportedAt),
    counted: step(head.countedBy, head.countedAt),
    approved: step(head.approvedBy, head.approvedAt),
    returned: step(head.returnedBy, head.returnedAt),
    posted: step(head.postedBy, head.postedAt),
    cancelled: step(head.cancelledBy, head.cancelledAt),
  };
}

async function linesOf(db: Reader, orderId: string) {
  return db
    .select({
      code: item.code,
      name: item.name,
      unit: item.unit,
      line: productionOrderLine,
    })
    .from(productionOrderLine)
    .innerJoin(item, eq(item.id, productionOrderLine.itemId))
    .where(eq(productionOrderLine.orderId, orderId))
    .orderBy(asc(productionOrderLine.position));
}

async function materialsOf(db: Reader, lineIds: readonly string[]) {
  if (lineIds.length === 0) return [];
  return db
    .select({
      code: item.code,
      name: item.name,
      unit: item.unit,
      standardWeightKg: item.standardWeightKg,
      row: productionOrderMaterial,
    })
    .from(productionOrderMaterial)
    .innerJoin(item, eq(item.id, productionOrderMaterial.itemId))
    .where(inArray(productionOrderMaterial.lineId, [...lineIds]))
    .orderBy(asc(item.code));
}

/** What a draft line will take: the BOM as it stands now. */
async function draftBoms(db: Reader, itemIds: readonly string[]) {
  if (itemIds.length === 0) return [];
  return db
    .select({
      finishedId: productionBom.itemId,
      laborRate: productionBom.laborRate,
      itemId: productionBomMaterial.itemId,
      perUnit: productionBomMaterial.quantityPerUnit,
      position: productionBomMaterial.position,
      code: item.code,
      name: item.name,
      unit: item.unit,
      standardWeightKg: item.standardWeightKg,
    })
    .from(productionBom)
    .innerJoin(
      productionBomMaterial,
      eq(productionBomMaterial.bomId, productionBom.id),
    )
    .innerJoin(item, eq(item.id, productionBomMaterial.itemId))
    .where(inArray(productionBom.itemId, [...itemIds]))
    .orderBy(asc(productionBomMaterial.position));
}

type LineRow = Awaited<ReturnType<typeof linesOf>>[number];
type MaterialRow = Awaited<ReturnType<typeof materialsOf>>[number];
type BomRow = Awaited<ReturnType<typeof draftBoms>>[number];

function savedMaterial(
  entry: MaterialRow,
  plannedMilli: number,
): Omit<ProductionMaterialView, keyof ItemAverages> {
  const unit = unitFromDb(entry.unit);
  const norm = optionalMilli(entry.row.normPerUnit);
  return {
    rowId: entry.row.id,
    itemId: entry.row.itemId,
    code: entry.code,
    name: entry.name,
    unit,
    standardWeightKg: entry.standardWeightKg,
    normPerUnitMilli: norm,
    expectedMilli: norm === null ? 0 : normMilli(norm, plannedMilli, unit),
    reportedMilli: optionalMilli(entry.row.reportedQuantity),
    quantityMilli: optionalMilli(entry.row.quantity),
    amount: money(entry.row.amount),
  };
}

function draftMaterial(
  entry: BomRow,
  plannedMilli: number,
): Omit<ProductionMaterialView, keyof ItemAverages> {
  const unit = unitFromDb(entry.unit);
  const norm = milliOf(entry.perUnit);
  return {
    rowId: null,
    itemId: entry.itemId,
    code: entry.code,
    name: entry.name,
    unit,
    standardWeightKg: entry.standardWeightKg,
    normPerUnitMilli: norm,
    expectedMilli: normMilli(norm, plannedMilli, unit),
    reportedMilli: null,
    quantityMilli: null,
    amount: null,
  };
}

function lineDetail(
  entry: LineRow,
  status: ProductionStatus,
  saved: readonly MaterialRow[],
  boms: readonly BomRow[],
  averages: Readonly<Record<string, ItemAverages>>,
): ProductionLineDetail {
  const { line } = entry;
  const plannedMilli = milliOf(line.quantityPlanned);
  const own = boms.filter((row) => row.finishedId === line.itemId);
  const draft = status === "DRAFT";
  const materials = draft
    ? own.map((row) => draftMaterial(row, plannedMilli))
    : saved
        .filter((row) => row.row.lineId === line.id)
        .map((row) => savedMaterial(row, plannedMilli));
  const rate = line.laborRate ?? (draft ? (own[0]?.laborRate ?? null) : null);
  return {
    lineId: line.id,
    itemId: line.itemId,
    code: entry.code,
    name: entry.name,
    unit: unitFromDb(entry.unit),
    plannedMilli,
    reportedFinishedMilli: optionalMilli(line.reportedFinished),
    reportedOffcutMilli: optionalMilli(line.reportedOffcutKg),
    finishedMilli: optionalMilli(line.quantityFinished),
    offcutMilli: optionalMilli(line.offcutKg),
    laborRate: money(rate),
    laborAmount: money(line.laborAmount),
    materialAmount: money(line.materialAmount),
    offcutAmount: money(line.offcutAmount),
    finishedAmount: money(line.finishedAmount),
    missingBom: draft && own.length === 0,
    materials: materials.map((material) => ({
      ...material,
      newAvg: averages[material.itemId]?.newAvg ?? null,
      goodAvg: averages[material.itemId]?.goodAvg ?? null,
    })),
  };
}

export async function getProductionOrder(
  db: Database,
  code: string,
): Promise<ProductionDetail | null> {
  const [found] = await db
    .select({
      order: productionOrder,
      workshopCode: workshop.code,
      workshopName: workshop.name,
      toCode: yard.code,
      toName: yard.name,
    })
    .from(productionOrder)
    .innerJoin(workshop, eq(workshop.id, productionOrder.workshopId))
    .innerJoin(yard, eq(yard.id, productionOrder.toLocationId))
    .where(eq(productionOrder.code, code));
  if (!found) return null;
  const head = found.order;
  const status = head.status as ProductionStatus;
  const rows = await linesOf(db, head.id);
  const saved = await materialsOf(
    db,
    rows.map((row) => row.line.id),
  );
  const boms =
    status === "DRAFT"
      ? await draftBoms(
          db,
          rows.map((row) => row.line.itemId),
        )
      : [];
  const [averages, price, scrap, supplies, steps, posted] = await Promise.all([
    averagesOf(db, [
      ...saved.map((row) => row.row.itemId),
      ...boms.map((row) => row.itemId),
    ]),
    currentScrapPrice(db),
    currentScrapItem(db),
    workshopSupplies(db, head.workshopId),
    stepsOf(db, head),
    head.scrapItemId
      ? db
          .select({ code: item.code })
          .from(item)
          .where(eq(item.id, head.scrapItemId))
      : Promise.resolve([]),
  ]);
  return {
    code: head.code,
    status,
    updatedAt: head.updatedAt,
    team: head.team,
    note: head.note,
    workshop: {
      id: head.workshopId,
      code: found.workshopCode,
      name: found.workshopName,
    },
    to: { id: head.toLocationId, code: found.toCode, name: found.toName },
    steps,
    approveNote: head.approveNote,
    returnNote: head.returnNote,
    cancelReason: head.cancelReason,
    scrapPricePerKg:
      money(head.scrapPriceUsed) ?? (price ? toMoney(price.pricePerKg) : null),
    scrapItemId: head.scrapItemId ?? scrap?.itemId ?? null,
    scrapItemCode: posted[0]?.code ?? scrap?.code ?? null,
    lines: rows.map((row) => lineDetail(row, status, saved, boms, averages)),
    stock: supplies.map(({ itemId, newMilli, goodMilli }) => ({
      itemId,
      newMilli,
      goodMilli,
    })),
  };
}

/** Active workshops and yards for the draft form (lowest code first). */
export { workOrderPlaces as productionPlaces } from "@/lib/repairs/work-orders";
