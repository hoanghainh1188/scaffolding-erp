import { parseActivityFilter } from "@/domain/activity-filter";
import { toBusinessDate } from "@/domain/business-date";
import { activityOverview, listActivity } from "@/lib/activity/queries";
import { fail, ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";

/**
 * D18 (activity-log design D9): the first page with tiles and days, or with
 * `cursor` the next page of "Xem thêm". Read only: no route writes the log.
 */
export const GET = withAuth(
  async (request) => {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = parseActivityFilter(params, toBusinessDate(new Date()));
    if (!parsed.ok) return fail(parsed.error, 400);
    const db = catalogDb();
    return ok(
      params.cursor
        ? await listActivity(db, parsed.filter, params.cursor)
        : await activityOverview(db, parsed.filter),
    );
  },
  { permission: "activity.view" },
);
