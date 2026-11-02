// Shared bits of the /api/contracts routes and pages (contracts design
// D14). Field shapes only: the services hold the rules and the messages.
import { z } from "zod";

import {
  CONTRACT_GROUPS,
  CONTRACT_TYPES,
  type ContractGroup,
  type ContractType,
} from "@/domain/contract";
import type { ActivityActor } from "@/lib/activity/actor";
import type { CurrentUser } from "@/lib/auth/session";

import type { ContractActor } from "./common";
import type { ContractFilter } from "./list";

const text = z.string().max(2000);
const id = z.string().max(40);
const money = z.number().nullable();
const quantity = z.string().max(30);

const termsShape = {
  signedDate: z.string().max(10).nullable().optional(),
  startDate: z.string().max(10).optional(),
  endDate: z.string().max(10).nullable().optional(),
  minRentalDays: z.number().nullable().optional(),
  paymentTermsDays: z.number().optional(),
  vatEnabled: z.boolean().optional(),
  vatRate: z
    .union([z.string().max(10), z.number()])
    .nullable()
    .optional(),
  companyTruck: z.boolean().optional(),
  freightPerTrip: money.optional(),
  note: text.nullable().optional(),
};

const contentShape = {
  kits: z
    .array(z.object({ kitId: id.optional(), quantity: z.number().optional() }))
    .max(100)
    .optional(),
  lines: z
    .array(
      z.object({
        itemId: id.optional(),
        condition: z.string().max(20).nullable().optional(),
        pricingUnit: z.string().max(10).optional(),
        quantity: quantity.optional(),
        price: money.optional(),
      }),
    )
    .max(400)
    .optional(),
  compensations: z
    .array(
      z.object({
        itemId: id.optional(),
        lostPrice: money.optional(),
        damagePrice: money.optional(),
      }),
    )
    .max(400)
    .optional(),
  refreshCompensation: z.boolean().optional(),
  deposits: z
    .array(
      z.object({
        kind: z.string().max(20).optional(),
        amount: z.number().optional(),
        method: z.string().max(20).nullable().optional(),
        bankName: text.nullable().optional(),
        guaranteeNumber: text.nullable().optional(),
        expiryDate: z.string().max(10).nullable().optional(),
      }),
    )
    .max(20)
    .optional(),
  batches: z
    .array(
      z.object({
        plannedDate: z.string().max(10).optional(),
        note: text.nullable().optional(),
        lines: z
          .array(
            z.object({
              kitId: id.nullable().optional(),
              itemId: id.nullable().optional(),
              quantity: quantity.optional(),
            }),
          )
          .max(100)
          .optional(),
      }),
    )
    .max(40)
    .optional(),
};

export const contractBody = z.object({
  type: z.string().max(10).optional(),
  customerId: id.optional(),
  siteId: id.nullable().optional(),
  customerToken: z.string().max(100).nullable().optional(),
  updatedAt: z.string().max(40).optional(),
  ...termsShape,
  ...contentShape,
});

export const amendmentBody = contractBody.extend({
  effectiveFrom: z.string().max(10).optional(),
  reason: text.nullable().optional(),
});

export const reasonBody = z.object({ reason: text.nullable().optional() });

/** The actor of a request with the scope of their account (0.2 #51). */
export function contractActor(
  user: Pick<CurrentUser, "contractScope">,
  actor: ActivityActor,
): ContractActor {
  return { ...actor, contractScope: user.contractScope };
}

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function read(params: Params, name: string): string | undefined {
  const value =
    params instanceof URLSearchParams ? params.get(name) : params[name];
  const one = Array.isArray(value) ? value[0] : value;
  return one?.trim() ? one.trim() : undefined;
}

/** D4 filters from the URL: group, type, customer, site, seller, q, page. */
export function contractFilterFrom(params: Params): ContractFilter {
  const group = read(params, "group");
  const type = read(params, "type");
  const page = Number(read(params, "page") ?? "1");
  return {
    group: (CONTRACT_GROUPS as readonly string[]).includes(group ?? "")
      ? (group as ContractGroup)
      : "all",
    ...((CONTRACT_TYPES as readonly string[]).includes(type ?? "")
      ? { type: type as ContractType }
      : {}),
    ...(read(params, "customerId")
      ? { customerId: read(params, "customerId") }
      : {}),
    ...(read(params, "siteId") ? { siteId: read(params, "siteId") } : {}),
    ...(read(params, "salesUserId")
      ? { salesUserId: read(params, "salesUserId") }
      : {}),
    ...(read(params, "q") ? { q: read(params, "q") } : {}),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}
