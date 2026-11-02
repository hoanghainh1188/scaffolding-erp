// Sample catalog for `npm run db:seed:dev`: the numbers drawn in D9 and D16,
// so screens look like their designs. Running it again adds nothing.
import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  customer,
  item,
  itemGroup,
  kit,
  site,
  supplier,
  user,
} from "@/db/schema";
import { toSearchText } from "@/domain/search-text";

import type { Actor } from "./common";
import { createGroup } from "./item-groups";
import { createItem, getItem, updateItem, type ItemInput } from "./items";
import { createKit } from "./kits";
import { createCustomer, createSupplier, updateCustomer } from "./partners";
import { createSite, updateSite } from "./places";

const GROUPS = [
  "Giàn giáo",
  "Phụ kiện",
  "Ống thép",
  "Phế liệu",
  "Que hàn",
] as const;

/** Groups that hold raw materials (catalog-extensions D3). */
const MATERIAL_GROUPS: readonly string[] = ["Que hàn"];

/** Old codes of sample items (catalog-extensions D1). */
const OLD_CODES: Readonly<Record<string, string[]>> = { "GG-K17": ["K1,7"] };

/** Provinces of the sample sites, by name (catalog-extensions D4). */
const SITE_PROVINCES: Readonly<Record<string, string>> = {
  "Chung cư An Phú – Block B": "HN",
  "Trường THCS Dương Nội": "HN",
  "Nhà phố Lê Văn Lương": "HN",
  "Cầu vượt Mai Dịch": "HN",
  "Nhà xưởng KCN Quang Minh": "HN",
};

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
  // The company's real codes and units (catalog-extensions, 0.2 #37).
  {
    code: "H1,7",
    name: "Khung H 1,7m có đầu",
    group: "Giàn giáo",
    unit: "PIECE",
    standardWeightKg: "13.2",
    dailyRentalPrice: 1200,
  },
  {
    code: "H1,7KĐ",
    name: "Khung H 1,7m không đầu",
    group: "Giàn giáo",
    unit: "PIECE",
    standardWeightKg: "13.2",
    dailyRentalPrice: 1100,
  },
  {
    code: "KB+KU34",
    name: "Kích bát kèm kích U 34",
    group: "Phụ kiện",
    unit: "PIECE",
    standardWeightKg: "4.1",
    dailyRentalPrice: 300,
  },
  {
    code: "NỐI 34",
    name: "Ống nối 34",
    group: "Phụ kiện",
    unit: "PIECE",
    standardWeightKg: "0.8",
    dailyRentalPrice: 50,
  },
  {
    code: "ONG-49",
    name: "Thép ống D49",
    group: "Ống thép",
    unit: "METER",
    standardWeightKg: "3.56",
    dailyRentalPrice: 150,
  },
  {
    code: "TY-REN",
    name: "Ty ren",
    group: "Phụ kiện",
    unit: "BUNDLE",
    standardWeightKg: "25",
  },
  {
    code: "QH-2,5",
    name: "Que hàn 2,5 ly",
    group: "Que hàn",
    unit: "BOX",
    standardWeightKg: "5",
  },
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
    const created = await createGroup(db, actor, {
      name,
      sortOrder: index,
      category: MATERIAL_GROUPS.includes(name) ? "MATERIAL" : "EQUIPMENT",
    });
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

  for (const [code, aliases] of Object.entries(OLD_CODES)) {
    const id = ids.get(code);
    const current = id ? await getItem(db, id) : null;
    if (!id || !current || current.aliases.length > 0) continue;
    const result = await updateItem(db, actor, id, { aliases });
    if (!result.ok) throw new Error(`${code}: ${result.error}`);
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
          province: "HN",
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
  await placeSampleSites(db, actor);
  await assignSalesStaff(db, actor);
  return created;
}

/** Sample sites made before provinces existed get theirs. */
async function placeSampleSites(db: Database, actor: Actor): Promise<void> {
  const rows = await db
    .select({ id: site.id, name: site.name })
    .from(site)
    .where(isNull(site.province));
  for (const row of rows) {
    const province = SITE_PROVINCES[row.name];
    if (!province) continue;
    const result = await updateSite(db, actor, row.id, { province });
    if (!result.ok) throw new Error(`${row.name}: ${result.error}`);
  }
}

/** The sample sales account takes care of Minh Phát (catalog-extensions D5). */
async function assignSalesStaff(db: Database, actor: Actor): Promise<void> {
  const [sales] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.username, "kinhdoanh"), eq(user.status, "ACTIVE")));
  if (!sales) return;
  const rows = await db
    .select({ id: customer.id })
    .from(customer)
    .where(
      and(
        eq(customer.name, "Cty TNHH Xây dựng Minh Phát"),
        isNull(customer.salesUserId),
      ),
    );
  for (const row of rows) {
    const result = await updateCustomer(db, actor, row.id, {
      salesUserId: sales.id,
    });
    if (!result.ok) throw new Error(result.error);
  }
}
