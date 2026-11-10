import { z } from "zod";

import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, isUuid, respond } from "@/lib/catalog/respond";
import { anonymizeSupplier } from "@/lib/privacy/anonymize";
import { readJson } from "@/lib/read-json";

const body = z.object({
  confirmCode: z.string().max(50),
  requestedOn: z.string().max(10),
});

/** "Ẩn danh theo yêu cầu" (personal-data-protection D7); cannot be undone. */
export const POST = withAuth<{ id: string }>(
  async (request, { actor, params }) => {
    if (!isUuid(params.id)) return NOT_FOUND();
    const parsed = await readJson(request, body);
    if (!parsed.ok) return parsed.response;
    return respond(
      await anonymizeSupplier(catalogDb(), actor, params.id, parsed.data),
    );
  },
  { permission: "partners.anonymize" },
);
