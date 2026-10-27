// Sample catalog for `npm run db:seed:dev`: the numbers drawn in D9 and D16,
// so screens look like their designs. Running it again adds nothing.
import { eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { customer, item, itemGroup, kit, supplier } from "@/db/schema";
import { toSearchText } from "@/domain/search-text";

import type { Actor } from "./common";
import { createGroup } from "./item-groups";
import { createItem, type ItemInput } from "./items";
import { createKit } from "./kits";
import { createCustomer, createSupplier } from "./partners";
import { createSite } from "./places";

const GROUPS = ["Giàn giáo", "Phụ kiện", "Ống thép", "Phế liệu"] as const;

const ITEMS: (ItemInput & { group: (typeof GROUPS)[number] })[] = [
  {
    code: "GG-K17",
    name: "Khung giàn giáo 1,7m",
    group: "Giàn giáo",
    unit: "PIECE",
    standardWeightKg: "13.5",
    dailyRentalPrice: 1200,
    lostPrice: 350_000,
    damagePrice: 60_000,
  },
  {
    code: "GG-K15",
    name: "Khung giàn giáo 1,5m",
    group: "Giàn giáo",
    unit: "PIECE",
    standardWeightKg: "12.2",
    dailyRentalPrice: 1000,
    lostPrice: 320_000,
    damagePrice: 55_000,
  },
  {
    code: "GG-CH",
    name: "Chéo giàn giáo",
    group: "Giàn giáo",
    unit: "PIECE",
    standardWeightKg: "2.8",
    dailyRentalPrice: 300,
    lostPrice: 80_000,
    damagePrice: 15_000,
  },
  {
    code: "GG-M16",
    name: "Mâm giàn giáo 1,6m",
    group: "Giàn giáo",
    unit: "PIECE",
    standardWeightKg: "11",
    dailyRentalPrice: 900,
    lostPrice: 280_000,
    damagePrice: 50_000,
  },
  {
    code: "PK-KU",
    name: "Kích tăng U",
    group: "Phụ kiện",
    unit: "PIECE",
    standardWeightKg: "3.6",
    dailyRentalPrice: 400,
    lostPrice: 90_000,
    damagePrice: 20_000,
  },
  {
    code: "OT-06",
    name: "Tuýp thép 6m",
    group: "Ống thép",
    unit: "PIECE",
    standardWeightKg: "25",
    dailyRentalPrice: 1500,
    lostPrice: 450_000,
    damagePrice: 70_000,
  },
  {
    code: "PK-CX",
    name: "Cùm xoay",
    group: "Phụ kiện",
    unit: "PIECE",
    standardWeightKg: "1.1",
    dailyRentalPrice: 150,
    lostPrice: 30_000,
    damagePrice: 8_000,
  },
  { code: "PL-SAT", name: "Phế liệu sắt lẫn", group: "Phế liệu", unit: "KG" },
];

async function groupIds(db: Database, actor: Actor) {
  const ids = new Map<string, string>();
  for (const [index, name] of GROUPS.entries()) {
    const [found] = await db
      .select({ id: itemGroup.id })
      .from(itemGroup)
      .where(eq(itemGroup.nameKey, toSearchText(name)));
    if (found) {
      ids.set(name, found.id);
      continue;
    }
    const created = await createGroup(db, actor, { name, sortOrder: index });
    if (!created.ok) throw new Error(created.error);
    ids.set(name, created.data.id);
  }
  return ids;
}

async function exists(
  db: Database,
  table: typeof item | typeof kit,
  code: string,
) {
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(table.code, code));
  return row?.id ?? null;
}

/** Adds what is missing; returns how many rows it created. */
export async function seedCatalog(db: Database, actor: Actor): Promise<number> {
  let created = 0;
  const groups = await groupIds(db, actor);
  const ids = new Map<string, string>();

  for (const { group, ...input } of ITEMS) {
    const code = input.code ?? "";
    const id = await exists(db, item, code);
    if (id) {
      ids.set(code, id);
      continue;
    }
    const result = await createItem(db, actor, {
      ...input,
      groupId: groups.get(group),
    });
    if (!result.ok) throw new Error(`${code}: ${result.error}`);
    ids.set(code, result.data.id);
    created += 1;
  }

  if (!(await exists(db, kit, "BO-17"))) {
    const result = await createKit(db, actor, {
      code: "BO-17",
      name: "Bộ giàn giáo 1,7m",
      components: [
        { itemId: ids.get("GG-K17") ?? "", quantity: 2 },
        { itemId: ids.get("GG-CH") ?? "", quantity: 2 },
        { itemId: ids.get("GG-M16") ?? "", quantity: 1 },
      ],
    });
    if (!result.ok) throw new Error(`BO-17: ${result.error}`);
    created += 1;
  }

  const [anyCustomer] = await db
    .select({ id: customer.id })
    .from(customer)
    .limit(1);
  if (!anyCustomer) {
    const minhPhat = await createCustomer(db, actor, {
      kind: "COMPANY",
      name: "Cty TNHH Xây dựng Minh Phát",
      taxCode: "0109876543",
      contactName: "Anh Đỗ Mạnh · chỉ huy trưởng",
      phone: "0912345678",
      address: "Số 18, ngõ 72 Nguyễn Trãi, Thanh Xuân, Hà Nội",
    });
    await createCustomer(db, actor, {
      kind: "PERSON",
      name: "Anh Trần Văn Hùng (cai thầu)",
      phone: "0988123456",
      paymentTermsDays: 15,
    });
    if (minhPhat.ok) {
      for (const [name, address] of [
        ["Chung cư An Phú – Block B", "Hoài Đức, Hà Nội"],
        ["Trường THCS Dương Nội", "Hà Đông, Hà Nội"],
      ] as const) {
        await createSite(db, actor, {
          name,
          address,
          customerId: minhPhat.data.id,
        });
      }
    }
    created += 4;
  }

  const [anySupplier] = await db
    .select({ id: supplier.id })
    .from(supplier)
    .limit(1);
  if (!anySupplier) {
    await createSupplier(db, actor, {
      kind: "COMPANY",
      name: "Cty TNHH Thép Hòa Phát Hà Nội",
      taxCode: "0101234567",
      phone: "0243123456",
    });
    await createSupplier(db, actor, {
      kind: "PERSON",
      name: "Chú Ba ve chai",
      phone: "0977654321",
    });
    created += 2;
  }
  return created;
}
