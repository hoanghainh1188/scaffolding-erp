// Shared bits of the /api/billing and /api/holidays routes (rental-billing
// design D10, D12). Field shapes and the reading check of a sales account;
// the services hold the rules and the messages.
import { z } from "zod";

import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import { canContract, type ContractScope } from "@/domain/permissions";
import { periodOf } from "@/domain/rental-billing";
import type { Role } from "@/domain/role";
import { fail } from "@/lib/api-response";

export const BILLING_VIEW_MESSAGES = {
  saleOnly:
    "Tài khoản của bạn chỉ làm hợp đồng bán nên không xem được tiền thuê.",
} as const;

/** 403 for an account that may not read rental contracts (0.2 #51). */
export function rentalReadRefusal(user: {
  role: Role;
  contractScope: ContractScope;
}): Response | null {
  return canContract(user, "RENTAL", "view")
    ? null
    : fail(BILLING_VIEW_MESSAGES.saleOnly, 403);
}

/** "2027-02" from the route, or a 400 answer. */
export function monthParam(
  value: string,
): { ok: true; month: string } | { ok: false; response: Response } {
  try {
    return { ok: true, month: periodOf(value).month };
  } catch (error: unknown) {
    return {
      ok: false,
      response: fail(error instanceof Error ? error.message : "", 400),
    };
  }
}

/** Today in Vietnam (0.2 #55). */
export const businessToday = (): BusinessDate => toBusinessDate(new Date());

export const closeBody = z.object({ expectedTotal: z.number().optional() });

export const adjustmentBody = z.object({
  contractId: z.string().max(40).optional(),
  month: z.string().max(7).optional(),
  refMonth: z.string().max(7).optional(),
  amount: z.number().optional(),
  reason: z.string().max(2000).optional(),
  updatedAt: z.string().max(40).optional(),
});

export const holidayBody = z.object({
  name: z.string().max(500).optional(),
  startDate: z.string().max(10).optional(),
  endDate: z.string().max(10).optional(),
  updatedAt: z.string().max(40).optional(),
});

export const updatedAtBody = z.object({
  updatedAt: z.string().max(40).optional(),
});
