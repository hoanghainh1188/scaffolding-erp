// Customers (nhà thầu) and suppliers (nhà cung cấp) for D16
// (spec partner-directory, design D1, D5, D7).
import { and, asc, count, eq, ilike, sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  customer,
  customerCodeSeq,
  site,
  supplier,
  supplierCodeSeq,
} from "@/db/schema";
import {
  CODE_PREFIXES,
  formatSequenceCode,
} from "@/domain/catalog-code-sequence";
import { DomainValueError } from "@/domain/errors";
import {
  PARTNER_FIELD_MESSAGES,
  isValidIdNumber,
  isValidTaxCode,
  maskBankAccount,
  maskIdNumber,
  normalizePhone,
} from "@/domain/partner-fields";
import { diffFields, touchesSensitive } from "@/domain/activity-changes";
import { changeSummary, joinParts } from "@/domain/activity-summary";
import { toSearchText } from "@/domain/search-text";
import { CUSTOMER_FIELDS, SUPPLIER_FIELDS } from "@/lib/activity/fields";
import { logActivity } from "@/lib/activity/log";
import type { Executor } from "@/lib/auth/credentials";

import {
  archivedAt,
  conflict,
  isForeignKeyViolation,
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
import { escapeLike } from "./items";
import {
  describeOrderCodes,
  openOrderCodesForSupplier,
} from "@/lib/purchasing/references";

export const PARTNER_MESSAGES = {
  kind: "Chọn công ty hoặc cá nhân",
  paymentTerms: "Hạn thanh toán từ 0 đến 365 ngày",
  customerInUse: "Nhà thầu đã được dùng nên chỉ ngừng dùng được",
  supplierInUse: "Nhà cung cấp đã được dùng nên chỉ ngừng dùng được",
  customerHasSites: "Ngừng dùng các công trình của nhà thầu này trước",
  supplierHasOrders: (code: string, orders: string) =>
    `${code} còn đơn thu mua đang xử lý: ${orders}. Đóng hoặc hủy đơn trước`,
} as const;

export type PartnerKind = "COMPANY" | "PERSON";

export interface PartnerFilter {
  q?: string;
  status?: CatalogStatus;
}

function partnerKind(value: string | undefined): PartnerKind {
  if (value === "COMPANY" || value === "PERSON") return value;
  throw new DomainValueError(PARTNER_MESSAGES.kind);
}

function phone(value: string | null | undefined): string | null {
  const text = optionalText(value);
  return text === null ? null : normalizePhone(text);
}

function taxCode(value: string | null | undefined): string | null {
  const text = optionalText(value);
  if (text !== null && !isValidTaxCode(text)) {
    throw new DomainValueError(PARTNER_FIELD_MESSAGES.taxCode);
  }
  return text;
}

function idNumber(value: string | null | undefined): string | null {
  const text = optionalText(value)?.replace(/\s/g, "") ?? null;
  if (text !== null && !isValidIdNumber(text)) {
    throw new DomainValueError(PARTNER_FIELD_MESSAGES.idNumber);
  }
  return text;
}

function paymentTerms(value: number | undefined): number {
  const days = value ?? 30;
  if (!Number.isInteger(days) || days < 0 || days > 365) {
    throw new DomainValueError(PARTNER_MESSAGES.paymentTerms);
  }
  return days;
}

async function nextCode(
  tx: Executor,
  sequence: typeof customerCodeSeq,
  prefix: string,
): Promise<string> {
  const result = await tx.execute<{ value: string }>(
    sql`select nextval(${sql.raw(`'${sequence.seqName}'`)}) as value`,
  );
  return formatSequenceCode(prefix, Number(result[0]?.value));
}

function statusSet(status: CatalogStatus | undefined) {
  return status === undefined ? {} : { status, archivedAt: archivedAt(status) };
}

function searchConditions(
  filter: PartnerFilter,
  statusColumn: typeof customer.status | typeof supplier.status,
  searchColumn: typeof customer.searchText | typeof supplier.searchText,
): SQL[] {
  const conditions: SQL[] = [eq(statusColumn, filter.status ?? "ACTIVE")];
  // Digits typed with spaces or dots still find the stored phone.
  const q = toSearchText(filter.q);
  if (q) {
    const digits = q.replace(/[\s.]/g, "");
    const term = /^\+?\d+$/.test(digits) ? digits : q;
    conditions.push(ilike(searchColumn, `%${escapeLike(term)}%`));
  }
  return conditions;
}

// ---------------------------------------------------------------- customers

export interface CustomerRow {
  id: string;
  code: string;
  kind: PartnerKind;
  name: string;
  taxCode: string | null;
  contactName: string | null;
  phone: string | null;
  address: string | null;
  paymentTermsDays: number;
  note: string | null;
  status: CatalogStatus;
  /** Active sites of this customer. */
  siteCount: number;
}

export interface CustomerInput {
  kind?: string;
  name?: string;
  taxCode?: string | null;
  contactName?: string | null;
  phone?: string | null;
  address?: string | null;
  paymentTermsDays?: number;
  note?: string | null;
  status?: CatalogStatus;
}

export async function listCustomers(
  db: Database,
  filter: PartnerFilter = {},
): Promise<CustomerRow[]> {
  const sites = await db
    .select({ customerId: site.customerId, value: count() })
    .from(site)
    .where(eq(site.status, "ACTIVE"))
    .groupBy(site.customerId);
  const siteCount = new Map(sites.map((row) => [row.customerId, row.value]));
  const rows = await db
    .select()
    .from(customer)
    .where(
      and(...searchConditions(filter, customer.status, customer.searchText)),
    )
    .orderBy(asc(customer.name));
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    kind: row.kind as PartnerKind,
    name: row.name,
    taxCode: row.taxCode,
    contactName: row.contactName,
    phone: row.phone,
    address: row.address,
    paymentTermsDays: row.paymentTermsDays,
    note: row.note,
    status: row.status as CatalogStatus,
    siteCount: siteCount.get(row.id) ?? 0,
  }));
}

export async function getCustomer(
  db: Database,
  id: string,
): Promise<CustomerRow | null> {
  const [row] = await db
    .select({ status: customer.status })
    .from(customer)
    .where(eq(customer.id, id));
  if (!row) return null;
  const rows = await listCustomers(db, {
    status: row.status as CatalogStatus,
  });
  return rows.find((candidate) => candidate.id === id) ?? null;
}

type CustomerRecord = typeof customer.$inferSelect;

function customerValues(input: CustomerInput, current?: CustomerRecord) {
  const name =
    input.name === undefined && current
      ? current.name
      : requireName(input.name);
  const values = {
    kind:
      input.kind === undefined && current
        ? partnerKind(current.kind)
        : partnerKind(input.kind),
    name,
    taxCode:
      input.taxCode === undefined && current
        ? current.taxCode
        : taxCode(input.taxCode),
    contactName:
      input.contactName === undefined && current
        ? current.contactName
        : optionalText(input.contactName),
    phone:
      input.phone === undefined && current ? current.phone : phone(input.phone),
    address:
      input.address === undefined && current
        ? current.address
        : optionalText(input.address),
    paymentTermsDays:
      input.paymentTermsDays === undefined && current
        ? current.paymentTermsDays
        : paymentTerms(input.paymentTermsDays),
    note:
      input.note === undefined && current
        ? current.note
        : optionalText(input.note),
  };
  return values;
}

export function createCustomer(
  db: Database,
  actor: Actor,
  input: CustomerInput,
): Promise<ServiceResult<CustomerRow>> {
  return runService(async () => {
    const values = customerValues(input);
    const id = await db.transaction(async (tx) => {
      const code = await nextCode(tx, customerCodeSeq, CODE_PREFIXES.customer);
      const [row] = await tx
        .insert(customer)
        .values({
          ...values,
          code,
          searchText: toSearchText(
            values.name,
            code,
            values.phone,
            values.taxCode,
            values.contactName,
          ),
          createdBy: actor.id,
          updatedBy: actor.id,
        })
        .returning({ id: customer.id });
      const id = row?.id ?? "";
      await logActivity(tx, actor, {
        action: "CREATE",
        document: { type: "CUSTOMER", id, code },
        summary: joinParts(values.name, values.contactName),
      });
      return id;
    });
    const created = await getCustomer(db, id);
    return created ? ok(created) : notFound();
  });
}

export function updateCustomer(
  db: Database,
  actor: Actor,
  id: string,
  input: CustomerInput,
): Promise<ServiceResult<CustomerRow>> {
  return runService(async () => {
    const found = await db.transaction(async (tx) => {
      // Locked for the whole change: a second editor waits and then builds
      // on this one; a site creation (FOR SHARE) waits for an archive and
      // then sees it (review of PR #28, point 4).
      const [current] = await tx
        .select()
        .from(customer)
        .where(eq(customer.id, id))
        .for("update");
      if (!current) return false;
      const values = customerValues(input, current);
      if (input.status === "ARCHIVED" && current.status === "ACTIVE") {
        const [active] = await tx
          .select({ id: site.id })
          .from(site)
          .where(and(eq(site.customerId, id), eq(site.status, "ACTIVE")))
          .limit(1);
        if (active) {
          throw new ServiceFailure(conflict(PARTNER_MESSAGES.customerHasSites));
        }
      }
      await tx
        .update(customer)
        .set({
          ...values,
          searchText: toSearchText(
            values.name,
            current.code,
            values.phone,
            values.taxCode,
            values.contactName,
          ),
          ...statusSet(input.status),
          updatedBy: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(customer.id, id));
      const changes = diffFields(CUSTOMER_FIELDS, current, {
        ...values,
        status: input.status ?? current.status,
      });
      await logActivity(tx, actor, {
        action: "UPDATE",
        document: { type: "CUSTOMER", id, code: current.code },
        summary: changeSummary(changes),
        changes,
      });
      return true;
    });
    if (!found) return notFound();
    const updated = await getCustomer(db, id);
    return updated ? ok(updated) : notFound();
  });
}

export function deleteCustomer(
  db: Database,
  actor: Actor,
  id: string,
): Promise<ServiceResult<null>> {
  return runService(async () => {
    try {
      const found = await db.transaction(async (tx) => {
        const [deleted] = await tx
          .delete(customer)
          .where(eq(customer.id, id))
          .returning({ code: customer.code, name: customer.name });
        if (!deleted) return false;
        await logActivity(tx, actor, {
          action: "DELETE",
          document: { type: "CUSTOMER", id, code: deleted.code },
          summary: deleted.name,
        });
        return true;
      });
      return found ? ok(null) : notFound();
    } catch (error: unknown) {
      if (isForeignKeyViolation(error)) {
        return conflict(PARTNER_MESSAGES.customerInUse);
      }
      throw error;
    }
  });
}

// ---------------------------------------------------------------- suppliers

/** What everyone may read: CCCD and bank account only masked (design D5). */
export interface SupplierRow {
  id: string;
  code: string;
  kind: PartnerKind;
  name: string;
  phone: string | null;
  address: string | null;
  taxCode: string | null;
  /** "•••• •••• 2345", or null when there is no CCCD. */
  idNumberMasked: string | null;
  /** "•••• 5678", or null when there is none. */
  bankAccountMasked: string | null;
  bankName: string | null;
  note: string | null;
  status: CatalogStatus;
}

/** The edit form only, for partners.manage: full CCCD and bank account. */
export interface SupplierEditRow extends SupplierRow {
  idNumber: string | null;
  bankAccount: string | null;
}

export interface SupplierInput {
  kind?: string;
  name?: string;
  phone?: string | null;
  address?: string | null;
  taxCode?: string | null;
  idNumber?: string | null;
  bankAccount?: string | null;
  bankName?: string | null;
  note?: string | null;
  status?: CatalogStatus;
}

type SupplierRecord = typeof supplier.$inferSelect;

function toSupplierRow(row: SupplierRecord): SupplierRow {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind as PartnerKind,
    name: row.name,
    phone: row.phone,
    address: row.address,
    taxCode: row.taxCode,
    idNumberMasked: row.idNumber ? maskIdNumber(row.idNumber) : null,
    bankAccountMasked: row.bankAccount
      ? maskBankAccount(row.bankAccount)
      : null,
    bankName: row.bankName,
    note: row.note,
    status: row.status as CatalogStatus,
  };
}

export async function listSuppliers(
  db: Database,
  filter: PartnerFilter = {},
): Promise<SupplierRow[]> {
  const rows = await db
    .select()
    .from(supplier)
    .where(
      and(...searchConditions(filter, supplier.status, supplier.searchText)),
    )
    .orderBy(asc(supplier.name));
  return rows.map(toSupplierRow);
}

/** Full record for the edit form; callers must hold partners.manage. */
export async function getSupplierForEdit(
  db: Pick<Database, "select">,
  id: string,
  lock: "update" | null = null,
): Promise<SupplierEditRow | null> {
  const query = db.select().from(supplier).where(eq(supplier.id, id));
  const [row] = await (lock ? query.for(lock) : query);
  return row
    ? {
        ...toSupplierRow(row),
        idNumber: row.idNumber,
        bankAccount: row.bankAccount,
      }
    : null;
}

function supplierValues(input: SupplierInput, current?: SupplierEditRow) {
  const keep = <K extends keyof SupplierInput>(key: K) =>
    input[key] === undefined && current !== undefined;
  return {
    kind: keep("kind") && current ? current.kind : partnerKind(input.kind),
    name: keep("name") && current ? current.name : requireName(input.name),
    phone: keep("phone") && current ? current.phone : phone(input.phone),
    address:
      keep("address") && current
        ? current.address
        : optionalText(input.address),
    taxCode:
      keep("taxCode") && current ? current.taxCode : taxCode(input.taxCode),
    idNumber:
      keep("idNumber") && current ? current.idNumber : idNumber(input.idNumber),
    bankAccount:
      keep("bankAccount") && current
        ? current.bankAccount
        : optionalText(input.bankAccount),
    bankName:
      keep("bankName") && current
        ? current.bankName
        : optionalText(input.bankName),
    note: keep("note") && current ? current.note : optionalText(input.note),
  };
}

// The CCCD is not searchable: it must not be guessable through search.
const supplierSearchText = (
  values: {
    name: string;
    phone: string | null;
    taxCode: string | null;
  },
  code: string,
) => toSearchText(values.name, code, values.phone, values.taxCode);

export function createSupplier(
  db: Database,
  actor: Actor,
  input: SupplierInput,
): Promise<ServiceResult<SupplierRow>> {
  return runService(async () => {
    const values = supplierValues(input);
    const row = await db.transaction(async (tx) => {
      const code = await nextCode(tx, supplierCodeSeq, CODE_PREFIXES.supplier);
      const [created] = await tx
        .insert(supplier)
        .values({
          ...values,
          code,
          searchText: supplierSearchText(values, code),
          createdBy: actor.id,
          updatedBy: actor.id,
        })
        .returning();
      if (created) {
        await logActivity(tx, actor, {
          action: "CREATE",
          document: { type: "SUPPLIER", id: created.id, code },
          summary: values.name,
        });
      }
      return created;
    });
    return row ? ok(toSupplierRow(row)) : notFound();
  });
}

export function updateSupplier(
  db: Database,
  actor: Actor,
  id: string,
  input: SupplierInput,
): Promise<ServiceResult<SupplierRow>> {
  return runService(async () => {
    const row = await db.transaction(async (tx) => {
      const current = await getSupplierForEdit(tx, id, "update");
      if (!current) return null;
      const values = supplierValues(input, current);
      if (input.status === "ARCHIVED" && current.status === "ACTIVE") {
        // An order on its way would point at a supplier nobody can pick.
        const orders = await openOrderCodesForSupplier(tx, id);
        if (orders.length > 0) {
          throw new ServiceFailure(
            conflict(
              PARTNER_MESSAGES.supplierHasOrders(
                current.code,
                describeOrderCodes(orders),
              ),
            ),
          );
        }
      }
      const [updated] = await tx
        .update(supplier)
        .set({
          ...values,
          searchText: supplierSearchText(values, current.code),
          ...statusSet(input.status),
          updatedBy: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(supplier.id, id))
        .returning();
      if (!updated) return null;
      const changes = diffFields(SUPPLIER_FIELDS, current, updated);
      await logActivity(tx, actor, {
        action: "UPDATE",
        document: { type: "SUPPLIER", id, code: current.code },
        summary: changeSummary(changes),
        changes,
        sensitive: touchesSensitive(SUPPLIER_FIELDS, changes),
      });
      return updated;
    });
    return row ? ok(toSupplierRow(row)) : notFound();
  });
}

export function deleteSupplier(
  db: Database,
  actor: Actor,
  id: string,
): Promise<ServiceResult<null>> {
  return runService(async () => {
    try {
      const found = await db.transaction(async (tx) => {
        const [deleted] = await tx
          .delete(supplier)
          .where(eq(supplier.id, id))
          .returning({ code: supplier.code, name: supplier.name });
        if (!deleted) return false;
        await logActivity(tx, actor, {
          action: "DELETE",
          document: { type: "SUPPLIER", id, code: deleted.code },
          summary: deleted.name,
        });
        return true;
      });
      return found ? ok(null) : notFound();
    } catch (error: unknown) {
      if (isForeignKeyViolation(error)) {
        return conflict(PARTNER_MESSAGES.supplierInUse);
      }
      throw error;
    }
  });
}
