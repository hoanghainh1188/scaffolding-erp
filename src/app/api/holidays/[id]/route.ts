// Edit or delete a holiday (director: holidays.manage).
import { withAuth } from "@/lib/auth/guard";
import { holidayBody, updatedAtBody } from "@/lib/billing/respond";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { deleteHoliday, updateHoliday } from "@/lib/holidays/service";
import { readJson } from "@/lib/read-json";

type Params = { id: string };

export const PUT = withAuth<Params>(
  async (request, { actor, params }) => {
    const body = await readJson(request, holidayBody);
    if (!body.ok) return body.response;
    return respond(
      await updateHoliday(catalogDb(), actor, params.id, body.data),
    );
  },
  { permission: "holidays.manage" },
);

export const DELETE = withAuth<Params>(
  async (request, { actor, params }) => {
    const body = await readJson(request, updatedAtBody);
    if (!body.ok) return body.response;
    return respond(
      await deleteHoliday(catalogDb(), actor, params.id, body.data),
    );
  },
  { permission: "holidays.manage" },
);
