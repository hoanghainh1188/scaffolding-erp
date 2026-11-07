import { z } from "zod";

import { withAuth } from "@/lib/auth/guard";
import { setRepairLaborRate } from "@/lib/catalog/items";
import { NOT_FOUND, catalogDb, isUuid, respond } from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";

type Params = { id: string };

const body = z.object({
  repairLaborRate: z.number().nullable(),
});

/** Piece-rate labour of a repair (0.2 số 117, số 123): accountant, director. */
export const PUT = withAuth<Params>(
  async (request, { actor, params }) => {
    if (!isUuid(params.id)) return NOT_FOUND();
    const parsed = await readJson(request, body);
    if (!parsed.ok) return parsed.response;
    return respond(
      await setRepairLaborRate(
        catalogDb(),
        actor,
        params.id,
        parsed.data.repairLaborRate,
      ),
    );
  },
  { permission: "repairs.manage" },
);
