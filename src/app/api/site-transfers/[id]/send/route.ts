// Gửi điện thoại xác nhận: the office, by both contracts (site-operations design D7).
import { z } from "zod";

import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { readJson } from "@/lib/read-json";
import { changeSiteTransferStatus } from "@/lib/site-transfers/service";

type Params = { id: string };

const body = z.object({
  reason: z.string().max(2000).nullable().optional(),
  updatedAt: z.string().max(40).optional(),
});

export const POST = withAuth<Params>(
  async (request, { user, actor, params }) => {
    const input = await readJson(request, body);
    if (!input.ok) return input.response;
    return respond(
      await changeSiteTransferStatus(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        "SEND",
        input.data,
      ),
    );
  },
  { permission: "sales.view" },
);
