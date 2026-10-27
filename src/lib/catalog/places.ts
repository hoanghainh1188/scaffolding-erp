// Sites (công trình) and locations (bãi, xưởng, công trình) for D16
// (spec sites-and-locations, design D6, D7).
import { and, asc, count, eq, ilike, sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import { customer, location, site, siteCodeSeq } from "@/db/schema";
import {
  CODE_PREFIXES,
  formatSequenceCode,
} from "@/domain/catalog-code-sequence";
import { DomainValueError } from "@/domain/errors";
import { parseCatalogCode } from "@/domain/item-code";
import type { LocationType } from "@/domain/location-type";
import { toSearchText } from "@/domain/search-text";
import type { Executor } from "@/lib/auth/credentials";

import {
  archivedAt,
  badRequest,
  COMMON_MESSAGES,
  conflict,
  isForeignKeyViolation,
  isUniqueViolation,
  notFound,
  ok,
  optionalText,
  requireName,
  runService,
  ServiceFailure,
  type Actor,
  type CatalogStatus,
  type ServiceResult,
} from "./common";
import { describeStock, isEmpty, locationStock } from "@/lib/inventory/totals";

import { escapeLike } from "./items";

export const PLACE_MESSAGES = {
  customerMissing: "Chọn nhà thầu của công trình",
  customerArchived: "Nhà thầu này đã ngừng dùng",
  customerFixed: "Không đổi được nhà thầu của công trình",
  restoreCustomerFirst: "Dùng lại nhà thầu của công trình này trước",
  siteInUse: "Công trình đã được dùng nên chỉ ngừng dùng được",
  siteByHand: "Vị trí công trình được tạo khi thêm công trình",
  editSiteInstead: "Sửa công trình để đổi vị trí này",
  type: "Chọn loại bãi hoặc xưởng",
  lastYard: "Phải còn ít nhất một bãi đang dùng",
  locationInUse: "Vị trí đã được dùng nên chỉ ngừng dùng được",
  siteHasStock: (code: string, stock: string) =>
    `Công trình ${code} còn ${stock} hàng, thu hồi hết trước khi ngừng dùng`,
  locationHasStock: (code: string, stock: string) =>
    `${code} còn ${stock} hàng, chuyển hết đi trước khi ngừng dùng`,
} as const;

// -------------------------------------------------------------------- sites

export interface SiteRow {
  id: string;
  code: string;
  name: string;
  address: string | null;
  customerId: string;
  customerCode: string;
  customerName: string;
  locationId: string;
  status: CatalogStatus;
}

export interface SiteFilter {
  q?: string;
  status?: CatalogStatus;
  customerId?: string;
}

const siteColumns = {
  id: site.id,
  code: site.code,
  name: site.name,
  address: site.address,
  customerId: site.customerId,
  customerCode: customer.code,
  customerName: customer.name,
  locationId: site.locationId,
  status: site.status,
};

type SiteRecord = Omit<SiteRow, "status"> & { status: string };

const toSiteRow = (row: SiteRecord): SiteRow => ({
  ...row,
  status: row.status as CatalogStatus,
});

export async function listSites(
  db: Database,
  filter: SiteFilter = {},
): Promise<SiteRow[]> {
  const conditions: SQL[] = [eq(site.status, filter.status ?? "ACTIVE")];
  if (filter.customerId)
    conditions.push(eq(site.customerId, filter.customerId));
  const q = toSearchText(filter.q);
  if (q) conditions.push(ilike(site.searchText, `%${escapeLike(q)}%`));
  const rows = await db
    .select(siteColumns)
    .from(site)
    .innerJoin(customer, eq(customer.id, site.customerId))
    .where(and(...conditions))
    .orderBy(asc(site.name));
  return rows.map(toSiteRow);
}

async function getSite(db: Database, id: string): Promise<SiteRow | null> {
  const [row] = await db
    .select(siteColumns)
    .from(site)
    .innerJoin(customer, eq(customer.id, site.customerId))
    .where(eq(site.id, id));
  return row ? toSiteRow(row) : null;
}

export interface SiteInput {
  name?: string;
  address?: string | null;
  customerId?: string;
  status?: CatalogStatus;
}

async function requireActiveCustomer(
  tx: Executor,
  customerId: string,
  message: string,
): Promise<void> {
  // FOR SHARE: an archive of this customer waits for us, or we wait for it
  // and see ARCHIVED (review of PR #28, point 4).
  const [row] = await tx
    .select({ status: customer.status })
    .from(customer)
    .where(eq(customer.id, customerId))
    .for("share");
  if (!row) throw new DomainValueError(PLACE_MESSAGES.customerMissing);
  if (row.status !== "ACTIVE") {
    throw new ServiceFailure(conflict(message));
  }
}

function siteSearchText(name: string, code: string, address: string | null) {
  return toSearchText(name, code, address);
}

/** A site and its SITE location, in one transaction (design D6). */
export function createSite(
  db: Database,
  actor: Actor,
  input: SiteInput,
): Promise<ServiceResult<SiteRow>> {
  return runService(async () => {
    const name = requireName(input.name);
    const address = optionalText(input.address);
    if (!input.customerId) {
      return badRequest(PLACE_MESSAGES.customerMissing);
    }
    const customerId = input.customerId;
    const id = await db.transaction(async (tx) => {
      await requireActiveCustomer(
        tx,
        customerId,
        PLACE_MESSAGES.customerArchived,
      );
      const result = await tx.execute<{ value: string }>(
        sql`select nextval(${sql.raw(`'${siteCodeSeq.seqName}'`)}) as value`,
      );
      const code = formatSequenceCode(
        CODE_PREFIXES.site,
        Number(result[0]?.value),
      );
      const [place] = await tx
        .insert(location)
        .values({
          code,
          name,
          type: "SITE",
          createdBy: actor.id,
          updatedBy: actor.id,
        })
        .returning({ id: location.id });
      const [row] = await tx
        .insert(site)
        .values({
          code,
          name,
          address,
          customerId,
          locationId: place?.id ?? "",
          searchText: siteSearchText(name, code, address),
          createdBy: actor.id,
          updatedBy: actor.id,
        })
        .returning({ id: site.id });
      return row?.id ?? "";
    });
    const created = await getSite(db, id);
    return created ? ok(created) : notFound();
  });
}

export function updateSite(
  db: Database,
  actor: Actor,
  id: string,
  input: SiteInput,
): Promise<ServiceResult<SiteRow>> {
  return runService(async () => {
    const found = await db.transaction(async (tx) => {
      // Read under the row lock so two editors never overwrite each other.
      const [current] = await tx
        .select()
        .from(site)
        .where(eq(site.id, id))
        .for("update");
      if (!current) return false;
      if (
        input.customerId !== undefined &&
        input.customerId !== current.customerId
      ) {
        throw new ServiceFailure(badRequest(PLACE_MESSAGES.customerFixed));
      }
      const name =
        input.name === undefined ? current.name : requireName(input.name);
      const address =
        input.address === undefined
          ? current.address
          : optionalText(input.address);
      if (input.status === "ACTIVE" && current.status === "ARCHIVED") {
        await requireActiveCustomer(
          tx,
          current.customerId,
          PLACE_MESSAGES.restoreCustomerFirst,
        );
      }
      if (input.status === "ARCHIVED" && current.status === "ACTIVE") {
        await requireEmptyLocation(tx, current.locationId, (stock) =>
          PLACE_MESSAGES.siteHasStock(current.code, stock),
        );
      }
      const status =
        input.status === undefined
          ? {}
          : { status: input.status, archivedAt: archivedAt(input.status) };
      const stamp = { updatedBy: actor.id, updatedAt: new Date() };
      await tx
        .update(site)
        .set({
          name,
          address,
          searchText: siteSearchText(name, current.code, address),
          ...status,
          ...stamp,
        })
        .where(eq(site.id, id));
      // The SITE location follows its site's name and status.
      await tx
        .update(location)
        .set({ name, ...status, ...stamp })
        .where(eq(location.id, current.locationId));
      return true;
    });
    if (!found) return notFound();
    const updated = await getSite(db, id);
    return updated ? ok(updated) : notFound();
  });
}

export function deleteSite(
  db: Database,
  id: string,
): Promise<ServiceResult<null>> {
  return runService(async () => {
    const current = await getSite(db, id);
    if (!current) return notFound();
    try {
      await db.transaction(async (tx) => {
        await tx.delete(site).where(eq(site.id, id));
        await tx.delete(location).where(eq(location.id, current.locationId));
      });
      return ok(null);
    } catch (error: unknown) {
      if (isForeignKeyViolation(error)) {
        return conflict(PLACE_MESSAGES.siteInUse);
      }
      throw error;
    }
  });
}

// ---------------------------------------------------------------- locations

export interface LocationRow {
  id: string;
  code: string;
  name: string;
  type: LocationType;
  status: CatalogStatus;
}

export async function listLocations(
  db: Database,
  filter: { type?: LocationType; status?: CatalogStatus } = {},
): Promise<LocationRow[]> {
  const conditions: SQL[] = [eq(location.status, filter.status ?? "ACTIVE")];
  if (filter.type) conditions.push(eq(location.type, filter.type));
  const rows = await db
    .select({
      id: location.id,
      code: location.code,
      name: location.name,
      type: location.type,
      status: location.status,
    })
    .from(location)
    .where(and(...conditions))
    .orderBy(asc(location.type), asc(location.code));
  return rows.map((row) => ({
    ...row,
    type: row.type as LocationType,
    status: row.status as CatalogStatus,
  }));
}

export interface LocationInput {
  code?: string;
  name?: string;
  type?: string;
  status?: CatalogStatus;
}

function yardOrWorkshop(type: string | undefined): "YARD" | "WORKSHOP" {
  if (type === "SITE") throw new DomainValueError(PLACE_MESSAGES.siteByHand);
  if (type === "YARD" || type === "WORKSHOP") return type;
  throw new DomainValueError(PLACE_MESSAGES.type);
}

export function createLocation(
  db: Database,
  actor: Actor,
  input: LocationInput,
): Promise<ServiceResult<LocationRow>> {
  return runService(async () => {
    const type = yardOrWorkshop(input.type);
    const code = parseCatalogCode(input.code ?? "");
    const name = requireName(input.name);
    try {
      const [row] = await db
        .insert(location)
        .values({ code, name, type, createdBy: actor.id, updatedBy: actor.id })
        .returning();
      return row
        ? ok({ id: row.id, code, name, type, status: "ACTIVE" as const })
        : notFound();
    } catch (error: unknown) {
      if (isUniqueViolation(error)) return conflict(COMMON_MESSAGES.codeTaken);
      throw error;
    }
  });
}

/**
 * Locks every active yard; refuses when `id` is the last one. Locking the
 * rows makes two directors archiving the two last yards take turns.
 */
async function keepOneYard(tx: Executor, id: string): Promise<void> {
  const yards = await tx
    .select({ id: location.id })
    .from(location)
    .where(and(eq(location.type, "YARD"), eq(location.status, "ACTIVE")))
    .orderBy(asc(location.id))
    .for("update");
  if (yards.length === 1 && yards[0]?.id === id) {
    throw new ServiceFailure(conflict(PLACE_MESSAGES.lastYard));
  }
}

/**
 * Refuses to archive a location that still holds stock. Locks the location
 * FOR UPDATE first: postings hold it FOR SHARE, so they finish before the
 * total is read, and later ones see it archived.
 */
async function requireEmptyLocation(
  tx: Executor,
  locationId: string,
  message: (stock: string) => string,
): Promise<void> {
  await tx
    .select({ id: location.id })
    .from(location)
    .where(eq(location.id, locationId))
    .for("update");
  const stock = await locationStock(tx, locationId);
  if (!isEmpty(stock)) {
    throw new ServiceFailure(conflict(message(describeStock(stock))));
  }
}

async function getLocation(db: Database, id: string) {
  const [row] = await db.select().from(location).where(eq(location.id, id));
  return row ?? null;
}

export function updateLocation(
  db: Database,
  actor: Actor,
  id: string,
  input: LocationInput,
): Promise<ServiceResult<LocationRow>> {
  return runService(async () => {
    const current = await getLocation(db, id);
    if (!current) return notFound();
    if (current.type === "SITE")
      return badRequest(PLACE_MESSAGES.editSiteInstead);
    if (
      input.code !== undefined &&
      input.code.trim().toUpperCase() !== current.code
    ) {
      return badRequest("Không đổi được mã sau khi tạo");
    }
    const name =
      input.name === undefined ? current.name : requireName(input.name);
    const status = (input.status ?? current.status) as CatalogStatus;
    await db.transaction(async (tx) => {
      if (input.status === "ARCHIVED" && current.status === "ACTIVE") {
        await keepOneYard(tx, id);
        await requireEmptyLocation(tx, id, (stock) =>
          PLACE_MESSAGES.locationHasStock(current.code, stock),
        );
      }
      await tx
        .update(location)
        .set({
          name,
          ...(input.status === undefined
            ? {}
            : { status: input.status, archivedAt: archivedAt(input.status) }),
          updatedBy: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(location.id, id));
    });
    return ok({
      id,
      code: current.code,
      name,
      type: current.type as LocationType,
      status,
    });
  });
}

export function deleteLocation(
  db: Database,
  id: string,
): Promise<ServiceResult<null>> {
  return runService(async () => {
    const current = await getLocation(db, id);
    if (!current) return notFound();
    if (current.type === "SITE")
      return badRequest(PLACE_MESSAGES.editSiteInstead);
    try {
      await db.transaction(async (tx) => {
        if (current.status === "ACTIVE") await keepOneYard(tx, id);
        await tx.delete(location).where(eq(location.id, id));
      });
      return ok(null);
    } catch (error: unknown) {
      if (isForeignKeyViolation(error)) {
        return conflict(PLACE_MESSAGES.locationInUse);
      }
      throw error;
    }
  });
}

/** Active rows per tab, for the D16 tab labels. */
export async function countPlaces(db: Database) {
  const [sites] = await db
    .select({ value: count() })
    .from(site)
    .where(eq(site.status, "ACTIVE"));
  const [places] = await db
    .select({ value: count() })
    .from(location)
    .where(and(eq(location.status, "ACTIVE"), sql`${location.type} <> 'SITE'`));
  return { sites: sites?.value ?? 0, locations: places?.value ?? 0 };
}
