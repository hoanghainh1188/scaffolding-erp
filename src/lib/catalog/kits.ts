// Kits (bộ) for D9 (spec item-catalog, design D2). Weight and rent are
// computed from the parts on every read, never stored.
import { and, asc, eq, ilike, inArray, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import { diffFields, diffLines } from "@/domain/activity-changes";
import { changeSummary, countText, joinParts } from "@/domain/activity-summary";
import { KIT_FIELDS, KIT_PARTS, type KitPartView } from "@/lib/activity/fields";
import { logActivity } from "@/lib/activity/log";
import { item, kit, kitComponent } from "@/db/schema";
import { DomainValueError } from "@/domain/errors";
import { parseCatalogCode } from "@/domain/item-code";
import { kitTotals, validateKitComponents } from "@/domain/kit";
import { toMoney } from "@/domain/money";
import { quantityFromDb, type QuantityUnit } from "@/domain/quantity";
import { toSearchText } from "@/domain/search-text";

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
import { escapeLike, itemsByIds } from "./items";

export const KIT_SERVICE_MESSAGES = {
  codeFixed: "Không đổi được mã bộ sau khi tạo",
  inUse: "Bộ đã được dùng nên chỉ ngừng dùng được",
} as const;

export interface KitComponentRow {
  itemId: string;
  code: string;
  name: string;
  quantity: number;
}

export interface KitRow {
  id: string;
  code: string;
  name: string;
  status: CatalogStatus;
  components: KitComponentRow[];
  /** Thousandths of a kg for one kit. */
  weightMilli: number;
  /** null when a part is not for rent. */
  rentalPerDay: number | null;
}

export interface KitFilter {
  q?: string;
  status?: CatalogStatus;
  /** Only kits that contain this item ("Thuộc bộ" on D9). */
  containsItemId?: string;
}

export async function listKits(
  db: Database,
  filter: KitFilter = {},
): Promise<KitRow[]> {
  const conditions: SQL[] = [];
  if (filter.status) conditions.push(eq(kit.status, filter.status));
  const q = toSearchText(filter.q);
  if (q) conditions.push(ilike(kit.searchText, `%${escapeLike(q)}%`));
  if (filter.containsItemId) {
    const holders = await db
      .select({ kitId: kitComponent.kitId })
      .from(kitComponent)
      .where(eq(kitComponent.itemId, filter.containsItemId));
    if (holders.length === 0) return [];
    conditions.push(
      inArray(
        kit.id,
        holders.map((row) => row.kitId),
      ),
    );
  }
  const kits = await db
    .select()
    .from(kit)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(kit.name));
  if (kits.length === 0) return [];

  const parts = await db
    .select({
      kitId: kitComponent.kitId,
      itemId: item.id,
      code: item.code,
      name: item.name,
      quantity: kitComponent.quantity,
      standardWeightKg: item.standardWeightKg,
      dailyRentalPrice: item.dailyRentalPrice,
    })
    .from(kitComponent)
    .innerJoin(item, eq(item.id, kitComponent.itemId))
    .where(
      inArray(
        kitComponent.kitId,
        kits.map((row) => row.id),
      ),
    )
    .orderBy(asc(item.name));

  return kits.map((row) => {
    const own = parts.filter((part) => part.kitId === row.id);
    const totals = kitTotals(
      own.map((part) => ({
        quantity: part.quantity,
        standardWeightKg: quantityFromDb(part.standardWeightKg ?? "0", "KG"),
        dailyRentalPrice:
          part.dailyRentalPrice === null
            ? null
            : toMoney(part.dailyRentalPrice),
      })),
    );
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.status as CatalogStatus,
      components: own.map((part) => ({
        itemId: part.itemId,
        code: part.code,
        name: part.name,
        quantity: part.quantity,
      })),
      weightMilli: totals.weight.milli,
      rentalPerDay: totals.rentalPerDay,
    };
  });
}

async function getKit(db: Database, id: string): Promise<KitRow | null> {
  const rows = await listKits(db, {});
  return rows.find((row) => row.id === id) ?? null;
}

export interface KitComponentInput {
  itemId: string;
  quantity: number;
}

export interface KitInput {
  code?: string;
  name?: string;
  components?: KitComponentInput[];
  status?: CatalogStatus;
}

/**
 * Checks the lines against current items (design D2), holding the item rows
 * FOR SHARE until the transaction ends: an archive of one of them waits and
 * then sees this kit (review of PR #28, point 4).
 */
async function checkComponents(
  tx: Pick<Database, "select">,
  components: readonly KitComponentInput[],
): Promise<void> {
  const found = await itemsByIds(
    tx,
    components.map((line) => line.itemId),
    "share",
  );
  const byId = new Map(found.map((row) => [row.id, row]));
  const error = validateKitComponents(
    components.map((line) => {
      const part = byId.get(line.itemId);
      if (!part) throw new DomainValueError("Không tìm thấy vật tư trong bộ");
      return {
        itemId: line.itemId,
        code: part.code,
        unit: part.unit as QuantityUnit,
        status: part.status as CatalogStatus,
        quantity: line.quantity,
      };
    }),
  );
  if (error) throw new DomainValueError(error);
}

/** Kit lines by item code, in code order, for the activity log. */
async function partViews(
  tx: Pick<Database, "select">,
  parts: readonly KitComponentInput[],
): Promise<KitPartView[]> {
  if (parts.length === 0) return [];
  const rows = await tx
    .select({ id: item.id, code: item.code })
    .from(item)
    .where(
      inArray(
        item.id,
        parts.map((part) => part.itemId),
      ),
    );
  const codeOf = new Map(rows.map((row) => [row.id, row.code]));
  return parts
    .map((part) => ({
      code: codeOf.get(part.itemId) ?? part.itemId,
      quantity: part.quantity,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function createKit(
  db: Database,
  actor: Actor,
  input: KitInput,
): Promise<ServiceResult<KitRow>> {
  return runService(async () => {
    const code = parseCatalogCode(input.code ?? "");
    const name = requireName(input.name);
    const components = input.components ?? [];

    const id = await db.transaction(async (tx) => {
      await checkComponents(tx, components);
      await claimItemOrKitCode(tx, code);
      const [row] = await tx
        .insert(kit)
        .values({
          code,
          name,
          searchText: toSearchText(name, code),
          createdBy: actor.id,
          updatedBy: actor.id,
        })
        .returning({ id: kit.id });
      const kitId = row?.id ?? "";
      await tx
        .insert(kitComponent)
        .values(components.map((line) => ({ kitId, ...line })));
      await logActivity(tx, actor, {
        action: "CREATE",
        document: { type: "KIT", id: kitId, code },
        summary: joinParts(name, countText(components.length, "linh kiện")),
      });
      return kitId;
    });
    const created = await getKit(db, id);
    return created ? ok(created) : notFound();
  });
}

export function updateKit(
  db: Database,
  actor: Actor,
  id: string,
  input: KitInput,
): Promise<ServiceResult<KitRow>> {
  return runService(async () => {
    const found = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(kit)
        .where(eq(kit.id, id))
        .for("update");
      if (!current) return false;
      if (
        input.code !== undefined &&
        input.code.trim().toUpperCase() !== current.code
      ) {
        throw new ServiceFailure(badRequest(KIT_SERVICE_MESSAGES.codeFixed));
      }
      const name =
        input.name === undefined ? current.name : requireName(input.name);
      const stored = await tx
        .select({
          itemId: kitComponent.itemId,
          quantity: kitComponent.quantity,
        })
        .from(kitComponent)
        .where(eq(kitComponent.kitId, id));
      const components = input.components ?? stored;
      // Coming back into use re-checks the parts: one may have been archived.
      if (input.components !== undefined || input.status === "ACTIVE") {
        await checkComponents(tx, components);
      }
      await tx
        .update(kit)
        .set({
          name,
          searchText: toSearchText(name, current.code),
          ...(input.status === undefined
            ? {}
            : { status: input.status, archivedAt: archivedAt(input.status) }),
          updatedBy: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(kit.id, id));
      if (input.components !== undefined) {
        await tx.delete(kitComponent).where(eq(kitComponent.kitId, id));
        await tx
          .insert(kitComponent)
          .values(components.map((line) => ({ kitId: id, ...line })));
      }
      const changes = [
        ...diffFields(KIT_FIELDS, current, {
          name,
          status: input.status ?? current.status,
        }),
        ...diffLines(
          KIT_PARTS,
          await partViews(tx, stored),
          await partViews(tx, components),
        ),
      ];
      await logActivity(tx, actor, {
        action: "UPDATE",
        document: { type: "KIT", id, code: current.code },
        summary: changeSummary(changes),
        changes,
      });
      return true;
    });
    if (!found) return notFound();
    const updated = await getKit(db, id);
    return updated ? ok(updated) : notFound();
  });
}

export function deleteKit(
  db: Database,
  actor: Actor,
  id: string,
): Promise<ServiceResult<null>> {
  return runService(async () => {
    try {
      const found = await db.transaction(async (tx) => {
        const [deleted] = await tx
          .delete(kit)
          .where(eq(kit.id, id))
          .returning({ code: kit.code, name: kit.name });
        if (!deleted) return false;
        await logActivity(tx, actor, {
          action: "DELETE",
          document: { type: "KIT", id, code: deleted.code },
          summary: deleted.name,
        });
        return true;
      });
      return found ? ok(null) : notFound();
    } catch (error: unknown) {
      if (isForeignKeyViolation(error)) {
        return conflict(KIT_SERVICE_MESSAGES.inUse);
      }
      throw error;
    }
  });
}
