import { z } from "zod";

import { fail, ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";
import { listRepairOrders } from "@/lib/repairs/queries";
import {
  isSimpleSlipBody,
  repairBody,
  repairStatusFrom,
  workOrderBody,
} from "@/lib/repairs/respond";
import { createWorkOrder } from "@/lib/repairs/work-orders";
import { WORK_ORDER_MESSAGES } from "@/domain/repair-work-order";

// Office roles read; the director and the accountant draft (design D4).
export const GET = withAuth(
  async (request) => {
    const status = repairStatusFrom(
      new URL(request.url).searchParams.get("status"),
    );
    return ok(await listRepairOrders(catalogDb(), { status }));
  },
  { permission: "repairs.view" },
);

/** Either shape parses, so a simple slip can be told apart and refused. */
const createBody = workOrderBody.extend({
  toLocationId: repairBody.shape.toLocationId,
  repairDate: repairBody.shape.repairDate,
  lines: z
    .array(
      z.object({
        itemId: z.string().max(40).optional(),
        quantityTaken: z.string().max(30).optional(),
        quantityGood: z.string().max(30).optional(),
        quantityScrap: z.string().max(30).optional(),
        repairCost: z.number().optional(),
      }),
    )
    .max(200)
    .optional(),
});

/** A new repair is a work order (0.2 số 121): simple slips are refused. */
export const POST = withAuth(
  async (request, { actor }) => {
    const body = await readJson(request, createBody);
    if (!body.ok) return body.response;
    if (isSimpleSlipBody(body.data)) {
      return fail(WORK_ORDER_MESSAGES.simpleClosed, 422);
    }
    return respond(await createWorkOrder(catalogDb(), actor, body.data), 201);
  },
  { permission: "repairs.manage" },
);
