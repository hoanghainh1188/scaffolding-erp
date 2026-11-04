// Holidays without rent: read by billing.view, written by the director.
import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { holidayBody } from "@/lib/billing/respond";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { holidaysOfYear } from "@/lib/holidays/queries";
import { createHoliday } from "@/lib/holidays/service";
import { readJson } from "@/lib/read-json";

export const GET = withAuth(
  async (request) => {
    const year = Number(new URL(request.url).searchParams.get("year"));
    const pick =
      Number.isInteger(year) && year >= 2000 && year <= 2100
        ? year
        : new Date().getUTCFullYear();
    return ok(await holidaysOfYear(catalogDb(), pick));
  },
  { permission: "billing.view" },
);

export const POST = withAuth(
  async (request, { actor }) => {
    const body = await readJson(request, holidayBody);
    if (!body.ok) return body.response;
    return respond(await createHoliday(catalogDb(), actor, body.data), 201);
  },
  { permission: "holidays.manage" },
);
