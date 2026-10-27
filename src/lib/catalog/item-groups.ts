import { asc, count, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { item, itemGroup } from "@/db/schema";
import { toSearchText } from "@/domain/search-text";

import {
  archivedAt,
  conflict,
  isForeignKeyViolation,
  isUniqueViolation,
  notFound,
  ok,
  requireName,
  runService,
  type Actor,
  type CatalogStatus,
  type ServiceResult,
} from "./common";

export const GROUP_MESSAGES = {
  nameTaken: "Tên nhóm đã có",
  inUse: "Nhóm hàng đã được dùng nên chỉ ngừng dùng được",
} as const;

const NAME_MAX = 60;

export interface GroupRow {
  id: string;
  name: string;
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
    sortOrder: row.sortOrder,
    status: row.status as CatalogStatus,
    itemCount: byGroup.get(row.id) ?? 0,
  }));
}

export interface GroupInput {
  name?: string;
  sortOrder?: number;
  status?: CatalogStatus;
}

export function createGroup(
  db: Database,
  actor: Actor,
  input: GroupInput,
): Promise<ServiceResult<{ id: string }>> {
  return runService(async () => {
    const name = requireName(input.name, NAME_MAX);
    try {
      const [row] = await db
        .insert(itemGroup)
        .values({
          name,
          nameKey: toSearchText(name),
          sortOrder: input.sortOrder ?? 0,
          createdBy: actor.id,
          updatedBy: actor.id,
        })
        .returning({ id: itemGroup.id });
      return ok({ id: row?.id ?? "" });
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
    try {
      const updated = await db
        .update(itemGroup)
        .set({
          ...(name === undefined ? {} : { name, nameKey: toSearchText(name) }),
          ...(input.sortOrder === undefined
            ? {}
            : { sortOrder: input.sortOrder }),
          ...(input.status === undefined
            ? {}
            : { status: input.status, archivedAt: archivedAt(input.status) }),
          updatedBy: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(itemGroup.id, id))
        .returning({ id: itemGroup.id });
      return updated.length > 0 ? ok({ id }) : notFound();
    } catch (error: unknown) {
      if (isUniqueViolation(error)) return conflict(GROUP_MESSAGES.nameTaken);
      throw error;
    }
  });
}

export function deleteGroup(
  db: Database,
  id: string,
): Promise<ServiceResult<null>> {
  return runService(async () => {
    try {
      const deleted = await db
        .delete(itemGroup)
        .where(eq(itemGroup.id, id))
        .returning({ id: itemGroup.id });
      return deleted.length > 0 ? ok(null) : notFound();
    } catch (error: unknown) {
      if (isForeignKeyViolation(error)) return conflict(GROUP_MESSAGES.inUse);
      throw error;
    }
  });
}
