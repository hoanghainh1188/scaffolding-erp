// Customers (nhà thầu) and suppliers (nhà cung cấp) for D16
// (spec partner-directory, design D1, D5, D7; catalog-extensions D5: sales
// staff in charge).
import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNull,
  sql,
  type SQL,
} from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  customer,
  customerCodeSeq,
  purchaseOrder,
  site,
  supplier,
  supplierCodeSeq,
  supplierPayment,
  user,
} from "@/db/schema";
import {
  CODE_PREFIXES,
  formatSequenceCode,
} from "@/domain/catalog-code-sequence";
import { DomainValueError } from "@/domain/errors";
import {
  PARTNER_FIELD_MESSAGES,
  isValidBankLast4,
  isValidIdNumber,
  isValidTaxCode,
  maskIdNumber,
  normalizePhone,
} from "@/domain/partner-fields";
import {
  CURRENT_NOTICE_VERSION,
  DATA_NOTICE_MESSAGE,
  needsDataNotice,
  renderDataNotice,
  sellerLabel,
} from "@/domain/personal-data";
import { diffFields, touchesSensitive } from "@/domain/activity-changes";
import { changeSummary, joinParts } from "@/domain/activity-summary";
import { PAYABLE_MESSAGES, PAYMENT_TERMS_MAX_DAYS } from "@/domain/payables";
import { toSearchText } from "@/domain/search-text";
import {
  CUSTOMER_FIELDS,
  SUPPLIER_FIELDS,
  SUPPLIER_NOTICE_LABEL,
} from "@/lib/activity/fields";
import { logActivity } from "@/lib/activity/log";
import type { Executor } from "@/lib/auth/credentials";
import { getCompanyProfile } from "@/lib/company/service";
import {
  PiiCipherError,
  decryptIdNumber,
  encryptIdNumber,
} from "@/lib/privacy/cipher";
import { cipherFailure } from "@/lib/privacy/failure";
import { getPiiKeyRing } from "@/lib/privacy/key-ring";

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
  salesUser:
    "Người phụ trách phải là tài khoản Kinh doanh hoặc Giám đốc đang hoạt động",
  supplierAnonymized: "Người bán đã ẩn danh, không sửa hay dùng lại được",
  personHasDocuments:
    "Người bán cá nhân đã có chứng từ nên không đổi sang công ty được",
  companyHasDocuments:
    "Người bán công ty đã có chứng từ nên không đổi sang cá nhân được. Tạo mã nhà cung cấp mới loại Cá nhân",
  supplierHasOrders: (code: string, orders: string) =>
    `${code} còn đơn thu mua đang xử lý: ${orders}. Đóng hoặc hủy đơn trước`,
} as const;

export type PartnerKind = "COMPANY" | "PERSON";

/** Roles that may be in charge of a customer (design D5). */
export const SALES_STAFF_ROLES = ["SALES", "DIRECTOR"] as const;

export interface SalesUser {
  id: string;
  name: string;
  /** false once the account is locked: shown as "Khang (đã khóa)". */
  active: boolean;
}

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

function bankAccountLast4(value: string | null | undefined): string | null {
  const text = optionalText(value);
  if (text !== null && !isValidBankLast4(text)) {
    // A fixed sentence: a pasted full number must not come back or be stored.
    throw new ServiceFailure({
      ok: false,
      status: 422,
      error: PARTNER_FIELD_MESSAGES.bankAccountLast4,
      field: "bankAccountLast4",
    });
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

/** Days a seller lets us owe (payables, 0.2 #99): 0 by default. */
function supplierTerms(value: number | undefined): number {
  const days = value ?? 0;
  if (!Number.isInteger(days) || days < 0 || days > PAYMENT_TERMS_MAX_DAYS) {
    throw new DomainValueError(PAYABLE_MESSAGES.termsRange);
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
  salesUser: SalesUser | null;
  status: CatalogStatus;
  /** Active sites of this customer. */
  siteCount: number;
}

export interface CustomerFilter extends PartnerFilter {
  /** A user id, or "none" for customers nobody is in charge of. */
  sales?: string;
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
  /** null removes the person in charge. */
  salesUserId?: string | null;
  status?: CatalogStatus;
}

/** Active Sales and Director accounts: who can be put in charge. */
export async function listSalesStaff(
  db: Pick<Database, "select">,
): Promise<SalesUser[]> {
  const rows = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(
      and(
        inArray(user.role, [...SALES_STAFF_ROLES]),
        eq(user.status, "ACTIVE"),
      ),
    )
    .orderBy(asc(user.name));
  return rows.map((row) => ({ ...row, active: true }));
}

/**
 * The person put in charge, checked and held FOR SHARE so a lock of that
 * account waits for this change (convention for referenced rows).
 */
async function requireSalesUser(
  tx: Executor,
  id: string,
): Promise<{ id: string; name: string }> {
  const [row] = await tx
    .select({
      id: user.id,
      name: user.name,
      role: user.role,
      status: user.status,
    })
    .from(user)
    .where(eq(user.id, id))
    .for("share");
  if (
    !row ||
    row.status !== "ACTIVE" ||
    !(SALES_STAFF_ROLES as readonly string[]).includes(row.role)
  ) {
    throw new DomainValueError(PARTNER_MESSAGES.salesUser);
  }
  return { id: row.id, name: row.name };
}

async function userName(
  tx: Pick<Database, "select">,
  id: string | null,
): Promise<string | null> {
  if (id === null) return null;
  const [row] = await tx
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, id));
  return row?.name ?? null;
}

export async function listCustomers(
  db: Database,
  filter: CustomerFilter = {},
): Promise<CustomerRow[]> {
  const sites = await db
    .select({ customerId: site.customerId, value: count() })
    .from(site)
    .where(eq(site.status, "ACTIVE"))
    .groupBy(site.customerId);
  const siteCount = new Map(sites.map((row) => [row.customerId, row.value]));
  const conditions = searchConditions(
    filter,
    customer.status,
    customer.searchText,
  );
  if (filter.sales === "none") conditions.push(isNull(customer.salesUserId));
  else if (filter.sales) {
    conditions.push(eq(customer.salesUserId, filter.sales));
  }
  const rows = await db
    .select({
      row: customer,
      salesName: user.name,
      salesStatus: user.status,
    })
    .from(customer)
    .leftJoin(user, eq(user.id, customer.salesUserId))
    .where(and(...conditions))
    .orderBy(asc(customer.name));
  return rows.map(({ row, salesName, salesStatus }) => ({
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
    salesUser:
      row.salesUserId === null
        ? null
        : {
            id: row.salesUserId,
            name: salesName ?? "",
            active: salesStatus === "ACTIVE",
          },
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
      const sales = input.salesUserId
        ? await requireSalesUser(tx, input.salesUserId)
        : null;
      const code = await nextCode(tx, customerCodeSeq, CODE_PREFIXES.customer);
      const [row] = await tx
        .insert(customer)
        .values({
          ...values,
          code,
          salesUserId: sales?.id ?? null,
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
        summary: joinParts(values.name, values.contactName, sales?.name),
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
      // Only a new choice is checked: a person locked after being put in
      // charge stays until someone changes it (spec partner-directory).
      const salesUserId =
        input.salesUserId === undefined
          ? current.salesUserId
          : input.salesUserId;
      if (salesUserId !== null && salesUserId !== current.salesUserId) {
        await requireSalesUser(tx, salesUserId);
      }
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
          salesUserId,
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
      const changes = diffFields(
        CUSTOMER_FIELDS,
        {
          ...current,
          salesUserName: await userName(tx, current.salesUserId),
        },
        {
          ...values,
          salesUserName: await userName(tx, salesUserId),
          status: input.status ?? current.status,
        },
      );
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

/** What everyone may read: never the full CCCD (personal-data-protection). */
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
  /** All that is kept of the account number (0.2 số 157). */
  bankAccountLast4: string | null;
  bankName: string | null;
  /** Days the seller lets us owe; 0 = pay on receipt (0.2 #99). */
  paymentTermsDays: number;
  note: string | null;
  status: CatalogStatus;
  /** Erased on request: no edit, no reuse (design D7). */
  anonymized: boolean;
}

/** The proof that the seller was told (design D6). */
export interface DataNoticeRecord {
  version: number;
  /** ISO instant. */
  at: string;
  byName: string;
}

/** The wording to read to the seller, company filled in from settings. */
export interface DataNoticeText {
  version: number;
  text: string;
}

/** The edit form only, for partners.manage: the full CCCD. */
export interface SupplierEditRow extends SupplierRow {
  idNumber: string | null;
  dataNotice: DataNoticeRecord | null;
  notice: DataNoticeText;
}

export interface SupplierInput {
  kind?: string;
  name?: string;
  phone?: string | null;
  address?: string | null;
  taxCode?: string | null;
  idNumber?: string | null;
  bankAccountLast4?: string | null;
  bankName?: string | null;
  paymentTermsDays?: number;
  note?: string | null;
  status?: CatalogStatus;
  /** "Đã thông báo cho người bán"; who and when come from the server. */
  dataNoticeConfirmed?: boolean;
}

type SupplierRecord = typeof supplier.$inferSelect;

const unprocessable = (error: string, field: string) =>
  ({ ok: false, status: 422, error, field }) as const;

function toSupplierRow(row: SupplierRecord): SupplierRow {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind as PartnerKind,
    name: row.name,
    phone: row.phone,
    address: row.address,
    taxCode: row.taxCode,
    idNumberMasked: row.idNumberLast4 ? maskIdNumber(row.idNumberLast4) : null,
    bankAccountLast4: row.bankAccountLast4,
    bankName: row.bankName,
    paymentTermsDays: row.paymentTermsDays,
    note: row.note,
    status: row.status as CatalogStatus,
    anonymized: row.anonymizedAt !== null,
  };
}

/** runService, plus cipher failures as a fixed sentence (design D12). */
function runSupplierService<T>(
  body: () => Promise<ServiceResult<T>>,
): Promise<ServiceResult<T>> {
  return runService(async () => {
    try {
      return await body();
    } catch (error: unknown) {
      if (error instanceof PiiCipherError) return cipherFailure(error);
      throw error;
    }
  });
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

/** The notice as it reads today, for the create and edit forms. */
export async function currentDataNotice(
  db: Pick<Database, "select" | "insert">,
): Promise<DataNoticeText> {
  const profile = await getCompanyProfile(db);
  return {
    version: CURRENT_NOTICE_VERSION,
    text:
      renderDataNotice(CURRENT_NOTICE_VERSION, {
        companyName: profile.name,
        companyPhone: profile.phone ?? "công ty",
      }) ?? "",
  };
}

/** Edit form data with the CCCD decrypted; callers hold partners.manage. */
export function getSupplierForEdit(
  db: Database,
  id: string,
): Promise<ServiceResult<SupplierEditRow>> {
  return runSupplierService(async () => {
    const [row] = await db.select().from(supplier).where(eq(supplier.id, id));
    if (!row) return notFound();
    if (row.anonymizedAt) return conflict(PARTNER_MESSAGES.supplierAnonymized);
    const noticeBy = await userName(db, row.dataNoticeBy);
    return ok({
      ...toSupplierRow(row),
      idNumber: row.idNumberEnc
        ? decryptIdNumber(row.id, row.idNumberEnc, getPiiKeyRing())
        : null,
      dataNotice:
        row.dataNoticeVersion !== null && row.dataNoticeAt
          ? {
              version: row.dataNoticeVersion,
              at: row.dataNoticeAt.toISOString(),
              byName: noticeBy ?? "",
            }
          : null,
      notice: await currentDataNotice(db),
    });
  });
}

function supplierValues(input: SupplierInput, current?: SupplierRecord) {
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
    bankAccountLast4:
      keep("bankAccountLast4") && current
        ? current.bankAccountLast4
        : bankAccountLast4(input.bankAccountLast4),
    bankName:
      keep("bankName") && current
        ? current.bankName
        : optionalText(input.bankName),
    paymentTermsDays:
      keep("paymentTermsDays") && current
        ? current.paymentTermsDays
        : supplierTerms(input.paymentTermsDays),
    note: keep("note") && current ? current.note : optionalText(input.note),
  };
}

type SupplierValues = ReturnType<typeof supplierValues>;

interface IdNumberColumns {
  columns: {
    idNumberEnc: string | null;
    idNumberLast4: string | null;
    idNumberSavedAt: Date | null;
  };
  /** What the activity log compares; only ever leaves masked. */
  before: string | null;
  after: string | null;
}

/**
 * The CCCD columns after this save. Decrypts only when the request carries
 * a CCCD, and an unchanged number keeps its ciphertext (design D12).
 */
function idNumberColumns(
  supplierId: string,
  input: SupplierInput,
  current?: SupplierRecord,
): IdNumberColumns {
  if (input.idNumber === undefined && current) {
    return {
      columns: {
        idNumberEnc: current.idNumberEnc,
        idNumberLast4: current.idNumberLast4,
        idNumberSavedAt: current.idNumberSavedAt,
      },
      before: current.idNumberLast4,
      after: current.idNumberLast4,
    };
  }
  const next = idNumber(input.idNumber);
  const before = current?.idNumberEnc
    ? decryptIdNumber(supplierId, current.idNumberEnc, getPiiKeyRing())
    : null;
  if (before === next && current) {
    return {
      columns: {
        idNumberEnc: current.idNumberEnc,
        idNumberLast4: current.idNumberLast4,
        idNumberSavedAt: current.idNumberSavedAt,
      },
      before,
      after: next,
    };
  }
  return {
    columns: {
      idNumberEnc:
        next === null
          ? null
          : encryptIdNumber(supplierId, next, getPiiKeyRing()),
      idNumberLast4: next === null ? null : next.slice(-4),
      idNumberSavedAt: next === null ? null : new Date(),
    },
    before,
    after: next,
  };
}

const NOTICE_TRIGGERS = [
  "kind",
  "idNumber",
  "phone",
  "address",
  "bankAccountLast4",
  "bankName",
] as const;

interface NoticeColumns {
  dataNoticeVersion: number | null;
  dataNoticeAt: Date | null;
  dataNoticeBy: string | null;
}

/**
 * The gate of design D6: a save touching personal data of a seller nobody
 * has told yet needs the tick. Old rows are not given a proof, and a save
 * touching none of those fields passes.
 */
function noticeColumns(
  input: SupplierInput,
  values: SupplierValues,
  idLast4: string | null,
  actor: Actor,
  current?: SupplierRecord,
): NoticeColumns {
  const existing: NoticeColumns = {
    dataNoticeVersion: current?.dataNoticeVersion ?? null,
    dataNoticeAt: current?.dataNoticeAt ?? null,
    dataNoticeBy: current?.dataNoticeBy ?? null,
  };
  if (existing.dataNoticeVersion !== null) return existing;
  const needed = needsDataNotice(values.kind, {
    ...values,
    idNumber: idLast4,
  });
  if (!needed) return existing;
  if (input.dataNoticeConfirmed === true) {
    return {
      dataNoticeVersion: CURRENT_NOTICE_VERSION,
      dataNoticeAt: new Date(),
      dataNoticeBy: actor.id,
    };
  }
  if (NOTICE_TRIGGERS.some((field) => input[field] !== undefined)) {
    throw new ServiceFailure(
      unprocessable(DATA_NOTICE_MESSAGE, "dataNoticeConfirmed"),
    );
  }
  return existing;
}

// The CCCD and the account are not searchable: they must not be guessable
// through search.
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
  return runSupplierService(async () => {
    const values = supplierValues(input);
    // Known before the insert: the ciphertext is bound to it (design D1).
    const id = randomUUID();
    const cccd = idNumberColumns(id, input);
    const notice = noticeColumns(
      input,
      values,
      cccd.columns.idNumberLast4,
      actor,
    );
    const row = await db.transaction(async (tx) => {
      const code = await nextCode(tx, supplierCodeSeq, CODE_PREFIXES.supplier);
      const [created] = await tx
        .insert(supplier)
        .values({
          id,
          ...values,
          ...cccd.columns,
          ...notice,
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
          summary: joinParts(
            sellerLabel({ kind: values.kind, code, name: values.name }),
            notice.dataNoticeVersion === null
              ? null
              : `${SUPPLIER_NOTICE_LABEL} phiên bản ${notice.dataNoticeVersion}`,
          ),
        });
      }
      return created;
    });
    return row ? ok(toSupplierRow(row)) : notFound();
  });
}

/**
 * A company is written by name into append-only tables and cannot be erased,
 * so a person with documents stays a person (0.2 số 170), and a company with
 * documents stays a company: its name already sits where erasure cannot
 * reach (0.2 số 171). The supplier row is locked by the caller; new orders
 * take it FOR SHARE and wait.
 */
async function assertNoDocuments(
  tx: Executor,
  id: string,
  message: string,
): Promise<void> {
  const [[order], [payment]] = await Promise.all([
    tx
      .select({ id: purchaseOrder.id })
      .from(purchaseOrder)
      .where(eq(purchaseOrder.supplierId, id))
      .limit(1),
    tx
      .select({ id: supplierPayment.id })
      .from(supplierPayment)
      .where(eq(supplierPayment.supplierId, id))
      .limit(1),
  ]);
  if (order || payment) {
    throw new ServiceFailure(conflict(message));
  }
}

export function updateSupplier(
  db: Database,
  actor: Actor,
  id: string,
  input: SupplierInput,
): Promise<ServiceResult<SupplierRow>> {
  return runSupplierService(async () => {
    const row = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(supplier)
        .where(eq(supplier.id, id))
        .for("update");
      if (!current) return null;
      if (current.anonymizedAt) {
        throw new ServiceFailure(conflict(PARTNER_MESSAGES.supplierAnonymized));
      }
      const values = supplierValues(input, current);
      if (current.kind !== values.kind) {
        await assertNoDocuments(
          tx,
          id,
          current.kind === "PERSON"
            ? PARTNER_MESSAGES.personHasDocuments
            : PARTNER_MESSAGES.companyHasDocuments,
        );
      }
      const cccd = idNumberColumns(id, input, current);
      const notice = noticeColumns(
        input,
        values,
        cccd.columns.idNumberLast4,
        actor,
        current,
      );
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
          ...cccd.columns,
          ...notice,
          searchText: supplierSearchText(values, current.code),
          ...statusSet(input.status),
          updatedBy: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(supplier.id, id))
        .returning();
      if (!updated) return null;
      const changes = diffFields(
        SUPPLIER_FIELDS,
        { ...current, idNumber: cccd.before },
        { ...updated, idNumber: cccd.after },
      );
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
          .returning({
            code: supplier.code,
            name: supplier.name,
            kind: supplier.kind,
          });
        if (!deleted) return false;
        await logActivity(tx, actor, {
          action: "DELETE",
          document: { type: "SUPPLIER", id, code: deleted.code },
          summary: sellerLabel(deleted),
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
