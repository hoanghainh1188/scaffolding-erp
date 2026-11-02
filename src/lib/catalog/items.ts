// Items (vật tư) for D9 (spec item-catalog, design D1, D3, D4, D7;
// catalog-extensions D1–D3: real codes, old codes, 9 units, categories).
import { and, asc, count, eq, ilike, inArray, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import { item, itemAlias, itemGroup, kit, kitComponent } from "@/db/schema";
import { DomainValueError } from "@/domain/errors";
import {
  isValidItemCode,
  itemCodeKey,
  normalizeItemCode,
  parseItemCode,
} from "@/domain/item-code";
import { toMoney, type Money } from "@/domain/money";
import {
  QUANTITY_UNIT_LABELS,
  hasStandardWeight,
  isQuantityUnit,
  quantityFromDb,
  quantityToDb,
  type QuantityUnit,
} from "@/domain/quantity";
import { toSearchText } from "@/domain/search-text";
import { WEIGHT_MESSAGES } from "@/domain/weight-conversion";

import { diffFields } from "@/domain/activity-changes";
import { changeSummary, joinParts } from "@/domain/activity-summary";
import { ITEM_FIELDS, type ItemView } from "@/lib/activity/fields";
import { logActivity } from "@/lib/activity/log";

import { claimItemOrKitCode, claimOldCodes } from "./codes";
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

/** Old codes per item (design D1). */
export const MAX_OLD_CODES = 5;

export type ItemCategory = "EQUIPMENT" | "MATERIAL";
export const ITEM_CATEGORIES: readonly ItemCategory[] = [
  "EQUIPMENT",
  "MATERIAL",
];

export const ITEM_MESSAGES = {
  codeFixed: "Không đổi được mã hàng sau khi tạo",
  unitFixed: "Không đổi được đơn vị sau khi tạo",
  unit: "Chọn đơn vị của vật tư",
  tooManyOldCodes: `Mỗi vật tư có tối đa ${MAX_OLD_CODES} mã cũ`,
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
  /** From the item's group (design D3). */
  category: ItemCategory;
  unit: QuantityUnit;
  /** "cái", "m", "bó"... */
  unitLabel: string;
  /** Old codes, in the order they were added. */
  aliases: string[];
  /** "13.500" (kg per unit), null for items counted in kg. */
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
  category?: ItemCategory;
  groupId?: string;
  status?: CatalogStatus;
}

const rowColumns = {
  id: item.id,
  code: item.code,
  name: item.name,
  groupId: item.groupId,
  groupName: itemGroup.name,
  category: itemGroup.category,
  unit: item.unit,
  standardWeightKg: item.standardWeightKg,
  dailyRentalPrice: item.dailyRentalPrice,
  lostPrice: item.lostPrice,
  damagePrice: item.damagePrice,
  status: item.status,
};

function toRow(
  row: {
    id: string;
    unit: string;
    category: string;
    status: string;
    [key: string]: unknown;
  },
  aliases: ReadonlyMap<string, string[]>,
): ItemRow {
  const unit = row.unit as QuantityUnit;
  return {
    ...(row as unknown as ItemRow),
    category: row.category as ItemCategory,
    unit,
    unitLabel: QUANTITY_UNIT_LABELS[unit],
    aliases: aliases.get(row.id) ?? [],
    status: row.status as CatalogStatus,
  };
}

/** Old codes per item id, in the order they were added. */
export async function oldCodesOf(
  db: Pick<Database, "select">,
  ids: readonly string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (ids.length === 0) return result;
  const rows = await db
    .select({ itemId: itemAlias.itemId, code: itemAlias.code })
    .from(itemAlias)
    .where(inArray(itemAlias.itemId, [...ids]))
    .orderBy(asc(itemAlias.createdAt), asc(itemAlias.code));
  for (const row of rows) {
    result.set(row.itemId, [...(result.get(row.itemId) ?? []), row.code]);
  }
  return result;
}

/** Name, code and old codes, with their keys: NỐI 34 is found by "noi34". */
function itemSearchText(
  name: string,
  code: string,
  aliases: readonly string[],
): string {
  return toSearchText(
    name,
    code,
    itemCodeKey(code),
    ...aliases.flatMap((alias) => [alias, itemCodeKey(alias)]),
  );
}

/** D9 list: active items by default, name order, plus the header counts. */
export async function listItems(
  db: Database,
  filter: ItemFilter = {},
): Promise<{ items: ItemRow[]; counts: ItemCounts }> {
  const conditions: SQL[] = [eq(item.status, filter.status ?? "ACTIVE")];
  if (filter.category) {
    conditions.push(eq(itemGroup.category, filter.category));
  }
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

  const aliases = await oldCodesOf(
    db,
    rows.map((row) => row.id),
  );
  return {
    items: rows.map((row) => toRow(row, aliases)),
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
  return row ? toRow(row, await oldCodesOf(db, [id])) : null;
}

export interface ItemInput {
  code?: string;
  name?: string;
  groupId?: string;
  unit?: QuantityUnit;
  /** The full list of old codes after the change (design D7). */
  aliases?: string[];
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

/**
 * Weight rules per unit (spec item-catalog): every unit but kg has a
 * standard weight. Any unit may have a rental price (design D2).
 */
function checkUnitRules(
  unit: QuantityUnit,
  weight: string | null,
): string | null {
  if (!hasStandardWeight(unit)) {
    if (weight !== null) throw new DomainValueError(ITEM_MESSAGES.kgNoWeight);
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

/** Old codes as typed: normalized, at most MAX_OLD_CODES. */
function parseOldCodes(input: readonly string[]): string[] {
  const codes = input
    .filter((code) => code.trim() !== "")
    .map((code) => parseItemCode(code));
  if (codes.length > MAX_OLD_CODES) {
    throw new DomainValueError(ITEM_MESSAGES.tooManyOldCodes);
  }
  return codes;
}

/** Replaces the old codes of an item; the caller holds the code lock. */
async function writeOldCodes(
  tx: Pick<Database, "delete" | "insert">,
  actor: Actor,
  itemId: string,
  codes: readonly string[],
): Promise<void> {
  await tx.delete(itemAlias).where(eq(itemAlias.itemId, itemId));
  if (codes.length === 0) return;
  await tx
    .insert(itemAlias)
    .values(codes.map((code) => ({ itemId, code, createdBy: actor.id })));
}

/** "Mã cũ thêm K1,7, KHUNG 1M7; bỏ GG17" (spec: Mã cũ của vật tư). */
function oldCodesPhrase(
  before: readonly string[],
  after: readonly string[],
): string | null {
  const added = after.filter((code) => !before.includes(code));
  const removed = before.filter((code) => !after.includes(code));
  const parts = [
    added.length > 0 ? `thêm ${added.join(", ")}` : null,
    removed.length > 0 ? `bỏ ${removed.join(", ")}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? `Mã cũ ${parts.join("; ")}` : null;
}

/** An item as the activity log compares it: the group by its name. */
async function itemView(
  tx: Pick<Database, "select">,
  row: Omit<ItemView, "groupName" | "unit"> & {
    groupId: string;
    unit: string;
  },
): Promise<ItemView> {
  const [group] = await tx
    .select({ name: itemGroup.name })
    .from(itemGroup)
    .where(eq(itemGroup.id, row.groupId));
  return {
    name: row.name,
    groupName: group?.name ?? "",
    unit: row.unit as QuantityUnit,
    aliases: row.aliases,
    standardWeightKg: row.standardWeightKg,
    dailyRentalPrice: row.dailyRentalPrice,
    lostPrice: row.lostPrice,
    damagePrice: row.damagePrice,
    status: row.status,
  };
}

export function createItem(
  db: Database,
  actor: Actor,
  input: ItemInput,
): Promise<ServiceResult<ItemRow>> {
  return runService(async () => {
    const code = parseItemCode(input.code ?? "");
    const name = requireName(input.name);
    if (!isQuantityUnit(input.unit)) return badRequest(ITEM_MESSAGES.unit);
    const unit: QuantityUnit = input.unit;
    const rent = price(input.dailyRentalPrice);
    const weight = checkUnitRules(unit, input.standardWeightKg ?? null);
    const aliases = parseOldCodes(input.aliases ?? []);
    const lost = price(input.lostPrice);
    const damage = price(input.damagePrice);
    await requireActiveGroup(db, input.groupId);

    const id = await db.transaction(async (tx) => {
      await claimItemOrKitCode(tx, code);
      // Same lock: the old codes are checked against the new code too.
      await claimOldCodes(tx, "", code, aliases);
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
          searchText: itemSearchText(name, code, aliases),
          createdBy: actor.id,
          updatedBy: actor.id,
        })
        .returning({ id: item.id });
      const id = row?.id ?? "";
      await writeOldCodes(tx, actor, id, aliases);
      await logActivity(tx, actor, {
        action: "CREATE",
        document: { type: "ITEM", id, code },
        summary: joinParts(
          name,
          `tính theo ${QUANTITY_UNIT_LABELS[unit]}`,
          aliases.length > 0 && `mã cũ ${aliases.join(", ")}`,
        ),
      });
      return id;
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
        normalizeItemCode(input.code) !== current.code
      ) {
        throw new ServiceFailure(badRequest(ITEM_MESSAGES.codeFixed));
      }
      if (input.unit !== undefined && input.unit !== current.unit) {
        throw new ServiceFailure(badRequest(ITEM_MESSAGES.unitFixed));
      }
      const unit = current.unit as QuantityUnit;
      const currentAliases = (await oldCodesOf(tx, [id])).get(id) ?? [];
      const aliases =
        input.aliases === undefined
          ? currentAliases
          : parseOldCodes(input.aliases);
      const aliasesChanged = aliases.join("\n") !== currentAliases.join("\n");
      if (aliasesChanged) {
        await claimOldCodes(tx, id, current.code, aliases);
      }
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
      const next = {
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
        status: input.status ?? current.status,
      };
      await tx
        .update(item)
        .set({
          ...next,
          searchText: itemSearchText(name, current.code, aliases),
          ...(input.status === undefined
            ? {}
            : { archivedAt: archivedAt(input.status) }),
          updatedBy: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(item.id, id));
      if (aliasesChanged) await writeOldCodes(tx, actor, id, aliases);
      const changes = diffFields(
        ITEM_FIELDS,
        await itemView(tx, { ...current, aliases: currentAliases }),
        await itemView(tx, { ...next, unit, aliases }),
      );
      if (changes.length > 0) {
        const aliasPhrase = oldCodesPhrase(currentAliases, aliases);
        const rest = changes.filter((change) => change.field !== "aliases");
        await logActivity(tx, actor, {
          action: "UPDATE",
          document: { type: "ITEM", id, code: current.code },
          summary: joinParts(
            aliasPhrase,
            rest.length > 0 && changeSummary(rest),
          ),
          changes,
        });
      }
      return true;
    });
    if (!found) return notFound();
    const updated = await getItem(db, id);
    return updated ? ok(updated) : notFound();
  });
}

export function deleteItem(
  db: Database,
  actor: Actor,
  id: string,
): Promise<ServiceResult<null>> {
  return runService(async () => {
    try {
      const found = await db.transaction(async (tx) => {
        const [deleted] = await tx
          .delete(item)
          .where(eq(item.id, id))
          .returning({ code: item.code, name: item.name });
        if (!deleted) return false;
        await logActivity(tx, actor, {
          action: "DELETE",
          document: { type: "ITEM", id, code: deleted.code },
          summary: deleted.name,
        });
        return true;
      });
      return found ? ok(null) : notFound();
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

/**
 * The main code of the item a typed code means (design D1): the exact main
 * code first, then a main code with the same key (other accents, spaces,
 * case), then an old code. null when nothing matches.
 */
export async function resolveItemCode(
  db: Pick<Database, "select">,
  typed: string,
): Promise<string | null> {
  const code = normalizeItemCode(typed);
  if (!isValidItemCode(code)) return null;
  const [exact] = await db
    .select({ code: item.code })
    .from(item)
    .where(eq(item.code, code));
  if (exact) return exact.code;
  const key = itemCodeKey(code);
  const [similar] = await db
    .select({ code: item.code })
    .from(item)
    .where(eq(item.codeKey, key));
  if (similar) return similar.code;
  const [old] = await db
    .select({ code: item.code })
    .from(itemAlias)
    .innerJoin(item, eq(item.id, itemAlias.itemId))
    .where(eq(itemAlias.codeKey, key));
  return old?.code ?? null;
}
