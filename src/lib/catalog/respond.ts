// Shared bits of the /api/catalog routes (master-data design D12).
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { fail, ok } from "@/lib/api-response";

import {
  CATALOG_STATUSES,
  type CatalogStatus,
  type ServiceResult,
} from "./common";

export const catalogDb = getDatabase;

/** Envelope for a service result. */
export function respond<T>(result: ServiceResult<T>, status = 200): Response {
  return result.ok
    ? ok(result.data, status)
    : fail(result.error, result.status);
}

/** ?status=archived lists archived rows; anything else lists active ones. */
export function statusParam(url: URL): CatalogStatus {
  return url.searchParams.get("status")?.toUpperCase() === "ARCHIVED"
    ? "ARCHIVED"
    : "ACTIVE";
}

export function textParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name)?.trim();
  return value ? value : undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A route id that is not a uuid can never match; answer 404 early. */
export function isUuid(value: string | undefined): value is string {
  return value !== undefined && UUID.test(value);
}

export const NOT_FOUND = () => fail("Không tìm thấy bản ghi", 404);

// Field shapes only: the services hold the business rules and messages.
const text = z.string().max(2000);
const nullableText = text.nullable();
const money = z.number().nullable();

export const statusField = z.enum(CATALOG_STATUSES);

export const itemBody = z.object({
  code: text.optional(),
  name: text.optional(),
  groupId: text.optional(),
  unit: z
    .enum(["PIECE", "KG"], { error: "Chọn đơn vị cái hoặc kg" })
    .optional(),
  standardWeightKg: z.string().max(20).nullable().optional(),
  dailyRentalPrice: money.optional(),
  lostPrice: money.optional(),
  damagePrice: money.optional(),
  status: statusField.optional(),
});

export const groupBody = z.object({
  name: text.optional(),
  sortOrder: z.number().int().optional(),
  status: statusField.optional(),
});

export const kitBody = z.object({
  code: text.optional(),
  name: text.optional(),
  components: z
    .array(z.object({ itemId: z.string(), quantity: z.number() }))
    .max(100)
    .optional(),
  status: statusField.optional(),
});

export const customerBody = z.object({
  kind: text.optional(),
  name: text.optional(),
  taxCode: nullableText.optional(),
  contactName: nullableText.optional(),
  phone: nullableText.optional(),
  address: nullableText.optional(),
  paymentTermsDays: z.number().optional(),
  note: nullableText.optional(),
  status: statusField.optional(),
});

export const supplierBody = z.object({
  kind: text.optional(),
  name: text.optional(),
  phone: nullableText.optional(),
  address: nullableText.optional(),
  taxCode: nullableText.optional(),
  idNumber: nullableText.optional(),
  bankAccount: nullableText.optional(),
  bankName: nullableText.optional(),
  note: nullableText.optional(),
  status: statusField.optional(),
});

export const siteBody = z.object({
  name: text.optional(),
  address: nullableText.optional(),
  customerId: text.optional(),
  status: statusField.optional(),
});

export const locationBody = z.object({
  code: text.optional(),
  name: text.optional(),
  type: text.optional(),
  status: statusField.optional(),
});
