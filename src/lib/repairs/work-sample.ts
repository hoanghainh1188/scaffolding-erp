// Sample work order for `npm run db:seed:dev` and `db:seed:demo`
// (repair-work-orders task 9.1): the supply items of drawing D12 with stock
// at XUONG-01, labour rates for GG-K17 and GG-CH, and one order counted by
// the storekeeper, waiting to be posted like D12 (GG-CH stands in for
// CHEO-1,7, which the sample catalog has not). Runs once: fixed draft ids,
// and nothing is added when a work order exists already.
import { and, eq, inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  inventoryLedger,
  item,
  itemGroup,
  location,
  repairOrder,
} from "@/db/schema";
import { toBusinessDate } from "@/domain/business-date";
import type { Actor } from "@/lib/catalog/common";
import { createGroup } from "@/lib/catalog/item-groups";
import { createItem, setRepairLaborRate } from "@/lib/catalog/items";
import { postMovements } from "@/lib/inventory/post";

import {
  countWorkOrder,
  receiveWorkOrder,
  reportWorkOrder,
} from "./work-floor";
import { assignWorkOrder, createWorkOrder } from "./work-orders";

const SUPPLIES = [
  {
    code: "VT-QH",
    name: "Que hàn",
    unit: "KG",
    weight: null,
    stock: 18,
    cost: 45_000,
  },
  {
    code: "VT-SON",
    name: "Sơn chống gỉ",
    unit: "LITER",
    weight: "1.3",
    stock: 12,
    cost: 90_000,
  },
  {
    code: "VT-BL12",
    name: "Bu lông M12",
    unit: "PIECE",
    weight: "0.1",
    stock: 340,
    cost: 2_500,
  },
] as const;

const RATES = [
  ["GG-K17", 40_000],
  ["GG-CH", 10_000],
] as const;

/** Fixed phone draft ids: running the seed again sends nothing twice. */
const DRAFTS = {
  receive: "8f1c2a10-0000-4000-8000-000000000031",
  report: "8f1c2a10-0000-4000-8000-000000000032",
  count: "8f1c2a10-0000-4000-8000-000000000033",
} as const;

export interface WorkOrderActors {
  director: Actor;
  accountant: Actor;
  workshop: Actor;
  warehouse: Actor;
}

async function supplyGroup(db: Database, director: Actor): Promise<string> {
  const [found] = await db
    .select({ id: itemGroup.id })
    .from(itemGroup)
    .where(eq(itemGroup.category, "MATERIAL"))
    .limit(1);
  if (found) return found.id;
  const created = await createGroup(db, director, {
    name: "Vật tư phụ",
    category: "MATERIAL",
  });
  if (!created.ok) throw new Error(created.error);
  return created.data.id;
}

/** Supply items with their stock at the workshop; returns lines added. */
async function seedSupplies(db: Database, director: Actor, workshopId: string) {
  const groupId = await supplyGroup(db, director);
  const ids = new Map<string, string>();
  for (const supply of SUPPLIES) {
    const [found] = await db
      .select({ id: item.id })
      .from(item)
      .where(eq(item.code, supply.code));
    if (found) {
      ids.set(supply.code, found.id);
      continue;
    }
    const created = await createItem(db, director, {
      groupId,
      code: supply.code,
      name: supply.name,
      unit: supply.unit,
      standardWeightKg: supply.weight,
    });
    if (!created.ok) throw new Error(created.error);
    ids.set(supply.code, created.data.id);
  }
  const [any] = await db
    .select({ id: inventoryLedger.id })
    .from(inventoryLedger)
    .where(inArray(inventoryLedger.itemId, [...ids.values()]))
    .limit(1);
  if (any) return { ids, lines: 0 };
  const today = toBusinessDate(new Date());
  await db.transaction((tx) =>
    postMovements(
      tx,
      director,
      {
        documentType: "OPENING",
        documentId: null,
        documentCode: "TĐK-VT-001",
        businessDate: today,
        lines: SUPPLIES.map((supply) => ({
          itemId: ids.get(supply.code) ?? "",
          condition: "NEW" as const,
          locationId: workshopId,
          movement: "OPENING" as const,
          quantityMilli: supply.stock * 1000,
          amount: supply.stock * supply.cost,
          description: "Tồn đầu kỳ vật tư phụ ở xưởng",
        })),
      },
      today,
    ),
  );
  return { ids, lines: SUPPLIES.length };
}

async function updatedAtOf(db: Database, code: string): Promise<string> {
  const [row] = await db
    .select({ updatedAt: repairOrder.updatedAt })
    .from(repairOrder)
    .where(eq(repairOrder.code, code));
  return row?.updatedAt.toISOString() ?? "";
}

function must<T>(
  result: { ok: true; data: T } | { ok: false; error: string },
): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/** Seeds once; returns the number of rows added (supplies, order). */
export async function seedWorkOrders(
  db: Database,
  actors: WorkOrderActors,
): Promise<number> {
  const places = await db
    .select({ id: location.id, code: location.code })
    .from(location)
    .where(inArray(location.code, ["BAI-01", "XUONG-01"]));
  const yard = places.find((place) => place.code === "BAI-01")?.id;
  const workshop = places.find((place) => place.code === "XUONG-01")?.id;
  if (!yard || !workshop) return 0;
  const { ids, lines } = await seedSupplies(db, actors.director, workshop);
  const equipment = new Map(
    (
      await db
        .select({ id: item.id, code: item.code, rate: item.repairLaborRate })
        .from(item)
        .where(
          inArray(
            item.code,
            RATES.map(([code]) => code),
          ),
        )
    ).map((row) => [row.code, row]),
  );
  for (const [code, rate] of RATES) {
    const row = equipment.get(code);
    if (row && row.rate === null) {
      must(await setRepairLaborRate(db, actors.director, row.id, rate));
    }
  }
  const [existing] = await db
    .select({ id: repairOrder.id })
    .from(repairOrder)
    .where(and(eq(repairOrder.kind, "WORK_ORDER")))
    .limit(1);
  const k17 = equipment.get("GG-K17")?.id;
  const ch = equipment.get("GG-CH")?.id;
  if (existing || !k17 || !ch) return lines;
  const { code } = must(
    await createWorkOrder(db, actors.accountant, {
      workshopId: workshop,
      fromLocationId: yard,
      repairedBy: "tổ anh Lực",
      lines: [
        { itemId: k17, quantityTaken: "40" },
        { itemId: ch, quantityTaken: "20" },
      ],
    }),
  );
  must(
    await assignWorkOrder(db, actors.accountant, code, {
      updatedAt: await updatedAtOf(db, code),
    }),
  );
  must(
    await receiveWorkOrder(db, actors.workshop, code, {
      draftId: DRAFTS.receive,
      updatedAt: await updatedAtOf(db, code),
    }),
  );
  const report = [
    {
      itemId: k17,
      good: "36",
      scrap: "4",
      materials: [
        { itemId: ids.get("VT-QH"), quantity: "6" },
        { itemId: ids.get("VT-SON"), quantity: "3" },
      ],
    },
    {
      itemId: ch,
      good: "20",
      scrap: "0",
      materials: [{ itemId: ids.get("VT-SON"), quantity: "0.5" }],
    },
  ];
  must(
    await reportWorkOrder(db, actors.workshop, code, {
      draftId: DRAFTS.report,
      updatedAt: await updatedAtOf(db, code),
      lines: report,
    }),
  );
  must(
    await countWorkOrder(db, actors.warehouse, code, {
      draftId: DRAFTS.count,
      updatedAt: await updatedAtOf(db, code),
      lines: report,
    }),
  );
  return lines + 1;
}
