// Posting a production order (spec "Ghi sổ lệnh sản xuất", design D3, D10).
// One transaction: lock the order; read the scrap item and price; lock items,
// places and cost pools in the shared order; read the materials at the
// workshop under those locks; check and cost with the pure rules; post; fix
// the figures on the lines, then freeze the order.
import { eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  location,
  productionOrder,
  productionOrderLine,
  productionOrderMaterial,
  productionSetting,
} from "@/db/schema";
import type { Condition } from "@/domain/condition";
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import { toMoney, type Money } from "@/domain/money";
import {
  PRODUCTION_DOCUMENT_TYPE,
  checkPosting,
  productionPostingLines,
  type PostingContext,
  type PostingLine,
  type PostingStock,
} from "@/domain/production-order";
import { logActivity } from "@/lib/activity/log";
import { ok, type Actor, type ServiceResult } from "@/lib/catalog/common";
import {
  lockForPosting,
  pairKey,
  postMovements,
  type PostingLocks,
  type Tx,
} from "@/lib/inventory/post";
import { currentScrapPrice } from "@/lib/receiving/scrap-price";
import { supplyStock } from "@/lib/repairs/work-post";

import { postedSummary, productionView } from "./activity";
import {
  assertFresh,
  lockProductionOrder,
  runProduction,
  stepOf,
} from "./common";
import { readPostingLines } from "./records";

const today = () => toBusinessDate(new Date());

export interface ProductionPostBody {
  updatedAt?: string;
}

export interface PostedProductionOrder {
  code: string;
  postingId: string;
}

interface Scrap {
  itemId: string | null;
  pricePerKg: Money | null;
}

async function readScrap(
  tx: Tx,
  lines: readonly PostingLine[],
): Promise<Scrap> {
  if (!lines.some((line) => line.offcutMilli > 0)) {
    return { itemId: null, pricePerKg: null };
  }
  const [setting] = await tx
    .select({ itemId: productionSetting.scrapItemId })
    .from(productionSetting)
    .where(eq(productionSetting.id, 1))
    .for("share");
  const price = await currentScrapPrice(tx);
  return {
    itemId: setting?.itemId ?? null,
    pricePerKg: price ? toMoney(price.pricePerKg) : null,
  };
}

function materialIdsOf(lines: readonly PostingLine[]): string[] {
  return [
    ...new Set(
      lines.flatMap((line) =>
        line.materials
          .filter((material) => material.quantityMilli > 0)
          .map((material) => material.itemId),
      ),
    ),
  ];
}

function lockOrder(
  tx: Tx,
  lines: readonly PostingLine[],
  materialIds: readonly string[],
  scrap: Scrap,
  places: readonly string[],
): Promise<PostingLocks> {
  const hasOffcut = lines.some((line) => line.offcutMilli > 0);
  const scrapId = hasOffcut ? scrap.itemId : null;
  return lockForPosting(tx, {
    itemIds: [
      ...lines.map((line) => line.itemId),
      ...materialIds,
      ...(scrapId ? [scrapId] : []),
    ],
    locationIds: places,
    pairs: [
      ...lines.map((line) => ({
        itemId: line.itemId,
        condition: "NEW" as Condition,
      })),
      ...materialIds.flatMap((itemId) => [
        { itemId, condition: "NEW" as Condition },
        { itemId, condition: "GOOD" as Condition },
      ]),
      ...(scrapId
        ? [{ itemId: scrapId, condition: "SCRAP" as Condition }]
        : []),
    ],
  });
}

async function stockOf(
  tx: Tx,
  materialIds: readonly string[],
  workshopId: string,
  locks: PostingLocks,
): Promise<Map<string, PostingStock>> {
  const held = await supplyStock(tx, materialIds, workshopId);
  const avg = (itemId: string, condition: string) => {
    const value = locks.pools.get(pairKey(itemId, condition))?.avgCost;
    return value == null ? null : toMoney(value);
  };
  return new Map(
    materialIds.map((itemId) => [
      itemId,
      {
        newMilli: held.get(itemId)?.newMilli ?? 0,
        goodMilli: held.get(itemId)?.goodMilli ?? 0,
        newAvg: avg(itemId, "NEW"),
        goodAvg: avg(itemId, "GOOD"),
      },
    ]),
  );
}

async function workshopCode(tx: Tx, id: string): Promise<string> {
  const [row] = await tx
    .select({ code: location.code })
    .from(location)
    .where(eq(location.id, id));
  return row?.code ?? "";
}

/** "Ghi sổ": refuses the whole order and writes nothing when a rule breaks. */
export function postProductionOrder(
  db: Database,
  actor: Actor,
  code: string,
  body: ProductionPostBody = {},
  now: BusinessDate = today(),
): Promise<ServiceResult<PostedProductionOrder>> {
  return runProduction(async () => {
    const posted = await db.transaction(async (tx) => {
      const order = await lockProductionOrder(tx, code);
      assertFresh(order, body.updatedAt);
      stepOf(order, "post");
      const lines = await readPostingLines(tx, order.id);
      const scrap = await readScrap(tx, lines);
      const materialIds = materialIdsOf(lines);
      const locks = await lockOrder(tx, lines, materialIds, scrap, [
        order.workshopId,
        order.toLocationId,
      ]);
      const context: PostingContext = {
        orderCode: order.code,
        workshopId: order.workshopId,
        workshopCode: await workshopCode(tx, order.workshopId),
        toLocationId: order.toLocationId,
        scrapItemId: scrap.itemId,
        scrapPricePerKg: scrap.pricePerKg,
        stock: await stockOf(tx, materialIds, order.workshopId, locks),
      };
      checkPosting(lines, context, order.approvedAt !== null);
      const posting = productionPostingLines(lines, context);
      const { postingId } = await postMovements(
        tx,
        actor,
        {
          documentType: PRODUCTION_DOCUMENT_TYPE,
          documentId: order.id,
          documentCode: order.code,
          businessDate: now,
          lines: posting.drafts,
        },
        now,
      );

      // Lines and materials first: the freeze trigger lets them through
      // while the order is not POSTED yet.
      for (const line of posting.lines) {
        await tx
          .update(productionOrderLine)
          .set({
            laborAmount: line.laborAmount,
            materialAmount: line.materialAmount,
            offcutAmount: line.offcutAmount,
            finishedAmount: line.finishedAmount,
          })
          .where(eq(productionOrderLine.id, line.lineId));
        for (const material of line.materials) {
          await tx
            .update(productionOrderMaterial)
            .set({ amount: material.amount })
            .where(eq(productionOrderMaterial.id, material.rowId));
        }
      }
      const postedAt = new Date();
      const hasOffcut = posting.totals.offcutMilli > 0;
      await tx
        .update(productionOrder)
        .set({
          status: "POSTED",
          postedBy: actor.id,
          postedAt,
          postingId,
          scrapItemId: hasOffcut ? scrap.itemId : null,
          scrapPriceUsed: hasOffcut ? scrap.pricePerKg : null,
          updatedAt: postedAt,
        })
        .where(eq(productionOrder.id, order.id));
      await logActivity(tx, actor, {
        action: "POST",
        document: { type: "PRODUCTION_ORDER", id: order.id, code: order.code },
        summary: postedSummary(
          await productionView(tx, order.id),
          posting.totals,
        ),
      });
      return { code: order.code, postingId };
    });
    return ok(posted);
  });
}
