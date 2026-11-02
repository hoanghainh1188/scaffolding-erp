// Shared pieces of the contract services (contracts design D8, D14).
import type { Database } from "@/db/client";
import type { ContractType } from "@/domain/contract";
import { DomainValueError } from "@/domain/errors";
import {
  can,
  canContract,
  type ContractAction,
  type ContractScope,
} from "@/domain/permissions";
import {
  conflict,
  ServiceFailure,
  type Actor,
  type ServiceResult,
} from "@/lib/catalog/common";

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** The actor plus the scope of their account, read with the request. */
export type ContractActor = Actor & { contractScope: ContractScope };

export const FORBIDDEN_MESSAGE = "Bạn không có quyền thực hiện thao tác này";

export const forbidden = () =>
  ({ ok: false, status: 403, error: FORBIDDEN_MESSAGE }) as const;

/** A rule broken by one form field: answered 422 with the field. */
export class ContractFieldError extends DomainValueError {
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.field = field;
  }
}

/** Field errors answer 422, ServiceFailure its result, other rules 409. */
export async function run<T>(
  body: () => Promise<ServiceResult<T>>,
): Promise<ServiceResult<T>> {
  try {
    return await body();
  } catch (error: unknown) {
    if (error instanceof ServiceFailure) return error.result;
    if (error instanceof ContractFieldError) {
      return {
        ok: false,
        status: 422,
        error: error.message,
        field: error.field,
      };
    }
    if (error instanceof DomainValueError) return conflict(error.message);
    throw error;
  }
}

/** canContract on the server side: 403 and nothing written otherwise. */
export function assertContractAccess(
  actor: ContractActor,
  type: ContractType,
  action: ContractAction,
): void {
  if (!canContract(actor, type, action)) {
    throw new ServiceFailure(forbidden());
  }
}

/** Only the director approves, returns and cancels an approved contract. */
export function assertApprover(actor: ContractActor): void {
  if (!can(actor.role, "contracts.approve")) {
    throw new ServiceFailure(forbidden());
  }
}
