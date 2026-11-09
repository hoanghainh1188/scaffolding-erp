// Sample production data for `npm run db:seed:dev` and `db:seed:demo`
// (production-orders design D8): the materials of drawings D19 / D20 with
// stock at XUONG-01, the scrap item, the BOMs of GG-K17 and GG-CH, one order
// waiting for the director like D20 and one the workshop is making like M10.
// Runs once: nothing is added when the opening document or the samples exist.
import { count, eq, inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  inventoryLedger,
  item,
  itemGroup,
  location,
  productionBom,
  productionOrder,
} from "@/db/schema";
import { toBusinessDate } from "@/domain/business-date";
import type { Actor } from "@/lib/catalog/common";
import { createGroup } from "@/lib/catalog/item-groups";
import { createItem } from "@/lib/catalog/items";
import { postMovements } from "@/lib/inventory/post";
import { currentScrapPrice, setScrapPrice } from "@/lib/receiving/scrap-price";

import { createBom } from "./boms";
import {
  countProductionOrder,
  receiveProductionOrder,
  reportProductionOrder,
  type FloorLineBody,
} from "./floor";
import { assignProductionOrder, createProductionOrder } from "./orders";
import { currentScrapItem, setScrapItem } from "./settings";

const SAMPLE_TEAM = "tổ anh Lực";
const GROUP_NAME = "Nguyên liệu sản xuất";
const OPENING_CODE = "TĐK-SX-001";

const MATERIALS = [
  { code: "VT-ONG42", name: "Ống thép D42 dày 2 ly", unit: "KG", weight: null },
  {
    code: "VT-ONG27",
    name: "Ống thép D27 dày 1,8 ly",
    unit: "KG",
    weight: null,
  },
  { code: "VT-CHOT", name: "Chốt khóa khung", unit: "PIECE", weight: "0.15" },
  { code: "PL-SATVUN", name: "Sắt vụn", unit: "KG", weight: null },
  // Also made by the repair sample; created here when run on their own.
  { code: "VT-QH", name: "Que hàn", unit: "KG", weight: null },
  { code: "VT-SON", name: "Sơn chống gỉ", unit: "LITER", weight: "1.3" },
] as const;

/** [code, stock, ₫ per unit]: enough for the sample order (design D8). */
const OPENING = [
  ["VT-ONG42", 1_200, 19_500],
  ["VT-ONG27", 1_200, 19_000],
  ["VT-CHOT", 600, 2_500],
  ["VT-QH", 20, 45_000],
  ["VT-SON", 20, 90_000],
] as const;

/** Fixed phone draft ids: running the seed again sends nothing twice. */
const DRAFTS = {
  receive: "8f1c2a10-0000-4000-8000-000000000041",
  report: "8f1c2a10-0000-4000-8000-000000000042",
  count: "8f1c2a10-0000-4000-8000-000000000043",
  /** The second order, taken by the workshop only (M10 "Đang làm"). */
  secondReceive: "8f1c2a10-0000-4000-8000-000000000044",
} as const;

export interface ProductionActors {
  director: Actor;
  accountant: Actor;
  workshop: Actor;
  warehouse: Actor;
}

function must<T>(
  result: { ok: true; data: T } | { ok: false; error: string },
): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

async function materialGroup(db: Database, director: Actor): Promise<string> {
  const [found] = await db
    .select({ id: itemGroup.id })
    .from(itemGroup)
    .where(eq(itemGroup.name, GROUP_NAME));
  if (found) return found.id;
  return must(
    await createGroup(db, director, { name: GROUP_NAME, category: "MATERIAL" }),
  ).id;
}

async function seedMaterials(
  db: Database,
  director: Actor,
): Promise<Map<string, string>> {
  const existing = new Map(
    (
      await db
        .select({ id: item.id, code: item.code })
        .from(item)
        .where(
          inArray(
            item.code,
            MATERIALS.map((material) => material.code),
          ),
        )
    ).map((row) => [row.code, row.id]),
  );
  const groupId = await materialGroup(db, director);
  for (const material of MATERIALS) {
    if (existing.has(material.code)) continue;
    const made = must(
      await createItem(db, director, {
        groupId,
        code: material.code,
        name: material.name,
        unit: material.unit,
        standardWeightKg: material.weight,
      }),
    );
    existing.set(material.code, made.id);
  }
  return existing;
}

async function seedOpening(
  db: Database,
  director: Actor,
  ids: ReadonlyMap<string, string>,
  workshopId: string,
): Promise<number> {
  const [done] = await db
    .select({ id: inventoryLedger.id })
    .from(inventoryLedger)
    .where(eq(inventoryLedger.documentCode, OPENING_CODE))
    .limit(1);
  if (done) return 0;
  const today = toBusinessDate(new Date());
  await db.transaction((tx) =>
    postMovements(
      tx,
      director,
      {
        documentType: "OPENING",
        documentId: null,
        documentCode: OPENING_CODE,
        businessDate: today,
        lines: OPENING.map(([code, stock, cost]) => ({
          itemId: ids.get(code) ?? "",
          condition: "NEW" as const,
          locationId: workshopId,
          movement: "OPENING" as const,
          quantityMilli: stock * 1000,
          amount: stock * cost,
          description: "Tồn đầu kỳ nguyên liệu sản xuất",
        })),
      },
      today,
    ),
  );
  return OPENING.length;
}

async function seedBom(
  db: Database,
  actor: Actor,
  code: string,
  laborRate: number,
  materials: readonly (readonly [string, string])[],
  ids: ReadonlyMap<string, string>,
): Promise<number> {
  const [finished] = await db
    .select({ id: item.id, bomId: productionBom.id })
    .from(item)
    .leftJoin(productionBom, eq(productionBom.itemId, item.id))
    .where(eq(item.code, code));
  if (!finished || finished.bomId) return 0;
  must(
    await createBom(db, actor, code, {
      laborRate,
      materials: materials.map(([material, quantity]) => ({
        itemId: ids.get(material) ?? "",
        quantity,
      })),
    }),
  );
  return 1;
}

async function updatedAtOf(db: Database, code: string): Promise<string> {
  const [row] = await db
    .select({ updatedAt: productionOrder.updatedAt })
    .from(productionOrder)
    .where(eq(productionOrder.code, code));
  return row?.updatedAt.toISOString() ?? "";
}

function reported(
  k17: string,
  ch: string,
  ids: ReadonlyMap<string, string>,
): FloorLineBody[] {
  const line = (
    itemId: string,
    finished: string,
    offcutKg: string,
    used: readonly (readonly [string, string])[],
  ): FloorLineBody => ({
    itemId,
    finished,
    offcutKg,
    materials: used.map(([code, quantity]) => ({
      itemId: ids.get(code) ?? "",
      quantity,
    })),
  });
  return [
    line(k17, "100", "38", [
      ["VT-ONG42", "1012"],
      ["VT-ONG27", "391"],
      ["VT-QH", "12.5"],
      ["VT-SON", "8"],
      ["VT-CHOT", "400"],
    ]),
    line(ch, "200", "9", [
      ["VT-ONG27", "586"],
      ["VT-SON", "6"],
    ]),
  ];
}

/** The D20 sample: reported, counted, waiting for the director. */
async function seedOrder(
  db: Database,
  actors: ProductionActors,
  places: { workshopId: string; yardId: string },
  ids: ReadonlyMap<string, string>,
): Promise<number> {
  const [{ value: samples } = { value: 0 }] = await db
    .select({ value: count() })
    .from(productionOrder)
    .where(eq(productionOrder.team, SAMPLE_TEAM));
  if (samples >= 2) return 0;
  const finished = new Map(
    (
      await db
        .select({ id: item.id, code: item.code })
        .from(item)
        .where(inArray(item.code, ["GG-K17", "GG-CH"]))
    ).map((row) => [row.code, row.id]),
  );
  const k17 = finished.get("GG-K17");
  const ch = finished.get("GG-CH");
  if (!k17 || !ch) return 0;
  const newOrder = async () =>
    must(
      await createProductionOrder(db, actors.accountant, {
        workshopId: places.workshopId,
        toLocationId: places.yardId,
        team: SAMPLE_TEAM,
        lines: [
          { itemId: k17, quantity: "100" },
          { itemId: ch, quantity: "200" },
        ],
      }),
    ).code;
  const assignAndReceive = async (code: string, draftId: string) => {
    must(
      await assignProductionOrder(db, actors.accountant, code, {
        updatedAt: await updatedAtOf(db, code),
      }),
    );
    must(
      await receiveProductionOrder(db, actors.workshop, code, {
        draftId,
        updatedAt: await updatedAtOf(db, code),
      }),
    );
  };
  let added = 0;
  if (samples === 0) {
    const code = await newOrder();
    await assignAndReceive(code, DRAFTS.receive);
    const lines = reported(k17, ch, ids);
    must(
      await reportProductionOrder(db, actors.workshop, code, {
        draftId: DRAFTS.report,
        updatedAt: await updatedAtOf(db, code),
        lines,
      }),
    );
    must(
      await countProductionOrder(db, actors.warehouse, code, {
        draftId: DRAFTS.count,
        updatedAt: await updatedAtOf(db, code),
        lines,
      }),
    );
    added += 1;
  }
  await assignAndReceive(await newOrder(), DRAFTS.secondReceive);
  return added + 1;
}

/** Seeds once; returns the number of records added. */
export async function seedProduction(
  db: Database,
  actors: ProductionActors,
): Promise<number> {
  const places = await db
    .select({ id: location.id, code: location.code })
    .from(location)
    .where(inArray(location.code, ["BAI-01", "XUONG-01"]));
  const yardId = places.find((place) => place.code === "BAI-01")?.id;
  const workshopId = places.find((place) => place.code === "XUONG-01")?.id;
  if (!yardId || !workshopId) return 0;
  const ids = await seedMaterials(db, actors.director);
  const stock = await seedOpening(db, actors.director, ids, workshopId);
  if (!(await currentScrapPrice(db))) {
    must(await setScrapPrice(db, actors.director, { pricePerKg: 7_500 }));
  }
  if (!(await currentScrapItem(db))) {
    must(
      await setScrapItem(db, actors.director, {
        itemId: ids.get("PL-SATVUN") ?? "",
      }),
    );
  }
  const boms =
    (await seedBom(
      db,
      actors.accountant,
      "GG-K17",
      35_000,
      [
        ["VT-ONG42", "9.8"],
        ["VT-ONG27", "3.6"],
        ["VT-QH", "0.12"],
        ["VT-SON", "0.08"],
        ["VT-CHOT", "4"],
      ],
      ids,
    )) +
    (await seedBom(
      db,
      actors.accountant,
      "GG-CH",
      8_000,
      [
        ["VT-ONG27", "2.9"],
        ["VT-SON", "0.03"],
      ],
      ids,
    ));
  const order = await seedOrder(db, actors, { workshopId, yardId }, ids);
  return stock + boms + order;
}
