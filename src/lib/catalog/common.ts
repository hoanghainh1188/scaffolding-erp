// Shared pieces of the catalog services (master-data design D7, D12).
import { DomainValueError } from "@/domain/errors";
import type { ActivityActor } from "@/lib/activity/actor";

export type CatalogStatus = "ACTIVE" | "ARCHIVED";

export const CATALOG_STATUSES = ["ACTIVE", "ARCHIVED"] as const;

/**
 * Who makes the change: their id goes into created_by / updated_by, and the
 * whole actor into the activity log (activity-log design D4).
 */
export type Actor = ActivityActor;

export type ServiceResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      status: 400 | 403 | 404 | 409 | 413 | 422 | 500;
      error: string;
      /** The form field the error belongs to ("lines.0.quantity"). */
      field?: string;
      /** Extra data a client acts on (`PHOTOS_EXPIRED` and its photo ids). */
      details?: Readonly<Record<string, unknown>>;
    };

export const COMMON_MESSAGES = {
  notFound: "Không tìm thấy bản ghi",
  name: "Nhập tên",
  nameTooLong: (max: number) => `Tên dài tối đa ${max} ký tự`,
  codeTaken: "Mã này đã được dùng",
} as const;

export const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
export const badRequest = (error: string) =>
  ({ ok: false, status: 400, error }) as const;
export const notFound = () =>
  ({ ok: false, status: 404, error: COMMON_MESSAGES.notFound }) as const;
export const conflict = (error: string) =>
  ({ ok: false, status: 409, error }) as const;

/** Thrown inside a transaction to roll it back with a ready answer. */
export class ServiceFailure extends Error {
  readonly result: Extract<ServiceResult<never>, { ok: false }>;

  constructor(result: Extract<ServiceResult<never>, { ok: false }>) {
    super(result.error);
    this.result = result;
  }
}

function pgCode(error: unknown): unknown {
  return (error as { cause?: { code?: unknown } } | null)?.cause?.code;
}

/** Postgres 23503: a row still refers to the one being deleted. */
export function isForeignKeyViolation(error: unknown): boolean {
  return pgCode(error) === "23503";
}

export function isUniqueViolation(error: unknown): boolean {
  return pgCode(error) === "23505";
}

/**
 * Runs a service body and turns domain errors (bad input) into 400 and
 * ServiceFailure into its result. Anything else is a real error.
 */
export async function runService<T>(
  body: () => Promise<ServiceResult<T>>,
): Promise<ServiceResult<T>> {
  try {
    return await body();
  } catch (error: unknown) {
    if (error instanceof ServiceFailure) return error.result;
    if (error instanceof DomainValueError) return badRequest(error.message);
    throw error;
  }
}

/** Trimmed required text, 1..max characters. */
export function requireName(value: string | undefined, max = 200): string {
  const name = (value ?? "").trim();
  if (name === "") throw new DomainValueError(COMMON_MESSAGES.name);
  if (name.length > max) {
    throw new DomainValueError(COMMON_MESSAGES.nameTooLong(max));
  }
  return name;
}

/** Trimmed optional text; empty becomes null. */
export function optionalText(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
}

export function archivedAt(status: CatalogStatus): Date | null {
  return status === "ARCHIVED" ? new Date() : null;
}
