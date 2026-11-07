// Posting a repair work order (repair-work-orders design D2, D3, D5; spec
// "Ghi sổ lệnh sửa"; 0.2 số 117, số 118, số 127, số 130). One transaction:
// lock the order, then items (repaired and supplies), places and cost pools
// in the shared order; read the supply stock at the workshop under those
// locks; cost each line (labour at the rate taken on assignment + supplies
// at the average, New first) with the simple-repair rules; post Chờ sửa
// out at the workshop, Good and Scrap back where the stock came from,
// supplies out at the workshop; fix the figures on the lines, then freeze.
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  inventoryLedger,
  item,
  location,
  repairOrder,
  repairOrderLine,
  repairOrderMaterial,
} from "@/db/schema";
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import { DomainValueError } from "@/domain/errors";
import { toMoney, type Money } from "@/domain/money";
import {
  QUANTITY_UNIT_LABELS,
  formatQuantity,
  quantityFromDb,
  type QuantityUnit,
} from "@/domain/quantity";
import { unconfirmedAnomalies } from "@/domain/receipt-anomalies";
import {
  REPAIR_DOCUMENT_TYPE,
  RepairFieldError,
  costRepairLine,
  repairAnomalies,
  repairPostedNote,
} from "@/domain/repair-order";
import {
  WORK_ORDER_MESSAGES,
  checkReport,
  issueAmount,
  laborAmount,
  splitMaterialIssue,
  workOrderPostingLines,
  type ReportLine,
  type WorkPostingLine,
} from "@/domain/repair-work-order";
import { logActivity } from "@/lib/activity/log";
import {
  conflict,
  ok,
  ServiceFailure,
  type Actor,
  type ServiceResult,
} from "@/lib/catalog/common";
import {
  POST_MESSAGES,
  lockForPosting,
  pairKey,
  postMovements,
  type Tx,
} from "@/lib/inventory/post";
import { unitFromDb } from "@/lib/inventory/unit";
import { currentScrapPrice } from "@/lib/receiving/scrap-price";

import { repairView, workPostedSummary } from "./activity";
import { runRepair, type PostBody, type PostedRepair } from "./orders";
import { assertFresh, lockWorkOrder, stepOf } from "./work-orders";

const today = () => toBusinessDate(new Date());

interface StoredMaterial {
  rowId: string;
  itemId: string;
  itemCode: string;
  unit: QuantityUnit;
  quantityMilli: number;
}

interface StoredLine extends ReportLine {
  lineId: string;
  laborRate: number | null;
  materials: (ReportLine["materials"][number] & { rowId: string })[];
}

async function storedLines(tx: Tx, orderId: string): Promise<StoredLine[]> {
  const lines = await tx
    .select({
      id: repairOrderLine.id,
      itemId: repairOrderLine.itemId,
      code: item.code,
      unit: item.unit,
      taken: repairOrderLine.quantityTaken,
      good: repairOrderLine.quantityGood,
      scrap: repairOrderLine.quantityScrap,
      laborRate: repairOrderLine.laborRate,
    })
    .from(repairOrderLine)
    .innerJoin(item, eq(item.id, repairOrderLine.itemId))
    .where(eq(repairOrderLine.orderId, orderId))
    .orderBy(asc(repairOrderLine.position));
  const materials = lines.length
    ? await tx
        .select({
          rowId: repairOrderMaterial.id,
          lineId: repairOrderMaterial.lineId,
          itemId: repairOrderMaterial.itemId,
          code: item.code,
          unit: item.unit,
          quantity: repairOrderMaterial.quantity,
        })
        .from(repairOrderMaterial)
        .innerJoin(item, eq(item.id, repairOrderMaterial.itemId))
        .where(
          inArray(
            repairOrderMaterial.lineId,
            lines.map((line) => line.id),
          ),
        )
        .orderBy(asc(item.code))
    : [];
  return lines.map((line) => ({
    lineId: line.id,
    itemId: line.itemId,
    itemCode: line.code,
    unit: unitFromDb(line.unit),
    takenMilli: quantityFromDb(line.taken, "KG").milli,
    goodMilli: quantityFromDb(line.good, "KG").milli,
    scrapMilli: quantityFromDb(line.scrap, "KG").milli,
    laborRate: line.laborRate,
    materials: materials
      .filter((row) => row.lineId === line.id)
      .map((row) => ({
        rowId: row.rowId,
        itemId: row.itemId,
        itemCode: row.code,
        unit: unitFromDb(row.unit),
        // Only material items can be stored (checked when reported).
        category: "MATERIAL" as const,
        quantityMilli: quantityFromDb(row.quantity, "KG").milli,
      })),
  }));
}

/** New and Good stock of the supplies at the workshop, under the locks. */
async function supplyStock(
  tx: Tx,
  itemIds: readonly string[],
  workshopId: string,
): Promise<Map<string, { newMilli: number; goodMilli: number }>> {
  const stock = new Map<string, { newMilli: number; goodMilli: number }>();
  if (itemIds.length === 0) return stock;
  const rows = await tx
    .select({
      itemId: inventoryLedger.itemId,
      condition: inventoryLedger.condition,
      total: sql<string>`coalesce(sum(${inventoryLedger.quantity}), 0)`,
    })
    .from(inventoryLedger)
    .where(
      and(
        inArray(inventoryLedger.itemId, [...itemIds]),
        eq(inventoryLedger.locationId, workshopId),
        inArray(inventoryLedger.condition, ["NEW", "GOOD"]),
      ),
    )
    .groupBy(inventoryLedger.itemId, inventoryLedger.condition);
  for (const row of rows) {
    const entry = stock.get(row.itemId) ?? { newMilli: 0, goodMilli: 0 };
    const milli = quantityFromDb(row.total, "KG").milli;
    if (row.condition === "NEW") entry.newMilli += milli;
    else entry.goodMilli += milli;
    stock.set(row.itemId, entry);
  }
  return stock;
}

function needsOf(lines: readonly StoredLine[]) {
  const need = new Map<string, StoredMaterial>();
  for (const line of lines) {
    for (const material of line.materials) {
      const entry = need.get(material.itemId);
      need.set(material.itemId, {
        ...material,
        quantityMilli: (entry?.quantityMilli ?? 0) + material.quantityMilli,
      });
    }
  }
  return need;
}

/**
 * "Ghi sổ kho" of a counted work order. Short stock (Chờ sửa at the
 * workshop, a supply) refuses the whole order and writes nothing.
 */
export function postWorkOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: PostBody = {},
  now: BusinessDate = today(),
): Promise<ServiceResult<PostedRepair>> {
  return runRepair(async () => {
    const posted = await db.transaction(async (tx) => {
      const order = await lockWorkOrder(tx, code);
      stepOf(order, "post");
      assertFresh(order, body.updatedAt);
      const lines = await storedLines(tx, order.id);
      checkReport(lines);
      const need = needsOf(lines);
      const supplies = [...need.keys()];
      const locks = await lockForPosting(tx, {
        itemIds: [...lines.map((line) => line.itemId), ...supplies],
        locationIds: [order.toLocationId, order.fromLocationId],
        pairs: [
          ...lines.flatMap((line) => [
            { itemId: line.itemId, condition: "NEEDS_REPAIR" as const },
            ...(line.goodMilli > 0
              ? [{ itemId: line.itemId, condition: "GOOD" as const }]
              : []),
            ...(line.scrapMilli > 0
              ? [{ itemId: line.itemId, condition: "SCRAP" as const }]
              : []),
          ]),
          ...supplies.flatMap((itemId) => [
            { itemId, condition: "NEW" as const },
            { itemId, condition: "GOOD" as const },
          ]),
        ],
      });
      const [workshop] = await tx
        .select({ code: location.code })
        .from(location)
        .where(eq(location.id, order.toLocationId));
      const workshopCode = workshop?.code ?? "";
      const pool = (itemId: string, condition: string) =>
        locks.pools.get(pairKey(itemId, condition));

      // Supplies: the whole need of each item against the stock first, so
      // the message names the full stock (spec "Không đủ vật tư").
      const stock = await supplyStock(tx, supplies, order.toLocationId);
      for (const [itemId, material] of need) {
        const have = stock.get(itemId) ?? { newMilli: 0, goodMilli: 0 };
        splitMaterialIssue(material.quantityMilli, have, {
          itemCode: material.itemCode,
          unit: material.unit,
          locationCode: workshopCode,
        });
      }

      const hasScrap = lines.some((line) => line.scrapMilli > 0);
      const price = hasScrap ? await currentScrapPrice(tx) : null;
      const scrapPricePerKg: Money | null = price
        ? toMoney(price.pricePerKg)
        : null;

      const costed = lines.map((line) => {
        if (line.laborRate === null) {
          throw new DomainValueError(
            WORK_ORDER_MESSAGES.noLaborRate(line.itemCode),
          );
        }
        let material = 0;
        const issued = line.materials.map((supply) => {
          const left = stock.get(supply.itemId) ?? {
            newMilli: 0,
            goodMilli: 0,
          };
          const split = splitMaterialIssue(supply.quantityMilli, left, {
            itemCode: supply.itemCode,
            unit: supply.unit,
            locationCode: workshopCode,
          });
          stock.set(supply.itemId, {
            newMilli: left.newMilli - split.newMilli,
            goodMilli: left.goodMilli - split.goodMilli,
          });
          const amount =
            (split.newMilli > 0
              ? issueAmount(
                  split.newMilli,
                  toMoney(pool(supply.itemId, "NEW")?.avgCost ?? 0),
                )
              : 0) +
            (split.goodMilli > 0
              ? issueAmount(
                  split.goodMilli,
                  toMoney(pool(supply.itemId, "GOOD")?.avgCost ?? 0),
                )
              : 0);
          material += amount;
          return {
            rowId: supply.rowId,
            itemId: supply.itemId,
            itemCode: supply.itemCode,
            amount: toMoney(amount),
            ...split,
          };
        });
        const labor = laborAmount(line.goodMilli, toMoney(line.laborRate));
        const needsRepairAvg = pool(line.itemId, "NEEDS_REPAIR")?.avgCost;
        if (needsRepairAvg == null) {
          throw new ServiceFailure(
            conflict(
              POST_MESSAGES.shortage(
                line.itemCode,
                "NEEDS_REPAIR",
                workshopCode,
                `0 ${QUANTITY_UNIT_LABELS[line.unit]}`,
              ),
            ),
          );
        }
        const repairCost = toMoney(labor + material);
        return {
          line,
          labor,
          material: toMoney(material),
          repairCost,
          issued,
          cost: costRepairLine(
            { ...line, repairCost },
            {
              needsRepairAvg,
              standardWeightKg:
                locks.items.get(line.itemId)?.standardWeightKg ?? null,
              scrapPricePerKg,
            },
          ),
        };
      });

      const anomalies = repairAnomalies(
        costed.map((entry) => ({
          itemCode: entry.line.itemCode,
          goodMilli: entry.line.goodMilli,
          repairCost: entry.repairCost,
          goodAvg:
            entry.line.goodMilli > 0
              ? (pool(entry.line.itemId, "GOOD")?.avgCost ?? null)
              : null,
        })),
      );
      const confirmedKeys = body.confirmedOverrides ?? [];
      const [missing] = unconfirmedAnomalies(anomalies, confirmedKeys);
      if (missing) throw new RepairFieldError(missing.question, missing.field);

      const postingLines: WorkPostingLine[] = costed.map((entry) => ({
        itemId: entry.line.itemId,
        itemCode: entry.line.itemCode,
        takenMilli: entry.line.takenMilli,
        goodMilli: entry.line.goodMilli,
        scrapMilli: entry.line.scrapMilli,
        cost: entry.cost,
        materials: entry.issued,
      }));
      const { postingId } = await postMovements(
        tx,
        actor,
        {
          documentType: REPAIR_DOCUMENT_TYPE,
          documentId: order.id,
          documentCode: order.code,
          businessDate: now,
          lines: workOrderPostingLines(order.code, postingLines, {
            workshopId: order.toLocationId,
            returnToId: order.fromLocationId,
          }),
        },
        now,
      );

      // Lines and supplies first: the order is not POSTED yet, so the freeze
      // trigger lets them through.
      for (const entry of costed) {
        await tx
          .update(repairOrderLine)
          .set({
            laborAmount: entry.labor,
            materialAmount: entry.material,
            repairCost: entry.repairCost,
            lossAmount: entry.cost.loss,
          })
          .where(eq(repairOrderLine.id, entry.line.lineId));
        for (const supply of entry.issued) {
          await tx
            .update(repairOrderMaterial)
            .set({ amount: supply.amount })
            .where(eq(repairOrderMaterial.id, supply.rowId));
        }
      }
      const postedAt = new Date();
      const confirmed = anomalies.filter((anomaly) =>
        confirmedKeys.includes(anomaly.key),
      );
      await tx
        .update(repairOrder)
        .set({
          status: "POSTED",
          postedBy: actor.id,
          postedAt,
          postingId,
          scrapPriceUsed: scrapPricePerKg,
          confirmedNote: repairPostedNote(order.code, confirmed),
          updatedAt: postedAt,
        })
        .where(eq(repairOrder.id, order.id));
      await logActivity(tx, actor, {
        action: "POST",
        document: { type: "REPAIR_ORDER", id: order.id, code: order.code },
        summary: workPostedSummary(
          await repairView(tx, order.id),
          {
            labor: costed.reduce((sum, entry) => sum + entry.labor, 0),
            material: costed.reduce((sum, entry) => sum + entry.material, 0),
          },
          confirmed.length > 0
            ? `đã xác nhận ${confirmed.map((anomaly) => anomaly.note).join("; ")}`
            : null,
        ),
        anomaly: confirmed.length > 0,
      });
      return { code: order.code, postingId };
    });
    return ok(posted);
  });
}

/** "6 kg", for messages and previews. */
export function supplyText(milli: number, unit: QuantityUnit): string {
  return `${formatQuantity({ unit, milli })} ${QUANTITY_UNIT_LABELS[unit]}`;
}
