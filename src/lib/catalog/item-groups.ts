import { asc, count, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { item, itemGroup } from "@/db/schema";
import { diffFields } from "@/domain/activity-changes";
import { changeSummary, joinParts } from "@/domain/activity-summary";
import { toSearchText } from "@/domain/search-text";
import { CATEGORY_LABELS, GROUP_FIELDS } from "@/lib/activity/fields";
import { logActivity } from "@/lib/activity/log";

import { ITEM_CATEGORIES, type ItemCategory } from "./items";
import {
  archivedAt,
  badRequest,
  conflict,
  isForeignKeyViolation,
  isUniqueViolation,
  notFound,
  ok,
  requireName,
  runService,
  ServiceFailure,
  type Actor,
  type CatalogStatus,
  type ServiceResult,
} from "./common";

export const GROUP_MESSAGES = {
  nameTaken: "Tên nhóm đã có",
  inUse: "Nhóm hàng đã được dùng nên chỉ ngừng dùng được",
  category: "Chọn phân loại Thiết bị hoặc Vật tư",
} as const;

const NAME_MAX = 60;

export interface GroupRow {
  id: string;
  name: string;
  /** Thiết bị or Vật tư (catalog-extensions D3). */
  category: ItemCategory;
  sortOrder: number;
  status: CatalogStatus;
  /** Active items in the group. */
  itemCount: number;
}

export async function listGroups(db: Database): Promise<GroupRow[]> {
  const counts = await db
    .select({ groupId: item.groupId, value: count() })
    .from(item)
    .where(eq(item.status, "ACTIVE"))
    .groupBy(item.groupId);
  const byGroup = new Map(counts.map((row) => [row.groupId, row.value]));
  const rows = await db
    .select()
    .from(itemGroup)
    .orderBy(asc(itemGroup.sortOrder), asc(itemGroup.name));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category as ItemCategory,
    sortOrder: row.sortOrder,
    status: row.status as CatalogStatus,
    itemCount: byGroup.get(row.id) ?? 0,
  }));
}

export interface GroupInput {
  name?: string;
  category?: string;
  sortOrder?: number;
  status?: CatalogStatus;
}

function parseCategory(value: string | undefined): ItemCategory | undefined {
  if (value === undefined) return undefined;
  if (!(ITEM_CATEGORIES as readonly string[]).includes(value)) {
    throw new ServiceFailure(badRequest(GROUP_MESSAGES.category));
  }
  return value as ItemCategory;
}

export function createGroup(
  db: Database,
  actor: Actor,
  input: GroupInput,
): Promise<ServiceResult<{ id: string }>> {
  return runService(async () => {
    const name = requireName(input.name, NAME_MAX);
    const category = parseCategory(input.category) ?? "EQUIPMENT";
    try {
      const id = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(itemGroup)
          .values({
            name,
            nameKey: toSearchText(name),
            category,
            sortOrder: input.sortOrder ?? 0,
            createdBy: actor.id,
            updatedBy: actor.id,
          })
          .returning({ id: itemGroup.id });
        const id = row?.id ?? "";
        // A group has no code: the log shows its name instead.
        await logActivity(tx, actor, {
          action: "CREATE",
          document: { type: "ITEM_GROUP", id, code: name },
          summary: joinParts(`Nhóm hàng ${name}`, CATEGORY_LABELS[category]),
        });
        return id;
      });
      return ok({ id });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) return conflict(GROUP_MESSAGES.nameTaken);
      throw error;
    }
  });
}

export function updateGroup(
  db: Database,
  actor: Actor,
  id: string,
  input: GroupInput,
): Promise<ServiceResult<{ id: string }>> {
  return runService(async () => {
    const name =
      input.name === undefined ? undefined : requireName(input.name, NAME_MAX);
    const category = parseCategory(input.category);
    try {
      const found = await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(itemGroup)
          .where(eq(itemGroup.id, id))
          .for("update");
        if (!current) return false;
        const next = {
          name: name ?? current.name,
          category: category ?? current.category,
          sortOrder: input.sortOrder ?? current.sortOrder,
          status: input.status ?? current.status,
        };
        await tx
          .update(itemGroup)
          .set({
            ...(name === undefined
              ? {}
              : { name, nameKey: toSearchText(name) }),
            ...(category === undefined ? {} : { category }),
            ...(input.sortOrder === undefined
              ? {}
              : { sortOrder: input.sortOrder }),
            ...(input.status === undefined
              ? {}
              : { status: input.status, archivedAt: archivedAt(input.status) }),
            updatedBy: actor.id,
            updatedAt: new Date(),
          })
          .where(eq(itemGroup.id, id));
        const changes = diffFields(GROUP_FIELDS, current, next);
        await logActivity(tx, actor, {
          action: "UPDATE",
          document: { type: "ITEM_GROUP", id, code: next.name },
          summary: changeSummary(changes),
          changes,
        });
        return true;
      });
      return found ? ok({ id }) : notFound();
    } catch (error: unknown) {
      if (isUniqueViolation(error)) return conflict(GROUP_MESSAGES.nameTaken);
      throw error;
    }
  });
}

export function deleteGroup(
  db: Database,
  actor: Actor,
  id: string,
): Promise<ServiceResult<null>> {
  return runService(async () => {
    try {
      const found = await db.transaction(async (tx) => {
        const [deleted] = await tx
          .delete(itemGroup)
          .where(eq(itemGroup.id, id))
          .returning({ name: itemGroup.name });
        if (!deleted) return false;
        await logActivity(tx, actor, {
          action: "DELETE",
          document: { type: "ITEM_GROUP", id, code: deleted.name },
          summary: `Nhóm hàng ${deleted.name}`,
        });
        return true;
      });
      return found ? ok(null) : notFound();
    } catch (error: unknown) {
      if (isForeignKeyViolation(error)) return conflict(GROUP_MESSAGES.inUse);
      throw error;
    }
  });
}
