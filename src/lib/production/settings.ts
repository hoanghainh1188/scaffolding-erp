// The scrap item that receives the offcuts (spec production-boms, 0.2 số 152).
import { eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { item, productionSetting } from "@/db/schema";
import {
  BOM_MESSAGES,
  ProductionFieldError,
  isScrapItemKind,
} from "@/domain/production-bom";
import { logActivity } from "@/lib/activity/log";
import { ok, type Actor, type ServiceResult } from "@/lib/catalog/common";

import { loadBomItems } from "./boms";
import { UUID, runProduction } from "./common";

export interface ScrapItemView {
  itemId: string;
  code: string;
  name: string;
}

export async function currentScrapItem(
  db: Pick<Database, "select">,
): Promise<ScrapItemView | null> {
  const [row] = await db
    .select({ itemId: item.id, code: item.code, name: item.name })
    .from(productionSetting)
    .innerJoin(item, eq(item.id, productionSetting.scrapItemId))
    .where(eq(productionSetting.id, 1));
  return row ?? null;
}

/** "Mã sắt vụn" on the scrap-price page; the same item writes nothing. */
export function setScrapItem(
  db: Database,
  actor: Actor,
  body: { itemId?: string },
): Promise<ServiceResult<{ code: string }>> {
  return runProduction(async () => {
    const itemId = body.itemId ?? "";
    if (!UUID.test(itemId)) {
      throw new ProductionFieldError(BOM_MESSAGES.scrapItem, "itemId");
    }
    const code = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ scrapItemId: productionSetting.scrapItemId })
        .from(productionSetting)
        .where(eq(productionSetting.id, 1))
        .for("update");
      const found = (await loadBomItems(tx, [itemId])).get(itemId);
      if (!found || !isScrapItemKind(found)) {
        throw new ProductionFieldError(BOM_MESSAGES.scrapItem, "itemId");
      }
      if (current?.scrapItemId === itemId) return found.itemCode;
      const before = current?.scrapItemId
        ? (await currentScrapItem(tx))?.code
        : null;
      const updatedAt = new Date();
      await tx
        .insert(productionSetting)
        .values({ id: 1, scrapItemId: itemId, updatedBy: actor.id, updatedAt })
        .onConflictDoUpdate({
          target: productionSetting.id,
          set: { scrapItemId: itemId, updatedBy: actor.id, updatedAt },
        });
      await logActivity(tx, actor, {
        action: "UPDATE",
        document: { type: "SCRAP_PRICE", id: itemId, code: found.itemCode },
        summary: `Mã sắt vụn: ${before ?? "chưa chọn"} → ${found.itemCode}`,
        changes: [
          {
            field: "scrapItem",
            label: "Mã sắt vụn",
            before: before ?? null,
            after: found.itemCode,
          },
        ],
      });
      return found.itemCode;
    });
    return ok({ code });
  });
}
