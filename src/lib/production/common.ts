// Shared pieces of the production services (production-orders design D10).
import { eq } from "drizzle-orm";

import { productionOrder } from "@/db/schema";
import { DomainValueError } from "@/domain/errors";
import { ProductionFieldError } from "@/domain/production-bom";
import {
  PRODUCTION_MESSAGES,
  ProductionStateError,
  transition,
  type ProductionStatus,
  type ProductionStep,
} from "@/domain/production-order";
import {
  conflict,
  notFound,
  ServiceFailure,
  type ServiceResult,
} from "@/lib/catalog/common";
import type { Tx } from "@/lib/inventory/post";

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SteppedProductionOrder {
  code: string;
  status: ProductionStatus;
  updatedAt: Date;
}

/** Domain errors of a production service, as API answers. */
export async function runProduction<T>(
  body: () => Promise<ServiceResult<T>>,
): Promise<ServiceResult<T>> {
  try {
    return await body();
  } catch (error: unknown) {
    if (error instanceof ServiceFailure) return error.result;
    if (error instanceof ProductionStateError) {
      return { ok: false, status: 409, error: error.message };
    }
    if (error instanceof ProductionFieldError) {
      return {
        ok: false,
        status: 422,
        error: error.message,
        field: error.field,
      };
    }
    if (error instanceof DomainValueError) {
      return { ok: false, status: 400, error: error.message };
    }
    throw error;
  }
}

/** Locks an order by code, or 404. */
export async function lockProductionOrder(tx: Tx, code: string) {
  const [row] = await tx
    .select()
    .from(productionOrder)
    .where(eq(productionOrder.code, code))
    .for("update");
  if (!row) throw new ServiceFailure(notFound());
  return row;
}

/** 409 when someone changed the order since the user opened it. */
export function assertFresh(
  current: { updatedAt: Date },
  seen: string | undefined,
): void {
  const time = seen ? new Date(seen).getTime() : NaN;
  if (time !== current.updatedAt.getTime()) {
    throw new ServiceFailure(conflict(PRODUCTION_MESSAGES.stale));
  }
}

/** The status after the step, or 409 (ProductionStateError). */
export function stepOf(
  current: { status: string },
  step: ProductionStep,
  options: { overuse?: boolean } = {},
): ProductionStatus {
  return transition(current.status as ProductionStatus, step, options);
}
