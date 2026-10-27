// Items (vật tư) for D9 (spec item-catalog, design D1, D3, D4, D7).
import { and, asc, count, eq, ilike, inArray, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import { item, itemGroup, kit, kitComponent } from "@/db/schema";
import { DomainValueError } from "@/domain/errors";
import { parseCatalogCode } from "@/domain/item-code";
import { toMoney, type Money } from "@/domain/money";
import {
  quantityFromDb,
  quantityToDb,
  type QuantityUnit,
} from "@/domain/quantity";
import { toSearchText } from "@/domain/search-text";
import { WEIGHT_MESSAGES } from "@/domain/weight-conversion";

import { claimItemOrKitCode } from "./codes";
import {
  archivedAt,
  badRequest,
  conflict,
  isForeignKeyViolation,
  notFound,
  ok,
  requireName,
  runService,
  ServiceFailure,
  type Actor,
  type CatalogStatus,
  type ServiceResult,
} from "./common";
import { describeStock, isEmpty, itemStock } from "@/lib/inventory/totals";
import {
  describeOrderCodes,
  openOrderCodesForItem,
} from "@/lib/purchasing/references";

export const ITEM_MESSAGES = {
  codeFixed: "Không đổi được mã hàng sau khi tạo",
  unitFixed: "Không đổi được đơn vị sau khi tạo",
  unit: "Chọn đơn vị cái hoặc kg",
  kgNoRental: "Vật tư tính theo kg không cho thuê",
  kgNoWeight: "Vật tư tính theo kg không có trọng lượng chuẩn",
  weightTooBig: "Trọng lượng chuẩn quá lớn",
  negativePrice: "Giá không được âm",
  groupMissing: "Chọn nhóm hàng",
  groupArchived: "Nhóm hàng này đã ngừng dùng",
  inUse: "Vật tư đã được dùng nên chỉ ngừng dùng được",
  inActiveKit: (kitCode: string) =>
    `Bỏ vật tư này khỏi bộ ${kitCode} hoặc ngừng dùng bộ trước`,
  hasStock: (code: string, stock: string) =>
    `${code} còn tồn ${stock}, chỉ ngừng dùng được khi tồn về 0`,
  inOpenOrder: (code: string, orders: string) =>
    `${code} còn trong đơn thu mua đang xử lý: ${orders}`,
} as const;

/** numeric(10,3): below 10.000.000 kg. */
const MAX_WEIGHT_MILLI = 9_999_999_999;

export interface ItemRow {
  id: string;
  code: string;
  name: string;
  groupId: string;
  groupName: string;
  unit: QuantityUnit;
  /** "13.500" (kg per piece), null for items counted in kg. */
  standardWeightKg: string | null;
  dailyRentalPrice: number | null;
  lostPrice: number | null;
  damagePrice: number | null;
  status: CatalogStatus;
}

export interface ItemCounts {
  activeItems: number;
  activeKits: number;
  /** Active items per group id. */
  byGroup: Record<string, number>;
}

export interface ItemFilter {
  q?: string;
  groupId?: string;
  status?: CatalogStatus;
}

const rowColumns = {
  id: item.id,
  code: item.code,
  name: item.name,
  groupId: item.groupId,
  groupName: itemGroup.name,
  unit: item.unit,
  standardWeightKg: item.standardWeightKg,
  dailyRentalPrice: item.dailyRentalPrice,
  lostPrice: item.lostPrice,
  damagePrice: item.damagePrice,
  status: item.status,
};

function toRow(row: {
  unit: string;
  status: string;
  [key: string]: unknown;
}): ItemRow {
  return {
    ...(row as unknown as ItemRow),
    unit: row.unit as QuantityUnit,
    status: row.status as CatalogStatus,
  };
}

/** D9 list: active items by default, name order, plus the header counts. */
export async function listItems(
  db: Database,
  filter: ItemFilter = {},
): Promise<{ items: ItemRow[]; counts: ItemCounts }> {
  const conditions: SQL[] = [eq(item.status, filter.status ?? "ACTIVE")];
  if (filter.groupId) conditions.push(eq(item.groupId, filter.groupId));
  const q = toSearchText(filter.q);
  if (q) conditions.push(ilike(item.searchText, `%${escapeLike(q)}%`));

  const rows = await db
    .select(rowColumns)
    .from(item)
    .innerJoin(itemGroup, eq(itemGroup.id, item.groupId))
    .where(and(...conditions))
    .orderBy(asc(itemGroup.sortOrder), asc(itemGroup.name), asc(item.name));

  const perGroup = await db
    .select({ groupId: item.groupId, value: count() })
    .from(item)
    .where(eq(item.status, "ACTIVE"))
    .groupBy(item.groupId);
  const [kits] = await db
    .select({ value: count() })
    .from(kit)
    .where(eq(kit.status, "ACTIVE"));

  return {
    items: rows.map(toRow),
    counts: {
      activeItems: perGroup.reduce((sum, row) => sum + row.value, 0),
      activeKits: kits?.value ?? 0,
      byGroup: Object.fromEntries(
        perGroup.map((row) => [row.groupId, row.value]),
      ),
    },
  };
}

export async function getItem(
  db: Database,
  id: string,
): Promise<ItemRow | null> {
  const [row] = await db
    .select(rowColumns)
    .from(item)
    .innerJoin(itemGroup, eq(itemGroup.id, item.groupId))
    .where(eq(item.id, id));
  return row ? toRow(row) : null;
}

export interface ItemInput {
  code?: string;
  name?: string;
  groupId?: string;
  unit?: QuantityUnit;
  /** Decimal string in kg, e.g. "13.5"; null for kg items. */
  standardWeightKg?: string | null;
  dailyRentalPrice?: number | null;
  lostPrice?: number | null;
  damagePrice?: number | null;
  status?: CatalogStatus;
}

function price(value: number | null | undefined): Money | null {
  if (value === null || value === undefined) return null;
  const money = toMoney(value);
  if (money < 0) throw new DomainValueError(ITEM_MESSAGES.negativePrice);
  return money;
}

/** Weight and rent rules per unit (spec item-catalog). */
function checkUnitRules(
  unit: QuantityUnit,
  weight: string | null,
  dailyRentalPrice: Money | null,
): string | null {
  if (unit === "KG") {
    if (weight !== null) throw new DomainValueError(ITEM_MESSAGES.kgNoWeight);
    if (dailyRentalPrice !== null) {
      throw new DomainValueError(ITEM_MESSAGES.kgNoRental);
    }
    return null;
  }
  if (weight === null) throw new DomainValueError(WEIGHT_MESSAGES.noWeight);
  const quantity = quantityFromDb(weight, "KG");
  if (quantity.milli <= 0) throw new DomainValueError(WEIGHT_MESSAGES.noWeight);
  if (quantity.milli > MAX_WEIGHT_MILLI) {
    throw new DomainValueError(ITEM_MESSAGES.weightTooBig);
  }
  return quantityToDb(quantity);
}

async function requireActiveGroup(
  db: Pick<Database, "select">,
  groupId: string | undefined,
): Promise<void> {
  if (!groupId) throw new DomainValueError(ITEM_MESSAGES.groupMissing);
  const [group] = await db
    .select({ status: itemGroup.status })
    .from(itemGroup)
    .where(eq(itemGroup.id, groupId));
  if (!group) throw new DomainValueError(ITEM_MESSAGES.groupMissing);
  if (group.status !== "ACTIVE") {
    throw new DomainValueError(ITEM_MESSAGES.groupArchived);
  }
}

export function createItem(
  db: Database,
  actor: Actor,
  input: ItemInput,
): Promise<ServiceResult<ItemRow>> {
  return runService(async () => {
    const code = parseCatalogCode(input.code ?? "");
    const name = requireName(input.name);
    if (input.unit !== "PIECE" && input.unit !== "KG") {
      return badRequest(ITEM_MESSAGES.unit);
    }
    const unit: QuantityUnit = input.unit;
    const rent = price(input.dailyRentalPrice);
    const weight = checkUnitRules(
      input.unit,
      input.standardWeightKg ?? null,
      rent,
    );
    const lost = price(input.lostPrice);
    const damage = price(input.damagePrice);
    await requireActiveGroup(db, input.groupId);

    const id = await db.transaction(async (tx) => {
      await claimItemOrKitCode(tx, code);
      const [row] = await tx
        .insert(item)
        .values({
          code,
          name,
          groupId: input.groupId ?? "",
          unit,
          standardWeightKg: weight,
          dailyRentalPrice: rent,
          lostPrice: lost,
          damagePrice: damage,
          searchText: toSearchText(name, code),
          createdBy: actor.id,
          updatedBy: actor.id,
        })
        .returning({ id: item.id });
      return row?.id ?? "";
    });
    const created = await getItem(db, id);
    return created ? ok(created) : notFound();
  });
}

export function updateItem(
  db: Database,
  actor: Actor,
  id: string,
  input: ItemInput,
): Promise<ServiceResult<ItemRow>> {
  return runService(async () => {
    const found = await db.transaction(async (tx) => {
      // Read under the row lock: a second editor waits here and then works
      // on this change, never on a stale copy (review of PR #28, point 4).
      const [current] = await tx
        .select()
        .from(item)
        .where(eq(item.id, id))
        .for("update");
      if (!current) return false;
      if (
        input.code !== undefined &&
        input.code.trim().toUpperCase() !== current.code
      ) {
        throw new ServiceFailure(badRequest(ITEM_MESSAGES.codeFixed));
      }
      if (input.unit !== undefined && input.unit !== current.unit) {
        throw new ServiceFailure(badRequest(ITEM_MESSAGES.unitFixed));
      }
      const unit = current.unit as QuantityUnit;
      const name =
        input.name === undefined ? current.name : requireName(input.name);
      const rent =
        input.dailyRentalPrice === undefined
          ? (current.dailyRentalPrice as Money | null)
          : price(input.dailyRentalPrice);
      const weight = checkUnitRules(
        unit,
        input.standardWeightKg === undefined
          ? current.standardWeightKg
          : input.standardWeightKg,
        rent,
      );
      if (input.groupId !== undefined && input.groupId !== current.groupId) {
        await requireActiveGroup(tx, input.groupId);
      }
      if (input.status === "ARCHIVED" && current.status === "ACTIVE") {
        // A kit in use would quote a part nobody can pick any more (D7).
        // Kit writers hold this row FOR SHARE, so none can slip in now.
        const [inKit] = await tx
          .select({ code: kit.code })
          .from(kitComponent)
          .innerJoin(kit, eq(kit.id, kitComponent.kitId))
          .where(and(eq(kitComponent.itemId, id), eq(kit.status, "ACTIVE")))
          .orderBy(asc(kit.code))
          .limit(1);
        if (inKit) {
          throw new ServiceFailure(
            conflict(ITEM_MESSAGES.inActiveKit(inKit.code)),
          );
        }
        // An order on its way would bring in an item nobody can post
        // (purchase-orders design D8). Order writers hold this row FOR SHARE.
        const orders = await openOrderCodesForItem(tx, id);
        if (orders.length > 0) {
          throw new ServiceFailure(
            conflict(
              ITEM_MESSAGES.inOpenOrder(
                current.code,
                describeOrderCodes(orders),
              ),
            ),
          );
        }
        // Stock still somewhere, sites included (inventory-ledger). Postings
        // hold this row FOR SHARE, so the total is final while we hold it.
        const stock = await itemStock(tx, id);
        if (!isEmpty(stock)) {
          throw new ServiceFailure(
            conflict(
              ITEM_MESSAGES.hasStock(current.code, describeStock(stock)),
            ),
          );
        }
      }
      await tx
        .update(item)
        .set({
          name,
          groupId: input.groupId ?? current.groupId,
          standardWeightKg: weight,
          dailyRentalPrice: rent,
          lostPrice:
            input.lostPrice === undefined
              ? current.lostPrice
              : price(input.lostPrice),
          damagePrice:
            input.damagePrice === undefined
              ? current.damagePrice
              : price(input.damagePrice),
          searchText: toSearchText(name, current.code),
          ...(input.status === undefined
            ? {}
            : { status: input.status, archivedAt: archivedAt(input.status) }),
          updatedBy: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(item.id, id));
      return true;
    });
    if (!found) return notFound();
    const updated = await getItem(db, id);
    return updated ? ok(updated) : notFound();
  });
}

export function deleteItem(
  db: Database,
  id: string,
): Promise<ServiceResult<null>> {
  return runService(async () => {
    try {
      const deleted = await db
        .delete(item)
        .where(eq(item.id, id))
        .returning({ id: item.id });
      return deleted.length > 0 ? ok(null) : notFound();
    } catch (error: unknown) {
      if (isForeignKeyViolation(error)) return conflict(ITEM_MESSAGES.inUse);
      throw error;
    }
  });
}

/** Items by id, for kit validation. */
export async function itemsByIds(
  db: Pick<Database, "select">,
  ids: readonly string[],
  lock: "share" | null = null,
) {
  if (ids.length === 0) return [];
  const query = db
    .select({
      id: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      status: item.status,
      standardWeightKg: item.standardWeightKg,
      dailyRentalPrice: item.dailyRentalPrice,
    })
    .from(item)
    .where(inArray(item.id, [...ids]));
  // A kit writer holds its parts FOR SHARE: archiving one waits (point 4).
  return lock ? query.for(lock) : query;
}

/** "%" and "_" typed by the user are literal characters, not wildcards. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}
