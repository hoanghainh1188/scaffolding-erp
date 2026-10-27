// Sample stock for `npm run db:seed:dev`, the worked example of design D11
// (GG-K17 Tốt: 195.000 → 195.055 → 195.282 ₫) and some opening stock for the
// other sample items so D10 has something to show. Needs seedCatalog first.
// Running it again adds nothing.
import { eq, inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import { customer, inventoryLedger, item, location, site } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { Condition } from "@/domain/condition";
import type { Movement, MovementDraft } from "@/domain/movement";
import type { Actor } from "@/lib/catalog/common";
import { createSite } from "@/lib/catalog/places";

import { postMovements } from "./post";

/** The sites the D11 example moves stock between. */
export const SAMPLE_SITES = {
  leVanLuong: "Nhà phố Lê Văn Lương",
  maiDich: "Cầu vượt Mai Dịch",
  quangMinh: "Nhà xưởng KCN Quang Minh",
  anPhu: "Chung cư An Phú – Block B",
} as const;
type SiteKey = keyof typeof SAMPLE_SITES;
type Place = "BAI-01" | "XUONG-01" | SiteKey;

const day = (value: string) => value as BusinessDate;

type OpeningRow = [
  code: string,
  Condition,
  Place,
  quantity: number,
  cost: number,
];

/** Stock when the company starts using the software: an opening dated
 * 30/09/2026, so it is the "Tồn đầu kỳ" of October (D11). */
const OPENING: OpeningRow[] = [
  ["GG-K17", "GOOD", "BAI-01", 1220, 195_000],
  ["GG-K17", "GOOD", "leVanLuong", 1200, 195_000],
  ["GG-K17", "GOOD", "maiDich", 800, 195_000],
  ["GG-K17", "NEEDS_REPAIR", "BAI-01", 176, 160_000],
  ["GG-K17", "NEEDS_REPAIR", "XUONG-01", 100, 160_000],
  ["GG-K17", "SCRAP", "BAI-01", 42, 160_000],
  ["GG-K15", "NEW", "BAI-01", 300, 210_000],
  ["GG-K15", "GOOD", "BAI-01", 860, 167_000],
  ["GG-K15", "GOOD", "anPhu", 2140, 167_000],
  ["GG-K15", "NEEDS_REPAIR", "BAI-01", 95, 140_000],
  ["GG-K15", "NEEDS_REPAIR", "XUONG-01", 24, 140_000],
  ["GG-K15", "SCRAP", "BAI-01", 18, 140_000],
  ["GG-CH", "GOOD", "BAI-01", 2480, 31_000],
  ["GG-CH", "GOOD", "anPhu", 7900, 31_000],
  ["GG-CH", "NEEDS_REPAIR", "BAI-01", 320, 25_000],
  ["GG-CH", "SCRAP", "BAI-01", 64, 25_000],
  ["GG-M16", "NEW", "BAI-01", 120, 165_000],
  ["GG-M16", "GOOD", "BAI-01", 640, 152_000],
  ["GG-M16", "GOOD", "anPhu", 1820, 152_000],
  ["GG-M16", "NEEDS_REPAIR", "BAI-01", 75, 98_000],
  ["GG-M16", "NEEDS_REPAIR", "XUONG-01", 12, 98_000],
  ["GG-M16", "SCRAP", "BAI-01", 11, 98_000],
  ["PK-KU", "NEW", "BAI-01", 500, 55_000],
  ["PK-KU", "GOOD", "BAI-01", 410, 52_000],
  ["PK-KU", "GOOD", "anPhu", 1150, 52_000],
  ["PK-KU", "NEEDS_REPAIR", "BAI-01", 30, 40_000],
  ["PK-KU", "SCRAP", "BAI-01", 6, 40_000],
];

/** PL-SAT is counted in kg (thousandths): 12.850,5 kg at 7.952 ₫/kg. */
const SCRAP_KG = { milli: 12_850_500, cost: 7_952 };

type Step = {
  date: string;
  type: string;
  code: string;
  lines: [
    Movement,
    Condition,
    Place,
    pieces: number,
    description: string,
    amount?: number,
  ][];
};

/** GG-K17 in October 2026, as in the table of design D11. */
const K17_STEPS: Step[] = [
  {
    date: "2026-10-03",
    type: "DELIVERY",
    code: "PX-2026-118",
    lines: [
      ["DELIVERY_OUT", "GOOD", "BAI-01", -300, "Xuất cho Cầu vượt Mai Dịch"],
      ["DELIVERY_IN", "GOOD", "maiDich", 300, "Xuất cho Cầu vượt Mai Dịch"],
    ],
  },
  {
    date: "2026-10-08",
    type: "GOODS_RECEIPT",
    code: "PN-2026-087",
    lines: [
      [
        "PURCHASE_IN",
        "GOOD",
        "BAI-01",
        160,
        "Nhập từ PO-2026-052 · anh Trần Văn Hùng",
        31_384_800,
      ],
    ],
  },
  {
    date: "2026-10-12",
    type: "REPAIR",
    code: "PSC-2026-021",
    lines: [
      ["REPAIR_OUT", "NEEDS_REPAIR", "XUONG-01", -40, "Đưa vào sửa"],
      [
        "REPAIR_IN",
        "GOOD",
        "BAI-01",
        40,
        "Sửa xong, chuyển từ Chờ sửa (giá vốn 160.000 ₫ + sửa 54.500 ₫)",
        40 * 160_000 + 40 * 54_500,
      ],
    ],
  },
  {
    date: "2026-10-15",
    type: "RETURN",
    code: "PTH-2026-064",
    lines: [
      [
        "RETURN_OUT",
        "GOOD",
        "leVanLuong",
        -210,
        "Thu hồi từ Nhà phố Lê Văn Lương",
      ],
      ["RETURN_IN", "GOOD", "BAI-01", 210, "Thu hồi từ Nhà phố Lê Văn Lương"],
    ],
  },
  {
    date: "2026-10-16",
    type: "ADJUSTMENT",
    code: "ĐC-2026-004",
    lines: [
      [
        "ADJUST_OUT",
        "GOOD",
        "BAI-01",
        -10,
        "Sửa PTH-2026-064: 10 cái thực tế là Chờ sửa",
      ],
      [
        "ADJUST_IN",
        "NEEDS_REPAIR",
        "BAI-01",
        10,
        "Sửa PTH-2026-064: 10 cái thực tế là Chờ sửa",
      ],
    ],
  },
  {
    date: "2026-10-20",
    type: "DELIVERY",
    code: "PX-2026-131",
    lines: [
      [
        "DELIVERY_OUT",
        "GOOD",
        "BAI-01",
        -120,
        "Xuất cho Nhà xưởng KCN Quang Minh",
      ],
      [
        "DELIVERY_IN",
        "GOOD",
        "quangMinh",
        120,
        "Xuất cho Nhà xưởng KCN Quang Minh",
      ],
    ],
  },
  {
    date: "2026-10-22",
    type: "RETURN",
    code: "PTH-2026-069",
    lines: [
      [
        "RETURN_OUT",
        "GOOD",
        "quangMinh",
        -40,
        "Thu hồi từ Nhà xưởng KCN Quang Minh",
      ],
      [
        "RETURN_IN",
        "GOOD",
        "BAI-01",
        40,
        "Thu hồi từ Nhà xưởng KCN Quang Minh",
      ],
    ],
  },
];

/** The SITE location of each sample site, creating missing sites. */
async function sampleSiteLocations(
  db: Database,
  actor: Actor,
): Promise<Map<SiteKey, string>> {
  const [owner] = await db
    .select({ id: customer.id })
    .from(customer)
    .orderBy(customer.code)
    .limit(1);
  if (!owner) throw new Error("Run seedCatalog first: no customer.");
  const found = new Map<SiteKey, string>();
  for (const [key, name] of Object.entries(SAMPLE_SITES) as [
    SiteKey,
    string,
  ][]) {
    const [row] = await db
      .select({ locationId: site.locationId })
      .from(site)
      .where(eq(site.name, name));
    if (row) {
      found.set(key, row.locationId);
      continue;
    }
    const created = await createSite(db, actor, { name, customerId: owner.id });
    if (!created.ok) throw new Error(`${name}: ${created.error}`);
    found.set(key, created.data.locationId);
  }
  return found;
}

async function idsByCode(
  db: Database,
  table: typeof item | typeof location,
  codes: string[],
): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: table.id, code: table.code })
    .from(table)
    .where(inArray(table.code, codes));
  return new Map(rows.map((row) => [row.code, row.id]));
}

/** Posts the sample stock once; returns the number of ledger lines added. */
export async function seedInventory(
  db: Database,
  actor: Actor,
): Promise<number> {
  const [any] = await db
    .select({ id: inventoryLedger.id })
    .from(inventoryLedger)
    .limit(1);
  if (any) return 0;

  const sites = await sampleSiteLocations(db, actor);
  const items = await idsByCode(db, item, [
    ...new Set([...OPENING.map(([code]) => code), "PL-SAT"]),
  ]);
  const yards = await idsByCode(db, location, ["BAI-01", "XUONG-01"]);
  const place = (value: Place) =>
    (value === "BAI-01" || value === "XUONG-01"
      ? yards.get(value)
      : sites.get(value)) ?? "";
  const itemId = (code: string) => {
    const id = items.get(code);
    if (!id) throw new Error(`Run seedCatalog first: no ${code}.`);
    return id;
  };

  let count = 0;
  await db.transaction(async (tx) => {
    const opening: MovementDraft[] = OPENING.map(
      ([code, condition, where, pieces, cost]) => ({
        itemId: itemId(code),
        condition,
        locationId: place(where),
        movement: "OPENING",
        quantityMilli: pieces * 1000,
        amount: pieces * cost,
        description: "TĐK-2026-001: Tồn đầu kỳ",
      }),
    );
    opening.push({
      itemId: itemId("PL-SAT"),
      condition: "SCRAP",
      locationId: place("BAI-01"),
      movement: "OPENING",
      quantityMilli: SCRAP_KG.milli,
      amount: Math.round((SCRAP_KG.milli * SCRAP_KG.cost) / 1000),
      description: "TĐK-2026-001: Tồn đầu kỳ",
    });
    const first = await postMovements(tx, actor, {
      documentType: "OPENING",
      documentId: null,
      documentCode: "TĐK-2026-001",
      businessDate: day("2026-09-30"),
      lines: opening,
    });
    count += first.lines.length;

    for (const step of K17_STEPS) {
      const posted = await postMovements(tx, actor, {
        documentType: step.type,
        documentId: null,
        documentCode: step.code,
        businessDate: day(step.date),
        lines: step.lines.map(
          (
            [movement, condition, where, pieces, description, amount],
            index,
          ) => ({
            itemId: itemId("GG-K17"),
            condition,
            locationId: place(where),
            movement,
            quantityMilli: pieces * 1000,
            description,
            ...(amount === undefined ? {} : { amount }),
            ...(movement.endsWith("_IN") && index > 0 && amount === undefined
              ? { pairedWith: index - 1 }
              : {}),
          }),
        ),
      });
      count += posted.lines.length;
    }
  });
  return count;
}
